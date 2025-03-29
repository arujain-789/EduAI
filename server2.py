import sys
import json
import os

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
import pytesseract
from pdf2image import convert_from_path
from PIL import Image
from google.cloud import vision
import io
import sys
import re
sys.stdout.reconfigure(encoding='utf-8')
API_KEY = os.getenv("API_KEY")
# 🔹 Set Tesseract OCR path
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# 🔹 Check if filename is provided
if len(sys.argv) < 2:
    print("❌ Error: No filename provided.")
    sys.exit(1)

uploaded_file = sys.argv[1]  # Get filename from command-line argument
print(f"Processing file: {uploaded_file}")

# 🔹 Google Vision OCR Function
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
You are a teacher grading an exam paper. 
1. Provide a small feedback on student improvement.
2. Assign marks out of 20 in the format 'Marks: XX/20'.
3. do not cut marks for bad handwriting.
4. the student is of 12th class cbse.
5. give the list of weak topic and strong topic.
6. dont cut marks for Clarity and Organization in Problem Solving (Across all topics).
"""


# 🔹 Extract text normally
extracted_text = ""
try:
    pdffile = PyPDFLoader(uploaded_file)
    pages = pdffile.load_and_split()
    extracted_text = "\n".join([page.page_content for page in pages])
except Exception as e:
    print("Text extraction failed, switching to OCR:", str(e))

# 🔹 If no text was found, use OCR
if not extracted_text.strip():
    print("🔹 Using OCR to extract text from scanned PDF...")

    images = convert_from_path(uploaded_file)
    extracted_text = ""

    for i, img in enumerate(images):
        img_path = f"page_{i+1}.jpg"
        img.save(img_path, "JPEG")
        
        try:
            text = pytesseract.image_to_string(img)
            if not text.strip():  # If Tesseract fails, try Google Vision OCR
                print("⚠️ Tesseract failed, switching to Google Vision OCR...")
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

    llm = ChatGoogleGenerativeAI(model="gemini-2.5-pro-exp-03-25", api_key=API_KEY)
    result = llm.invoke(input_prompt)

    ai_response = result.content
    marks_match = re.search(r"Marks:\s*(\d{1,3})/20", ai_response)  # Extracts 'Marks: XX/100'

    if marks_match:
        ai_marks = marks_match.group(1) + "/20"
    else:
        ai_marks = "Not Assigned"  # Fallback if AI fails to generate marks

    ai_feedback = re.sub(r"Marks:\s*\d{1,3}/20", "", ai_response).strip()  # Remove marks from feedback

    # 🔹 Display AI-generated marks and feedback
    print("\n🔹 AI Feedback:\n", ai_feedback)
    print("🔹 AI Assigned Marks:", ai_marks)

    # 🔹 Save AI response & marks to JSON
    output_data = {
        "marks": ai_marks,
        "feedback": ai_feedback
    }

    output_file = os.path.join(os.path.dirname(uploaded_file), "output.json")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, indent=4)

    print("✅ AI output saved to output.json")
else:
    print("❌ No text could be extracted from the PDF.")
