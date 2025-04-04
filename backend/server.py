#!/usr/bin/env python3
import sys
import json
import traceback
import os
import re
import logging
from time import time
from pathlib import Path
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from pdf2image import convert_from_path
from google.cloud import vision
import io
import requests
from tempfile import NamedTemporaryFile

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('grader.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

FIXED_PROMPT = """You are a teacher grading an assignment. 
1. Provide feedback on student improvement.
2. Assign marks out of 100 (format: 'Marks: XX/100').
3. Be lenient in grading."""

class PDFProcessor:
    def __init__(self):
        self.start_time = time()
        self.temp_files = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.cleanup()

    def cleanup(self):
        """Remove all temporary files"""
        for filepath in self.temp_files:
            try:
                if os.path.exists(filepath):
                    os.remove(filepath)
                    logger.info(f"Cleaned up temp file: {filepath}")
            except Exception as e:
                logger.error(f"Error cleaning up {filepath}: {str(e)}")

    def create_temp_file(self, content=None):
        """Create a managed temporary file"""
        try:
            with NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
                if content:
                    tmp.write(content)
                temp_path = tmp.name
                self.temp_files.append(temp_path)
                return temp_path
        except Exception as e:
            raise Exception(f"Temp file creation failed: {str(e)}")

    def download_pdf(self, url):
        """Download PDF from URL with timeout and retry"""
        try:
            logger.info(f"Downloading PDF from {url}")
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.content
        except requests.exceptions.RequestException as e:
            raise Exception(f"PDF download failed: {str(e)}")

    def extract_text(self, pdf_path):
        """Extract text using PyPDF with OCR fallback"""
        try:
            # First try PyPDF for text-based PDFs
            logger.info("Attempting PyPDF extraction")
            loader = PyPDFLoader(pdf_path)
            pages = loader.load_and_split()
            text = "\n".join([page.page_content for page in pages])
            
            if len(text.strip()) > 50:  # Minimum viable text length
                return text

            # Fallback to OCR if PyPDF fails
            logger.info("Falling back to OCR")
            return self.extract_text_with_ocr(pdf_path)
        except Exception as e:
            logger.error(f"PyPDF extraction failed: {str(e)}")
            return self.extract_text_with_ocr(pdf_path)

    def extract_text_with_ocr(self, pdf_path):
        """OCR fallback using Google Vision"""
        try:
            logger.info("Starting OCR processing")
            images = convert_from_path(pdf_path)
            client = vision.ImageAnnotatorClient()
            extracted_text = ""
            
            for i, img in enumerate(images):
                logger.info(f"Processing page {i+1}/{len(images)}")
                with io.BytesIO() as img_buffer:
                    img.save(img_buffer, format='JPEG', quality=85)
                    image = vision.Image(content=img_buffer.getvalue())
                    response = client.text_detection(image=image)
                    
                    if response.text_annotations:
                        extracted_text += response.text_annotations[0].description + "\n"
            
            if not extracted_text.strip():
                raise Exception("No text detected in PDF")
                
            return extracted_text
        except Exception as e:
            raise Exception(f"OCR processing failed: {str(e)}")

    def process_with_ai(self, text):
        """Generate feedback using Gemini AI"""
        try:
            logger.info("Starting AI processing")
            
            # Initialize models
            embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
            db = FAISS.from_texts([text], embeddings)
            docs = db.similarity_search(FIXED_PROMPT, k=3)
            context = "\n".join([doc.page_content for doc in docs])

            # Call Gemini API
            llm = ChatGoogleGenerativeAI(
                model="gemini-2.5-pro-latest",
                api_key=os.getenv("GEMINI_API_KEY"),
                temperature=0.3
            )
            
            result = llm.invoke(f"Context: {context}\nPrompt: {FIXED_PROMPT}")
            
            # Parse response
            ai_response = result.content
            marks_match = re.search(r"Marks:\s*(\d{1,3})/100", ai_response, re.IGNORECASE)
            marks = marks_match.group(1) if marks_match else None
            
            if not marks or not marks.isdigit():
                raise Exception("Invalid marks format in AI response")
                
            feedback = re.sub(r"Marks:\s*\d{1,3}/100", "", ai_response, flags=re.IGNORECASE).strip()
            
            return {
                "marks": f"{marks}/100",
                "feedback": feedback,
                "processing_time": round(time() - self.start_time, 2)
            }
        except Exception as e:
            raise Exception(f"AI processing error: {str(e)}")

def main():
    try:
        if len(sys.argv) < 2:
            raise ValueError("Usage: python server.py <pdf_path_or_url>")
        
        pdf_input = sys.argv[1]
        logger.info(f"Starting processing for: {pdf_input}")
        
        with PDFProcessor() as processor:
            # Handle URL or file path
            if pdf_input.startswith(('http://', 'https://')):
                pdf_content = processor.download_pdf(pdf_input)
                pdf_path = processor.create_temp_file(pdf_content)
            else:
                if not os.path.exists(pdf_input):
                    raise FileNotFoundError(f"PDF file not found: {pdf_input}")
                pdf_path = pdf_input
            
            # Process PDF
            extracted_text = processor.extract_text(pdf_path)
            logger.info(f"Extracted {len(extracted_text)} characters")
            
            if len(extracted_text.strip()) < 50:
                raise ValueError("Insufficient text extracted from PDF (minimum 50 chars required)")
            
            result = processor.process_with_ai(extracted_text)
            logger.info("Processing completed successfully")
            
            print(json.dumps(result))
            return 0
            
    except Exception as e:
        error_info = {
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc(),
            "timestamp": time()
        }
        logger.error(json.dumps(error_info, indent=2))
        print(json.dumps({"error": str(e)}))
        return 1

if __name__ == "__main__":
    sys.exit(main())
