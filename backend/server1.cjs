const express = require("express");
const multer = require("multer");
const { Storage } = require("@google-cloud/storage");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { spawn } = require("child_process");

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

// ✅ Middleware
app.use(cors({
  origin: ['https://www.eduai2025.app', 'https://eduai2025.app'],
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
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

    // Call Python script (Safer)
    const pythonProcess = spawn("python3", [pythonScriptPath, signedUrl]);

    pythonProcess.stdout.on("data", (data) => {
      try {
        const aiResponse = JSON.parse(data.toString());
        res.json({
          message: "✅ Success!",
          url: signedUrl,
          filename: fileName,
          marks: aiResponse.marks,
          feedback: aiResponse.feedback,
        });
      } catch (err) {
        res.status(500).json({ error: "Invalid AI response" });
      }
    });

    pythonProcess.stderr.on("data", (data) => {
      res.status(500).json({ error: `AI failed: ${data.toString()}` });
    });

  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ✅ List Uploaded Files
app.get("/list", async (req, res) => {
  try {
    const [files] = await bucket.getFiles({ prefix: "uploads/" });
    res.json(files.map(file => file.name.split("/").pop()));
  } catch (err) {
    res.status(500).json([]);
  }
});

// ✅ Test Route
app.get("/test", (req, res) => {
  res.json({ status: "Backend connected", timestamp: new Date() });
});

// ✅ Start Server
(async () => {
  try {
    const [exists] = await bucket.exists();
    if (!exists) throw new Error(`Bucket ${bucketName} not found!`);

    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  } catch (err) {
    console.error("❌ GCS Error:", err.message);
    process.exit(1);
  }
})();
