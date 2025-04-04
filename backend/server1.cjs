require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Storage } = require('@google-cloud/storage'); // GCS client

const app = express();

// =====================
// Configuration
// =====================
const config = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  pythonScript: path.join(__dirname, 'server.py'),
  uploadDir: path.join(__dirname, 'uploads'),
  allowedOrigins: [
    "https://www.eduai2025.app",
    "https://eduai2025.app"
  ],
  gcsBucket: process.env.BUCKET_NAME || 'eduai2025storage' // GCS config
};

// Initialize Google Cloud Storage
const storage = new Storage({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  projectId: process.env.PROJECT_ID
});
const bucket = storage.bucket(config.gcsBucket);

// =====================
// Security Middlewares
// =====================
app.use(helmet());
app.use(express.json({ limit: config.maxFileSize }));

// =====================
// Rate Limiting
// =====================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests, please try again later'
});
app.use(apiLimiter);

// =====================
// CORS Configuration
// =====================
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const originRegex = /^https?:\/\/(?:www\.)?eduai2025\.app(?:\.\w+)?$/;
    if (originRegex.test(origin)) {
      return callback(null, true);
    }
    console.warn(`Blocked CORS request from: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// =====================
// File Upload Setup (with GCS)
// =====================
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory for GCS upload
  limits: { fileSize: config.maxFileSize },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// =====================
// Routes (with GCS processing)
// =====================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    gcsBucket: config.gcsBucket // Verify GCS connection
  });
});

app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // 1. Upload to GCS
    const gcsFileName = `pdfs/${Date.now()}-${req.file.originalname}`;
    const file = bucket.file(gcsFileName);
    
    await file.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype },
    });

    // 2. Process with Python (using GCS path)
    const result = await processPDF(`gs://${config.gcsBucket}/${gcsFileName}`);
    
    res.json({
      ...result,
      gcsPath: gcsFileName // Return GCS reference
    });

  } catch (error) {
    console.error('Upload error:', error.stack);
    res.status(500).json({ 
      error: 'Processing failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// =====================
// Helper Functions (GCS-aware)
// =====================
async function processPDF(filePath) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [
      config.pythonScript, 
      filePath,
      `--gcs-bucket=${config.gcsBucket}` // Pass GCS info to Python
    ], {
      timeout: 60000
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error('Python Error:', data.toString());
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(stderr || 'Python process failed');
        error.code = code;
        return reject(error);
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error('Invalid response format'));
      }
    });
  });
}

// =====================
// Server Startup
// =====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`GCS Bucket: ${config.gcsBucket}`);
  console.log(`WARNING: Running without authentication`);
});
