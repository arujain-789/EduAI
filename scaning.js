import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import dotenv from "dotenv";
import Tesseract from "tesseract.js";

dotenv.config();
const apiKey = process.env.API_KEY;

if (!apiKey) {
    console.error("❌ API Key is missing. Please set it in the .env file.");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
pdfjsLib.GlobalWorkerOptions.workerSrc = "./node_modules/pdfjs-dist/build/pdf.worker.js";

// Extract text using PDF.js
async function extractTextFromPDF(pdfPath) {
    try {
        const dataBuffer = new Uint8Array(fs.readFileSync(pdfPath));
        const pdfDoc = await pdfjsLib.getDocument({ data: dataBuffer }).promise;
        let extractedText = "";

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const textContent = await page.getTextContent();
            extractedText += textContent.items.map((item) => item.str).join(" ") + "\n";
        }

        return extractedText.trim();
    } catch (error) {
        console.error("❌ Error extracting text from PDF:", error);
        return null;
    }
}

// Fallback OCR using Tesseract.js
async function extractTextWithOCR(pdfPath) {
    console.log("🔍 Running OCR on PDF...");

    const { data } = await Tesseract.recognize(pdfPath, "eng");
    return data.text.trim();
}

// Grade the extracted text
async function gradeExam(answerText) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            You are an AI teacher grading an 8th-grade exam paper.
            - The extracted student answers are: 
            ${answerText}
            - Provide a total score out of 100.
            - Give feedback on strengths and areas for improvement.

            Format the response as:
            {
                "score": "xx/100",
                "feedback": "..."
            }
        `;

        const result = await model.generateContent(prompt);
        console.log("✅ AI Grading Result:", result.response.text());
    } catch (error) {
        console.error("❌ Error grading exam:", error);
    }
}

// Main function to process the exam
async function processExam(pdfPath) {
    console.log("📖 Extracting text from PDF...");
    let extractedText = await extractTextFromPDF(pdfPath);

    if (!extractedText) {
        console.warn("⚠️ No text extracted! Falling back to OCR...");
        extractedText = await extractTextWithOCR(pdfPath);
    }

    if (!extractedText) {
        console.error("❌ Text extraction completely failed.");
        return;
    }

    console.log("📝 Grading the exam...");
    await gradeExam(extractedText);
}

// Run with a sample PDF exam answer sheet
const pdfFilePath = "./uploads/8th_Grade_Answer_Sheet.pdf"; // Change this to your actual file path
processExam(pdfFilePath);
