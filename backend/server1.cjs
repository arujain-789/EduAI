require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const basicAuth = require('express-basic-auth');

const app = express();

// =====================
// Configuration
// =====================
const config = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  pythonScript: path.join(__dirname, 'pdf_processor.py'),
  uploadDir: path.join(__dirname, 'uploads'),
  allowedOrigins: [
    "https://www.eduai2025.app",
    "https://eduai2025.app"
  ]
};

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
// Authentication
// =====================
app.use(basicAuth({
  users: { [process.env.API_USER]: process.env.API_PASSWORD },
  challenge: true,
  unauthorizedResponse: 'Unauthorized access'
}));

// =====================
// CORS Configuration
// =====================
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS']
};
app.use(cors(corsOptions));

// =====================
// File Upload Setup
// =====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(config.uploadDir)) {
      fs.mkdirSync(config.uploadDir, { recursive: true });
    }
    cb(null, config.uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
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
// Routes
// =====================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version
  });
});

app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await processPDF(req.file.path);
    
    // Cleanup
    try {
      fs.unlinkSync(req.file.path);
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }

    res.json(result);
  } catch (error) {
    console.error('Upload error:', error.stack);
    res.status(500).json({ 
      error: 'Processing failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// =====================
// Helper Functions
// =====================
async function processPDF(filePath) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [config.pythonScript, filePath], {
      timeout: 60000 // 60 seconds timeout
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
        const result = JSON.parse(stdout);
        if (result.error) {
          throw new Error(result.error);
        }
        resolve(result);
      } catch (parseError) {
        console.error('Parse Error:', parseError);
        reject(new Error('Invalid response format from processor'));
      }
    });

    pythonProcess.on('error', (err) => {
      console.error('Process Error:', err);
      reject(err);
    });
  });
}

// =====================
// Error Handling
// =====================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
});

// =====================
// Server Startup
// =====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
