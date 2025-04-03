const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static("uploads"));


// 🔹 Ensure "uploads" directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
console.log(`Uploads folder path: ${uploadDir}`);
// 🔹 Multer Storage Config
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});
const upload = multer({ storage });

// 🔹 Upload PDF API
app.post("/upload", upload.single("pdf"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded!" });
    }

    console.log(`📂 Uploaded: ${req.file.filename}`);
    const filePath = path.join(__dirname, "uploads", req.file.filename);
    
    exec(`python3 server1.py "${filePath}"`, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ AI Processing Error: ${error.message}`);
            return res.status(500).json({ error: "AI processing failed!" });
        }

        console.log(`🔹 AI Output: ${stdout}`);

        // ✅ Response is now sent ONLY after AI processing is completed
        res.json({ message: "File uploaded and AI processing completed!", filename: req.file.filename });
    });
});


// 🔹 List Uploaded PDFs
app.get("/list", (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: "Cannot list files." });
        }
        res.json(files.filter(f => f.endsWith(".pdf"))); // Return only PDFs
    });
});

// 🔹 Fetch AI Output (Marks & Feedback)
app.get("/ai-output", (req, res) => {
    const outputFile = path.join(uploadDir, "output.json");

    fs.readFile(outputFile, "utf8", (err, data) => {
        if (err) {
            return res.status(500).json({ error: "Error reading AI output" });
        }

        const output = JSON.parse(data);
        res.json({ marks: output.marks, feedback: output.feedback });
    });
});

// 🔹 Serve HTML File (Frontend)
app.use(express.static("public")); // Ensure the frontend is served

// 🔹 Delete a File
app.delete("/delete/:filename", (req, res) => {
    const filePath = path.join(uploadDir, req.params.filename);

    fs.unlink(filePath, err => {
        if (err) {
            return res.status(500).json({ error: "File deletion failed." });
        }
        res.json({ message: "File deleted successfully." });
    });
});

// 🔹 Start Server
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server running at http://eduai2025.app:${PORT}`));

