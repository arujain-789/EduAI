const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const app = express();
const PORT = 3000;
const { Storage } = require("@google-cloud/storage");
require('dotenv').config();
const allowedOrigins = [
  "http://localhost:5173",       // your local frontend (Vite, etc.)
  "https://www.eduai2025.app",
  "https://eduai2025.app"        // your deployed frontend
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "DELETE"], // restrict to used HTTP methods
  allowedHeaders: ["Content-Type"],   // optional: restrict headers
  credentials: true                   // optional: allow cookies (if needed)
}));
app.use(express.json());
app.use(express.static("uploads"));
const gcs = new Storage({
  credentials: JSON.parse(process.env.GCS_CREDENTIALS),
});
const bucketName = 'your-bucket-name';
const bucket = gcs.bucket(bucketName);

// 🔹 Ensure "uploads" directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// 🔹 Multer Storage Config
const upload = multer({ storage: multer.memoryStorage() }); // ✅ Keeps file in memory only


// 🔹 Upload PDF API
app.post("/upload", upload.single("pdf"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded!" });
    }

    const gcsFilename = Date.now() + "-" + req.file.originalname;
    const file = bucket.file(gcsFilename);

    const stream = file.createWriteStream({
        resumable: false,
        contentType: req.file.mimetype,
    });

    stream.on("error", (err) => {
        console.error("❌ GCS Upload Error:", err);
        res.status(500).json({ error: "Failed to upload to GCS" });
    });

    stream.on("finish", () => {
        console.log(`✅ Uploaded to GCS: ${gcsFilename}`);

        // OPTIONAL: Download file locally if your Python script still needs a file path
        const localPath = path.join(__dirname, "uploads", gcsFilename);
        file.download({ destination: localPath }).then(() => {
            exec(`python server.py "${localPath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`❌ AI Processing Error: ${error.message}`);
                    return res.status(500).json({ error: "AI processing failed!" });
                }

                console.log(`🔹 AI Output: ${stdout}`);
                res.json({
                    message: "File uploaded to GCS and AI processing completed!",
                    filename: gcsFilename,
                    gcs_url: `https://storage.googleapis.com/${bucketName}/${gcsFilename}`
                });
            });
        }).catch(err => {
            console.error("❌ GCS Download Error:", err);
            res.status(500).json({ error: "Failed to download file for AI processing" });
        });
    });

    stream.end(req.file.buffer); // ✅ send buffer to GCS
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
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
