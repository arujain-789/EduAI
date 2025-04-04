import sys
import json
import traceback
import os
import re
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from pdf2image import convert_from_path
from google.cloud import vision
import io
import requests

FIXED_PROMPT = """
You are a teacher grading an assignment. 
1. Provide feedback on student improvement.
2. Assign marks out of 100 (format: 'Marks: XX/100').
3. Be lenient in grading.
"""

def download_pdf(url):
    try:
        response = requests.get(url)
        response.raise_for_status()
        return io.BytesIO(response.content)
    except Exception as e:
        raise Exception(f"Failed to download PDF: {str(e)}")

def extract_text_from_pdf(pdf_path):
    try:
        # First try PyPDF for text-based PDFs
        loader = PyPDFLoader(pdf_path)
        pages = loader.load_and_split()
        return "\n".join([page.page_content for page in pages])
    except Exception:
        # Fallback to OCR if PyPDF fails
        try:
            images = convert_from_path(pdf_path)
            client = vision.ImageAnnotatorClient()
            extracted_text = ""
            
            for img in images:
                img_byte_arr = io.BytesIO()
                img.save(img_byte_arr, format='JPEG')
                image = vision.Image(content=img_byte_arr.getvalue())
                response = client.text_detection(image=image)
                
                if response.text_annotations:
                    extracted_text += response.text_annotations[0].description + "\n"
            
            return extracted_text
        except Exception as e:
            raise Exception(f"OCR processing failed: {str(e)}")

def process_with_ai(text):
    try:
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        db = FAISS.from_texts([text], embeddings)
        docs = db.similarity_search(FIXED_PROMPT)
        context = "\n".join([doc.page_content for doc in docs])

        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-pro-latest",
            api_key=os.getenv("GOOGLE_API_KEY")
        )
        
        result = llm.invoke(f"Context: {context}\nPrompt: {FIXED_PROMPT}")
        
        # Extract marks and feedback
        ai_response = result.content
        marks_match = re.search(r"Marks:\s*(\d{1,3})/100", ai_response)
        marks = f"{marks_match.group(1)}/100" if marks_match else "Not Assigned"
        feedback = re.sub(r"Marks:\s*\d{1,3}/100", "", ai_response).strip()

        return {"marks": marks, "feedback": feedback}
    except Exception as e:
        raise Exception(f"AI processing failed: {str(e)}")

def main():
    try:
        if len(sys.argv) < 2:
            raise Exception("No PDF path provided")
        
        pdf_path = sys.argv[1]
        
        # Check if path is URL or local file
        if pdf_path.startswith(('http://', 'https://')):
            pdf_buffer = download_pdf(pdf_path)
            with open("temp.pdf", "wb") as f:
                f.write(pdf_buffer.getbuffer())
            pdf_path = "temp.pdf"
        
        extracted_text = extract_text_from_pdf(pdf_path)
        
        if not extracted_text.strip():
            raise Exception("No text could be extracted from PDF")
        
        result = process_with_ai(extracted_text)
        
        # Cleanup temp file if created
        if os.path.exists("temp.pdf"):
            os.remove("temp.pdf")
        
        print(json.dumps(result))
        
    except Exception as e:
        error_data = {
            "error": str(e),
            "traceback": traceback.format_exc()
        }
        print(json.dumps(error_data))
        sys.exit(1)

if __name__ == "__main__":
    main()
