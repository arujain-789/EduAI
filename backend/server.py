import sys
import json
import traceback
import os
import re
import logging
from time import time
from pathlib import Path
from tempfile import NamedTemporaryFile
from concurrent.futures import ThreadPoolExecutor
import signal
import gc
import torch
from tenacity import retry, stop_after_attempt, wait_exponential
from google.cloud import storage
import requests
import io

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.document_loaders import PyPDFLoader
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from pdf2image import convert_from_path
from google.cloud import vision
from datetime import timedelta

FIXED_PROMPT = """You are a teacher grading an assignment. 
1. Provide constructive feedback on student work
2. Assign marks out of 100 (format: 'Marks: XX/100')
3. Focus on key strengths and areas for improvement
4. Be professional yet encouraging"""

class Config:
    MAX_TEXT_LENGTH = 15000
    PROCESS_TIMEOUT = 50
    OCR_TIMEOUT = 25
    MIN_TEXT_LENGTH = 100
    MAX_PAGES = 200
    EMBEDDING_MODEL = "all-MiniLM-L6-v2"
    GEMINI_MODEL = "gemini-pro"

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('pdf_processor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

from google.oauth2 import service_account

def timeout_handler(signum, frame):
    raise TimeoutException("Processing timed out")

class PDFProcessingError(Exception):
    def __init__(self, message, error_type, details=None):
        self.message = message
        self.error_type = error_type
        self.details = details
        super().__init__(message)

class TimeoutException(Exception):
    pass

def download_pdf_gcs(bucket_name, blob_name):
    creds_dict = json.loads(os.environ['GCS_CREDENTIALS'])
    credentials = service_account.Credentials.from_service_account_info(creds_dict)
    client = storage.Client(credentials=credentials)
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    return blob.download_as_bytes()

class PDFProcessor:
    _embedding_model = None

    def __init__(self):
        self.start_time = time()
        self.temp_files = []
        self.config = Config()
        self.validate_environment()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.cleanup()

    def validate_environment(self):
        if not os.getenv("GEMINI_API_KEY"):
            raise EnvironmentError("GEMINI_API_KEY not set")
        if not os.getenv("GCS_CREDENTIALS"):
            logger.warning("GCS_CREDENTIALS not set - OCR may fail")

    def cleanup(self):
        for filepath in self.temp_files:
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
            except Exception as e:
                logger.error(f"Cleanup error: {str(e)}")
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    @classmethod
    def get_embeddings(cls):
        if cls._embedding_model is None:
            cls._embedding_model = HuggingFaceEmbeddings(
                model_name=Config.EMBEDDING_MODEL,
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
        return cls._embedding_model

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def download_pdf(self, url):
        response = requests.get(url, timeout=10, headers={
            'User-Agent': 'EduAI-PDF-Processor/1.0',
            'Accept': 'application/pdf'
        })
        response.raise_for_status()
        return response.content

    def extract_text(self, pdf_path):
        try:
            loader = PyPDFLoader(pdf_path)
            pages = loader.load_and_split()
            text = "\n".join([p.page_content for p in pages])
            if len(text.strip()) >= self.config.MIN_TEXT_LENGTH:
                return text[:self.config.MAX_TEXT_LENGTH]
        except Exception:
            pass
        return self.extract_text_with_ocr(pdf_path)

    def extract_text_with_ocr(self, pdf_path):
        images = convert_from_path(pdf_path, first_page=1, last_page=self.config.MAX_PAGES - 1)
        client = vision.ImageAnnotatorClient()
        extracted_text = []

        def process_image(img):
            try:
                with io.BytesIO() as img_buffer:
                    img.save(img_buffer, format='JPEG', quality=85)
                    content = img_buffer.getvalue()
                    signal.signal(signal.SIGALRM, timeout_handler)
                    signal.alarm(self.config.OCR_TIMEOUT)
                    try:
                        image = vision.Image(content=content)
                        response = client.text_detection(image=image)
                        return response.text_annotations[0].description if response.text_annotations else ""
                    finally:
                        signal.alarm(0)
            except:
                return ""

        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(process_image, images))
        full_text = "\n".join(filter(None, results))
        return full_text[:self.config.MAX_TEXT_LENGTH]

    def process_with_ai(self, text):
        try:
            signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(self.config.PROCESS_TIMEOUT)

            if not text or len(text.strip()) < self.config.MIN_TEXT_LENGTH:
                raise ValueError("Insufficient text for processing")

            processed_text = text.strip()
            if len(processed_text) > self.config.MAX_TEXT_LENGTH:
                processed_text = processed_text[:self.config.MAX_TEXT_LENGTH]

            embeddings = self.get_embeddings()
            db = FAISS.from_texts([processed_text], embeddings)
            docs = db.similarity_search(FIXED_PROMPT, k=3)
            context = "\n".join([doc.page_content for doc in docs])

            llm = ChatGoogleGenerativeAI(
                model=self.config.GEMINI_MODEL,
                api_key=os.getenv("GEMINI_API_KEY"),
                temperature=0.3
            )

            prompt = f"""Context from student work:
{context}

Instruction for grader:
{FIXED_PROMPT}

Please provide:
1. Detailed feedback
2. Numerical grade (Marks: XX/100)
3. Key recommendations"""

            result = llm.invoke(prompt)
            return self._parse_ai_response(result.content)

        finally:
            signal.alarm(0)

    def _parse_ai_response(self, response_text):
        marks_match = re.search(r"Marks:\s*(\d{1,3})/100", response_text, re.IGNORECASE)
        if not marks_match:
            raise ValueError("Marks not found")
        marks = marks_match.group(1)
        feedback = re.sub(r"Marks:\s*\d{1,3}/100\s*", "", response_text, flags=re.IGNORECASE).strip()
        return {
            "marks": f"{marks}/100",
            "feedback": feedback,
            "processing_time": round(time() - self.start_time, 2)
        }

def main():
    try:
        if len(sys.argv) < 2:
            raise ValueError("Usage: python script.py <pdf_path_or_url> [output_file]")

        input_path_or_url = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None

        with PDFProcessor() as processor:
            if input_path_or_url.startswith("gs://"):
                match = re.match(r"gs://([^/]+)/(.+)", input_path_or_url)
                bucket_name, blob_name = match.groups()
                pdf_bytes = download_pdf_gcs(bucket_name, blob_name)
                with NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                    tmp.write(pdf_bytes)
                    pdf_path = tmp.name
                    processor.temp_files.append(pdf_path)
            elif input_path_or_url.startswith("http"):
                pdf_bytes = processor.download_pdf(input_path_or_url)
                with NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                    tmp.write(pdf_bytes)
                    pdf_path = tmp.name
                    processor.temp_files.append(pdf_path)
            elif os.path.isfile(input_path_or_url):
                pdf_path = input_path_or_url
            else:
                raise ValueError("Invalid input path")

            extracted_text = processor.extract_text(pdf_path)
            result = processor.process_with_ai(extracted_text)

            output = json.dumps(result, indent=2)
            if output_file:
                with open(output_file, 'w') as f:
                    f.write(output)
            print(output)
            return 0

    except PDFProcessingError as e:
        print(json.dumps({"error": e.message, "type": e.error_type, "details": e.details, "traceback": traceback.format_exc(), "timestamp": time()}))
        return 1
    except Exception as e:
        print(json.dumps({"error": str(e), "type": type(e).__name__, "traceback": traceback.format_exc(), "timestamp": time()}))
        return 2

if __name__ == "__main__":
    sys.exit(main())
