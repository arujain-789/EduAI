import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import pdfParse from "pdf-parse";
import dotenv from "dotenv";

dotenv.config();
const apiKey = process.env.API_KEY;

if (!apiKey) {
    console.error("❌ API Key is missing. Please set it in the .env file.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Function to extract text from a PDF
async function extractTextFromPDF(pdfPath) {
    if (!fs.existsSync(pdfPath)) {
        console.error(`❌ Error: PDF file not found at ${pdfPath}`);
        return null;
    }

    console.log(`📄 Extracting text from: ${pdfPath}`);
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    return data.text;
}

// Function to grade the student's answers
async function gradeExam(answerText) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `You are an AI examiner. Grade the student's answers and provide detailed feedback.
        - The answer text is: 
        ${answerText}
        - Provide a total score out of 100.
        - Give individual feedback on strengths and weaknesses.
        - Suggest improvements.
        
        Format the response as:
        {
            "score": "xx/100",
            "feedback": "..."
        }`;

        console.log("🧠 Sending answers for AI grading...");
        const result = await model.generateContent([prompt]);

        console.log("✅ AI Grading Result:", await result.response.text());
    } catch (error) {
        console.error("❌ Error grading exam:", error);
    }
}

// Main function to process PDF and grade answers
async function processExam() {
    const uploadsDirectory = "./uploads/";
    
    // Check if uploads directory exists
    if (!fs.existsSync(uploadsDirectory)) {
        console.error("❌ Error: The 'uploads' directory does not exist. Please create it and add PDFs.");
        return;
    }

    // Get the latest uploaded PDF file
    const files = fs.readdirSync(uploadsDirectory).filter(file => file.endsWith(".pdf"));
    
    if (files.length === 0) {
        console.error("❌ No PDF files found in 'uploads' directory.");
        return;
    }

    const pdfPath = `${uploadsDirectory}${files[0]}`; // Pick the first available PDF

    try {
        const answerText = await extractTextFromPDF(pdfPath);
        
        if (!answerText) {
            console.error("❌ No text extracted from the PDF.");
            return;
        }

        await gradeExam(answerText);
    } catch (error) {
        console.error("❌ Error processing exam paper:", error);
    }
}

// Run the script
processExam();
