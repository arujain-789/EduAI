import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Load API Key (DO NOT expose publicly)
const API_KEY = "AIzaSyBFKPqM2mCU43VPvkOYQQwx62QrLNJwkpE";
const genAI = new GoogleGenerativeAI(API_KEY);

// Get the file path from PHP
const pdfPath = process.argv[2];

if (!pdfPath) {
    console.error("❌ No PDF file provided.");
    process.exit(1);
}

async function processPDF() {
    try {
        // Check if file exists
        if (!fs.existsSync(pdfPath)) {
            console.error(`❌ File not found: ${pdfPath}`);
            process.exit(1);
        }

        // Read and convert file to Base64
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfBase64 = pdfBuffer.toString("base64");

        // Initialize Gemini model
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        // Send request to Gemini API
        const result = await model.generateContent([
            {
                inlineData: {
                    data: pdfBase64,
                    mimeType: "application/pdf",
                },
            },
            "Summarize this document",
        ]);

        // Extract response safely
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "No summary available.";
        console.log(responseText);  // Send output back to PHP
    } catch (error) {
        console.error("❌ Error processing PDF:", error);
    }
}

// Run function
processPDF();
