#!/usr/bin/env python3
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

# Third-party imports
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.document_loaders import PyPDFLoader
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from pdf2image import convert_from_path
from google.cloud import vision
import requests

# =====================
# Configuration
# =====================
FIXED_PROMPT = """You are a teacher grading an assignment. 
1. Provide constructive feedback on student work
2. Assign marks out of 100 (format: 'Marks: XX/100')
3. Focus on key strengths and areas for improvement
4. Be professional yet encouraging"""

class Config:
    MAX_TEXT_LENGTH = 15000  # Truncate longer texts to prevent API overload
    PROCESS_TIMEOUT = 50     # Seconds for entire AI processing
    OCR_TIMEOUT = 25         # Seconds per OCR page
    MIN_TEXT_LENGTH = 100    # Minimum viable text characters
    MAX_PAGES = 200          # Maximum pages to process
    EMBEDDING_MODEL = "all-MiniLM-L6-v2"
    GEMINI_MODEL = "gemini-pro"

# =====================
# Logging Setup
# =====================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('pdf_processor.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# =====================
# Custom Exceptions
# =====================
class PDFProcessingError(Exception):
    """Custom exception for processing failures"""
    def __init__(self, message, error_type, details=None):
        self.message = message
        self.error_type = error_type
        self.details = details
        super().__init__(message)

class TimeoutException(Exception):
    """Exception for process timeouts"""
    pass

# =====================
# Timeout Handler
# =====================
def timeout_handler(signum, frame):
    raise TimeoutException("Processing timed out")

# =====================
# Main Processor Class
# =====================
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
        """Verify required environment variables"""
        if not os.getenv("GEMINI_API_KEY"):
            raise EnvironmentError("GEMINI_API_KEY environment variable not set")
        
        # Verify Google Cloud credentials if OCR might be used
        if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
            logger.warning("Google Cloud credentials not set - OCR may fail")

    def cleanup(self):
        """Remove all temporary files and clean up resources"""
        for filepath in self.temp_files:
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
                    logger.debug(f"Cleaned up temp file: {filepath}")
            except Exception as e:
                logger.error(f"Error cleaning up {filepath}: {str(e)}")
        
        # Force garbage collection
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    @classmethod
    def get_embeddings(cls):
        """Get cached embeddings model with lazy loading"""
        if cls._embedding_model is None:
            try:
                cls._embedding_model = HuggingFaceEmbeddings(
                    model_name=cls.Config.EMBEDDING_MODEL,
                    model_kwargs={'device': 'cpu'},  # Force CPU to save memory
                    encode_kwargs={'normalize_embeddings': True}
                )
                logger.info("Embeddings model loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load embeddings: {str(e)}")
                raise PDFProcessingError(
                    message="Embeddings initialization failed",
                    error_type="MODEL_ERROR",
                    details=str(e)
                )
        return cls._embedding_model

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    def download_pdf(self, url):
        """Download PDF from URL with safety checks"""
        try:
            logger.info(f"Downloading PDF from {url}")
            
            # Security checks
            if not url.startswith(('http://', 'https://')):
                raise ValueError("Invalid URL scheme")
            if len(url) > 512:
                raise ValueError("URL too long")

            response = requests.get(
                url,
                timeout=10,
                headers={
                    'User-Agent': 'EduAI-PDF-Processor/1.0',
                    'Accept': 'application/pdf'
                }
            )
            response.raise_for_status()
            
            content_type = response.headers.get('Content-Type', '')
            if 'application/pdf' not in content_type:
                raise ValueError(f"Unexpected content type: {content_type}")
                
            if len(response.content) > self.config.MAX_TEXT_LENGTH:
                raise ValueError("PDF file too large")
                
            return response.content
        except requests.exceptions.RequestException as e:
            raise PDFProcessingError(
                message="PDF download failed",
                error_type="NETWORK_ERROR",
                details=str(e)
            )

    def extract_text(self, pdf_path):
        """Extract text with PyPDF fallback to OCR"""
        try:
            # Validate PDF exists and is readable
            if not os.path.isfile(pdf_path):
                raise FileNotFoundError(f"PDF not found: {pdf_path}")
            if os.path.getsize(pdf_path) == 0:
                raise ValueError("Empty PDF file")

            # First try PyPDF for text-based PDFs
            logger.info("Attempting PyPDF extraction")
            try:
                loader = PyPDFLoader(pdf_path)
                pages = loader.load_and_split()
                text = "\n".join([page.page_content for page in pages])
                
                if len(text.strip()) >= self.config.MIN_TEXT_LENGTH:
                    return text[:self.config.MAX_TEXT_LENGTH]
            except Exception as e:
                logger.warning(f"PyPDF extraction warning: {str(e)}")

            # Fallback to OCR if PyPDF fails
            logger.info("Falling back to OCR extraction")
            return self.extract_text_with_ocr(pdf_path)
        except Exception as e:
            logger.error(f"Text extraction failed: {str(e)}")
            raise PDFProcessingError(
                message="Text extraction failed",
                error_type="EXTRACTION_ERROR",
                details=str(e))
    
    def extract_text_with_ocr(self, pdf_path):
        """Perform OCR using Google Vision with parallel processing"""
        try:
            logger.info("Initializing OCR processing")
            
            # Convert PDF to images (with page limit)
            images = convert_from_path(
                pdf_path,
                first_page=0,
                last_page=self.config.MAX_PAGES-1,
                thread_count=4
            )
            
            if not images:
                raise ValueError("No pages converted for OCR")
                
            logger.info(f"Processing {len(images)} pages with OCR")

            # Initialize Google Vision client
            client = vision.ImageAnnotatorClient()
            extracted_text = []

            def process_image(img):
                """Process single image with timeout protection"""
                try:
                    with io.BytesIO() as img_buffer:
                        img.save(img_buffer, format='JPEG', quality=85)
                        content = img_buffer.getvalue()
                        
                        # Set timeout for this image
                        signal.signal(signal.SIGALRM, timeout_handler)
                        signal.alarm(self.config.OCR_TIMEOUT)
                        
                        try:
                            image = vision.Image(content=content)
                            response = client.text_detection(image=image)
                            return response.text_annotations[0].description if response.text_annotations else ""
                        finally:
                            signal.alarm(0)
                except Exception as e:
                    logger.warning(f"OCR page processing failed: {str(e)}")
                    return ""

            # Process images in parallel
            with ThreadPoolExecutor(max_workers=4) as executor:
                results = list(executor.map(process_image, images))
            
            full_text = "\n".join(filter(None, results))
            
            if len(full_text.strip()) < self.config.MIN_TEXT_LENGTH:
                raise ValueError("Insufficient text extracted via OCR")
                
            return full_text[:self.config.MAX_TEXT_LENGTH]
        except Exception as e:
            logger.error(f"OCR processing failed: {str(e)}")
            raise PDFProcessingError(
                message="OCR processing failed",
                error_type="OCR_ERROR",
                details=str(e))

    def process_with_ai(self, text):
        """Generate feedback using Gemini AI with comprehensive error handling"""
        try:
            logger.info("Starting AI processing pipeline")
            
            # Set overall timeout
            signal.signal(signal.SIGALRM, timeout_handler)
            signal.alarm(self.config.PROCESS_TIMEOUT)
            
            try:
                # Validate input
                if not text or len(text.strip()) < self.config.MIN_TEXT_LENGTH:
                    raise ValueError("Insufficient text for processing")
                
                # Prepare text (clean and truncate if needed)
                processed_text = text.strip()
                if len(processed_text) > self.config.MAX_TEXT_LENGTH:
                    processed_text = processed_text[:self.config.MAX_TEXT_LENGTH]
                    logger.warning(f"Truncated text to {self.config.MAX_TEXT_LENGTH} characters")

                # Create embeddings and vector store
                embeddings = self.get_embeddings()
                db = FAISS.from_texts([processed_text], embeddings)
                
                # Find most relevant sections
                docs = db.similarity_search(FIXED_PROMPT, k=3)
                context = "\n".join([doc.page_content for doc in docs])
                
                # Initialize Gemini with safety settings
                llm = ChatGoogleGenerativeAI(
                    model=self.config.GEMINI_MODEL,
                    api_key=os.getenv("GEMINI_API_KEY"),
                    temperature=0.3,
                    safety_settings={
                        "HARM_CATEGORY_DANGEROUS": "BLOCK_ONLY_HIGH",
                        "HARM_CATEGORY_HARASSMENT": "BLOCK_ONLY_HIGH"
                    }
                )
                
                # Generate response
                prompt = f"""Context from student work:
{context}

Instruction for grader:
{FIXED_PROMPT}

Please provide:
1. Detailed feedback
2. Numerical grade (Marks: XX/100)
3. Key recommendations"""
                
                result = llm.invoke(prompt)
                
                # Parse and validate response
                return self._parse_ai_response(result.content)
            finally:
                signal.alarm(0)
        except Exception as e:
            logger.error(f"AI processing failed: {traceback.format_exc()}")
            raise PDFProcessingError(
                message="AI processing failed",
                error_type="AI_ERROR",
                details=str(e))

    def _parse_ai_response(self, response_text):
        """Validate and parse the AI response with strict checks"""
        try:
            # Extract marks
            marks_match = re.search(r"Marks:\s*(\d{1,3})/100", response_text, re.IGNORECASE)
            if not marks_match:
                raise ValueError("Marks not found in expected format")
                
            marks = marks_match.group(1)
            if not marks.isdigit() or not (0 <= int(marks) <= 100):
                raise ValueError(f"Invalid marks value: {marks}")
            
            # Extract feedback (remove marks line)
            feedback = re.sub(
                r"Marks:\s*\d{1,3}/100\s*", 
                "", 
                response_text, 
                flags=re.IGNORECASE
            ).strip()
            
            if not feedback or len(feedback) < 20:
                raise ValueError("Insufficient feedback content")
            
            return {
                "marks": f"{marks}/100",
                "feedback": feedback,
                "processing_time": round(time() - self.start_time, 2),
                "warnings": ["response_truncated"] if "..." in response_text else []
            }
        except Exception as e:
            logger.error(f"Failed to parse AI response: {str(e)}")
            raise PDFProcessingError(
                message="AI response parsing failed",
                error_type="PARSE_ERROR",
                details=str(e))

# =====================
# Main Execution
# =====================
def main():
    try:
        # Validate input
        if len(sys.argv) < 2:
            raise ValueError("Usage: python pdf_processor.py <pdf_path_or_url> [output_file]")
        
        pdf_input = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
        
        logger.info(f"Starting processing for: {pdf_input}")
        
        with PDFProcessor() as processor:
            # Process input (URL or file path)
            if pdf_input.startswith(('http://', 'https://')):
                pdf_content = processor.download_pdf(pdf_input)
                pdf_path = processor.create_temp_file(pdf_content)
            else:
                pdf_path = pdf_input
            
            # Extract and process text
            extracted_text = processor.extract_text(pdf_path)
            logger.info(f"Extracted {len(extracted_text)} characters")
            
            if len(extracted_text.strip()) < processor.config.MIN_TEXT_LENGTH:
                raise ValueError(
                    f"Insufficient text extracted (min {processor.config.MIN_TEXT_LENGTH} chars required)"
                )
            
            # Generate AI feedback
            result = processor.process_with_ai(extracted_text)
            logger.info("Processing completed successfully")
            
            # Output results
            output = json.dumps(result, indent=2)
            if output_file:
                with open(output_file, 'w') as f:
                    f.write(output)
            print(output)
            
            return 0
            
    except PDFProcessingError as e:
        error_info = {
            "error": e.message,
            "type": e.error_type,
            "details": e.details,
            "timestamp": time()
        }
        logger.error(json.dumps(error_info, indent=2))
        print(json.dumps({"error": e.message}))
        return 1
    except Exception as e:
        error_info = {
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc(),
            "timestamp": time()
        }
        logger.critical(json.dumps(error_info, indent=2))
        print(json.dumps({"error": "Unexpected processing error"}))
        return 2

if __name__ == "__main__":
    sys.exit(main())
