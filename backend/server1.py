import sys
import json
import os
import requests
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

from pdf2image import convert_from_path
from PIL import Image
from google.cloud import vision
import io
import re
sys.stdout.reconfigure(encoding='utf-8')

# ✅ Get signed URL from CLI
if len(sys.argv) < 2:
    print("❌ Error: No URL provided.")
    sys.exit(1)

signed_url = sys.argv[1]
print(f"🔗 Downloading PDF from signed URL:\n{signed_url}")

# ✅ Download the PDF to a temp file
response = requests.get(signed_url)
if response.status_code != 200:
    print("❌ Failed to download PDF.")
    sys.exit(1)

local_pdf_path = "temp_uploaded.pdf"
with open(local_pdf_path, "wb") as f:
    f.write(response.content)

print(f"📄 Saved PDF to: {local_pdf_path}")

def google_vision_ocr(image_path):
    """Extracts text from an image using Google Vision OCR."""
    client = vision.ImageAnnotatorClient()
    with io.open(image_path, "rb") as image_file:
        content = image_file.read()
    
    image = vision.Image(content=content)
    response = client.text_detection(image=image)

    if response.text_annotations:
        return response.text_annotations[0].description
    return "❌ No text found via Google Vision OCR."

FIXED_PROMPT = """
You are a teacher grading an assignment. 
1. Provide a small feedback on student improvement.
2. Assign marks out of 100 in the format 'Marks: XX/100'.
3. Check leniently and give more marks. 
4. Don't consider handwriting when rewarding marks.
"""

# 🔹 Extract text normally
extracted_text = ""
try:
    pdffile = PyPDFLoader(local_pdf_path)
    pages = pdffile.load_and_split()
    extracted_text = "\n".join([page.page_content for page in pages])
except Exception as e:
    print("Text extraction failed, switching to OCR:", str(e))

# 🔹 If no text was found, use OCR with Google Vision API
if not extracted_text.strip():
    print("🔹 Using Google Vision OCR to extract text from scanned PDF...")

    images = convert_from_path(local_pdf_path)
    extracted_text = ""

    for i, img in enumerate(images):
        img_path = f"page_{i+1}.jpg"
        img.save(img_path, "JPEG")
        
        try:
            text = google_vision_ocr(img_path)
            extracted_text += text + "\n"
        except Exception as e:
            print(f"❌ OCR Error: {str(e)}")

# 🔹 Ensure text exists before embedding
if extracted_text.strip():
    Embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    db = FAISS.from_texts([extracted_text], Embeddings)

    docs = db.similarity_search(FIXED_PROMPT)
    relevant_search = "\n".join([x.page_content for x in docs])

    gemini_prompt = "Use the following context to answer the question. If you don't know, say 'I don't know' and don't make it up."
    input_prompt = f"{gemini_prompt}\nContext: {relevant_search}\nUser Question: {FIXED_PROMPT}"

    llm = ChatGoogleGenerativeAI(model="gemini-2.5-pro-exp-03-25", api_key="AIzaSyBFKPqM2mCU43VPvkOYQQwx62QrLNJwkpE")
    result = llm.invoke(input_prompt)

    # Safe fallback for AI response
    if hasattr(result, "content"):
        ai_response = result.content
    elif isinstance(result, str):
        ai_response = result
    else:
        ai_response = str(result)

    print("📝 AI Final Response:", ai_response)

    ai_response = result.content
    marks_match = re.search(r"Marks:\s*(\d{1,3})/100", ai_response)  # Extracts 'Marks: XX/100'

    if marks_match:
        ai_marks = marks_match.group(1)
    else:
        ai_marks = "Not Assigned"  # Fallback if AI fails to generate marks

    ai_feedback = re.sub(r"Marks:\s*\d{1,3}", "", ai_response).strip()  # Remove marks from feedback

    # 🔹 Display AI-generated marks and feedback
    print("\n🔹 AI Feedback:\n", ai_feedback)
    print("🔹 AI Assigned Marks:", ai_marks)

    # 🔹 Save AI response & marks to JSON
    output_data = {
        "marks": ai_marks,
        "feedback": ai_feedback
    }

    output_file = "output.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=4)

    print("✅ AI output saved to output.json")
else:
    print("❌ No text could be extracted from the PDF.")
