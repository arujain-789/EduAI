const express = require("express");
const multer = require("multer");
const { Storage } = require("@google-cloud/storage");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { spawn } = require("child_process");
require("dotenv").config(); // Load environment variables from .env

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Parse Google Cloud credentials
let credentials;
try {
  credentials = JSON.parse(process.env.GCS_CREDENTIALS);
} catch (error) {
  console.error("❌ Error parsing Google Cloud credentials:", error.message);
  process.exit(1);
}

// ✅ Google Cloud Storage Configuration
const storage = new Storage({ credentials });
const bucketName = process.env.BUCKET_NAME || "your-bucket-name";
const bucket = storage.bucket(bucketName);
const pythonScriptPath = process.env.PYTHON_SCRIPT_PATH || "./server.py";

// ✅ CORS Configuration
const corsOptions = {
  origin: ["https://www.eduai2025.app", "https://eduai2025.app"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept"],
  credentials: true,
};

app.use(cors(corsOptions));

// ✅ Middleware
app.use(express.json());

// ✅ Explicitly Set CORS Headers (Preflight Handling)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "https://www.eduai2025.app");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Credentials", "true");
  
  if (req.method === "OPTIONS") return res.sendStatus(200);
  
  next();
});

// ✅ Multer Storage Configuration (for memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// ✅ Upload Route
app.post("/upload", upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "❌ No file uploaded!" });

  try {
    const fileName = `uploads/${uuidv4()}-${req.file.originalname}`;
    const file = bucket.file(fileName);

    // Upload to GCS
    await file.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype },
    });

    // Generate signed URL
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 3600000, // 1 hour
    });

    console.log(`✅ File uploaded: ${fileName}`);

    // Call Python script for grading
    const pythonProcess = spawn("python3", [pythonScriptPath, signedUrl]);
    
    let aiResponse = "";
    let aiError = "";

    pythonProcess.stdout.on("data", (data) => {
      aiResponse += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      aiError += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (aiError) {
        console.error("❌ AI Error:", aiError);
        return res.status(500).json({ error: "AI processing failed", details: aiError });
      }

      try {
        const parsedResponse = JSON.parse(aiResponse);
        return res.json({
          message: "✅ Success!",
          url: signedUrl,
          filename: fileName,
          marks: parsedResponse.marks,
          feedback: parsedResponse.feedback,
        });
      } catch (err) {
        console.error("❌ AI Response Error:", err);
        return res.status(500).json({ error: "Invalid AI response" });
      }
    });

  } catch (err) {
    console.error("❌ Upload Error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// ✅ List Uploaded Files
app.get("/list", async (req, res) => {
  try {
    const [files] = await bucket.getFiles({ prefix: "uploads/" });
    res.json(files.map(file => file.name.split("/").pop()));
  } catch (err) {
    console.error("❌ Error fetching file list:", err);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// ✅ Test Route
app.get("/test", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "https://www.eduai2025.app");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  res.json({ status: "Backend connected", timestamp: new Date() });
});

// ✅ Start Server
(async () => {
  try {
    const [exists] = await bucket.exists();
    if (!exists) throw new Error(`❌ Bucket ${bucketName} not found!`);

    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ GCS Error:", err.message);
    process.exit(1);
  }
})();

