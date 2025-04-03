import sys
import json
import re
import io
import requests
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.document_loaders import PyPDFLoader
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from pdf2image import convert_from_bytes
from google.cloud import vision
import os

# 🛠 Debugging
print("Received arguments:", sys.argv)

# 🔹 Check for GCS URL argument
if len(sys.argv) < 2:
    print("Error: No GCS URL provided.")
    sys.exit(1)

gcs_url = sys.argv[1]  # e.g., "https://storage.googleapis.com/your-bucket/file.pdf"
print(f"Processing GCS file: {gcs_url}")

# 🔹 Download PDF from GCS
def download_pdf(url):
    try:
        response = requests.get(url)
        response.raise_for_status()
        return io.BytesIO(response.content)  # PDF in memory
    except Exception as e:
        print(f"❌ Failed to download PDF: {str(e)}")
        sys.exit(1)

pdf_buffer = download_pdf(gcs_url)

# 🔹 Load Google Cloud credentials from environment
service_account_json = os.getenv("API_KEY")  # Ensure API_KEY contains the full JSON credentials

if not service_account_json:
    print("❌ Error: API_KEY not found in environment variables")
    exit(1)

try:
    # ✅ Ensure JSON is valid before writing
    json.loads(service_account_json)

    # ✅ Define credential path and write to a temp file
    cred_path = "/tmp/service-account.json"
    with open(cred_path, "w") as f:
        f.write(service_account_json)

    # ✅ Set credentials for Google Vision
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_path

except json.JSONDecodeError:
    print("❌ Error: Invalid JSON in API_KEY")
    exit(1)

# 🔹 Initialize Google Vision OCR
client = vision.ImageAnnotatorClient()

# 🔹 Extract text using Google Vision OCR (for scanned PDFs)
def google_vision_ocr(image_bytes):
    image = vision.Image(content=image_bytes)
    response = client.text_detection(image=image)
    return response.text_annotations[0].description if response.text_annotations else "❌ No text found."

# 🔹 AI Grading Prompt
FIXED_PROMPT = """
You are a teacher grading an assignment. 
1. Provide feedback on student improvement.
2. Assign marks out of 100 (format: 'Marks: XX/100').
3. Be lenient in grading.
"""

# 🔹 Step 1: Try PyPDFLoader first (for text-based PDFs)
extracted_text = ""
try:
    pdf_loader = PyPDFLoader(pdf_buffer)
    pages = pdf_loader.load_and_split()
    extracted_text = "\n".join([page.page_content for page in pages])
except Exception as e:
    print("⚠️ PyPDFLoader failed (likely scanned PDF), switching to OCR...")

# 🔹 Step 2: Fallback to Google Vision OCR if PyPDF fails
if not extracted_text.strip():
    print("🔹 Extracting text via Google Vision OCR...")
    images = convert_from_bytes(pdf_buffer.read())  # Convert PDF pages to images
    for img in images:
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format="JPEG")
        extracted_text += google_vision_ocr(img_byte_arr.getvalue()) + "\n"

# 🔹 Process extracted text with Gemini AI
if extracted_text.strip():
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    db = FAISS.from_texts([extracted_text], embeddings)
    docs = db.similarity_search(FIXED_PROMPT)
    context = "\n".join([doc.page_content for doc in docs])

    # ✅ Get Gemini API key separately
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")  # Store Gemini API key separately

    if not GEMINI_API_KEY:
        print("❌ Error: GEMINI_API_KEY not found in environment variables")
        exit(1)

    llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", api_key=GEMINI_API_KEY)
    result = llm.invoke(f"Context: {context}\nPrompt: {FIXED_PROMPT}")

    # Extract marks and feedback
    ai_response = result.content
    marks = re.search(r"Marks:\s*(\d{1,3})/100", ai_response).group(1) + "/100" if re.search(r"Marks:\s*(\d{1,3})/100", ai_response) else "Not Assigned"
    feedback = re.sub(r"Marks:\s*\d{1,3}/100", "", ai_response).strip()

    # Output JSON
    output = {"marks": marks, "feedback": feedback}
    print(json.dumps(output))  # ✅ Print JSON for Express.js to capture
else:
    print("❌ No text could be extracted.")
    sys.exit(1)
