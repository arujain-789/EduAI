from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
import os
import PyPDF2
import google.generativeai as genai
from flask_cors import CORS
import logging
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'pdf_uploads'
ALLOWED_EXTENSIONS = {'pdf'}
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', 'AIzaSyBQdKLSkEFzbnFb7txwgKhfUYtD1gpE6HM')  # Use environment variable

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB limit

# Initialize Gemini
try:
    genai.configure(
        api_key=GEMINI_API_KEY,
        transport='rest',
        client_options={
            'api_endpoint': 'https://generativelanguage.googleapis.com/v1'
        }
    )
    logger.info("Gemini API configured successfully")
except Exception as e:
    logger.error(f"Gemini configuration failed: {str(e)}")
    raise RuntimeError("Failed to initialize Gemini API")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_from_pdf(filepath):
    """Extracts text from PDF with robust error handling"""
    try:
        with open(filepath, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            if not reader.pages:
                raise ValueError("PDF contains no readable pages")
            
            text = ""
            for i, page in enumerate(reader.pages):
                try:
                    page_text = page.extract_text() or ""
                    text += f"\n[Page {i+1}]\n{page_text}\n"
                except Exception as page_error:
                    logger.warning(f"Error extracting page {i+1}: {str(page_error)}")
                    continue
            
            if not text.strip():
                raise ValueError("PDF text extraction returned empty content")
            
            return text
    except Exception as e:
        logger.error(f"PDF extraction failed: {str(e)}")
        raise

def analyze_with_gemini(text_content):
    """Analyzes text with Gemini with comprehensive error handling"""
    try:
        # Initialize model with safety settings
        generation_config = {
            "temperature": 0.7,
            "top_p": 1,
            "top_k": 32,
            "max_output_tokens": 4096,
        }

        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ]

        model = genai.GenerativeModel(
            'gemini-pro',
            generation_config=generation_config,
            safety_settings=safety_settings
        )

        prompt = f"""Analyze this student assignment thoroughly and provide:
        1. Letter grade (A-F) with specific grading criteria
        2. Detailed feedback on strengths and weaknesses
        3. Actionable improvement suggestions
        4. Overall comments on writing quality

        Assignment Content:
        {text_content[:15000]}"""  # Limit to first 15k chars

        response = model.generate_content(prompt)
        
        if not response.text:
            raise ValueError("Empty response from Gemini API")
        
        return response.text

    except Exception as e:
        logger.error(f"Gemini analysis failed: {str(e)}")
        raise

@app.route('/api/analyze', methods=['POST'])
def analyze_pdf():
    """Endpoint for PDF analysis with complete error handling"""
    start_time = datetime.now()
    logger.info("PDF analysis request received")
    
    if 'file' not in request.files:
        logger.error("No file in request")
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['file']
    
    if file.filename == '':
        logger.error("Empty filename")
        return jsonify({"error": "No file selected"}), 400
    
    if not allowed_file(file.filename):
        logger.error(f"Invalid file type: {file.filename}")
        return jsonify({"error": "Only PDF files are allowed"}), 400
    
    filepath = None
    try:
        # Save uploaded file with timestamp
        os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{timestamp}_{secure_filename(file.filename)}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        logger.info(f"File saved: {filepath}")

        # Extract text
        text_content = extract_text_from_pdf(filepath)
        logger.info(f"Extracted {len(text_content)} characters from PDF")

        # Analyze with Gemini
        analysis_result = analyze_with_gemini(text_content)
        logger.info("Analysis completed successfully")

        return jsonify({
            "success": True,
            "analysis": analysis_result,
            "excerpt": text_content[:500] + ('...' if len(text_content) > 500 else ''),
            "processing_time": str(datetime.now() - start_time)
        })

    except Exception as e:
        logger.error(f"Processing failed: {str(e)}")
        return jsonify({
            "error": "Failed to analyze content",
            "details": str(e),
            "processing_time": str(datetime.now() - start_time)
        }), 500

    finally:
        # Clean up uploaded file
        if filepath and os.path.exists(filepath):
            try:
                os.remove(filepath)
                logger.info(f"Cleaned up file: {filepath}")
            except Exception as cleanup_error:
                logger.error(f"File cleanup failed: {str(cleanup_error)}")

if __name__ == '__main__':
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    logger.info(f"Starting server, uploads will be saved to: {os.path.abspath(UPLOAD_FOLDER)}")
    app.run(port=5000, debug=True)