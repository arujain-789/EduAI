// server.js
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { Storage } = require("@google-cloud/storage");
const { exec } = require("child_process");
const path = require("path");
require("dotenv").config();
const outputPath = path.join(__dirname, "output.json");
const fs = require("fs");
const app = express();
const PORT = 3000;

app.use(cors({ origin: "https://www.eduai2025.app" }));
app.use(express.json());

// 🧠 Multer (memory storage - no disk)
const upload = multer({ storage: multer.memoryStorage() });
const credentials = JSON.parse(process.env.GCS_CREDENTIALS);

const storage = new Storage({ credentials });
const bucketName = 'eduai2025storage';

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  const bucket = storage.bucket(bucketName);

// 🔹 /upload route
app.post("/upload", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filename = `${Date.now()}-${req.file.originalname}`;
    const file = bucket.file(filename);

    // Upload to GCS
    const stream = file.createWriteStream({
      resumable: false,
      contentType: req.file.mimetype,
    });

    stream.on("error", err => {
      console.error("❌ Upload Error:", err);
      res.status(500).json({ error: "Upload failed" });
    });

    stream.on("finish", async () => {
      try {
        // 🔐 Generate signed URL (10 min expiry)
        const [signedUrl] = await file.getSignedUrl({
          action: "read",
          expires: Date.now() + 10 * 60 * 1000,
        });

        console.log("✅ Signed URL:", signedUrl);

        // 🔁 Call Python script with signed URL
        const command = `python server1.py "${signedUrl}"`;
        exec(command, (error, stdout, stderr) => {
          if (error) {
            console.error("❌ Python Error:", error.message);
            return res.status(500).json({ error: "AI failed" });
          }

          fs.readFile(outputPath, "utf8", (err, data) => {
            if (err) {
              console.error("❌ Failed to read output.json:", err);
              return res.status(500).json({ error: "Failed to read AI output" });
            }
          
            const outputData = JSON.parse(data);
            console.log("📦 AI Feedback & Marks:", outputData);

            res.json({
              message: "Upload & processing complete",
              filename,
              signedUrl,
              aiFeedback: outputData.feedback,
              marks: outputData.marks,
            });
          });
        });
      } catch (err) {
        console.error("❌ Signed URL error:", err);
        res.status(500).json({ error: "Could not create signed URL" });
      }
    });

    stream.end(req.file.buffer); // Upload buffer to GCS
  } catch (err) {
    console.error("❌ Upload Route Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 🔹 Start server
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://www.eduai2025.app/public/index.html`)
);
