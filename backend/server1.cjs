require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();

// Security Middleware
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per window
});
app.use(limiter);

// Enhanced CORS Configuration
const allowedOrigins = [
  "https://www.eduai2025.app",
  "https://eduai2025.app",
  ...(process.env.NODE_ENV === "development" ? [
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ] : [])
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin && process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    if (allowedOrigins.some(allowedOrigin => {
      return origin === allowedOrigin || 
             new URL(origin).hostname === new URL(allowedOrigin).hostname;
    })) {
      return callback(null, true);
    }
    
    console.warn(`CORS blocked: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Preflight requests

// File Upload Configuration
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  } else if (err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Routes
app.get('/test', (req, res) => {
  res.json({ 
    status: 'API working',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Secure file path handling
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, req.file.filename);
    const safePath = path.normalize(filePath);
    
    // Security check
    if (!safePath.startsWith(uploadDir)) {
      throw new Error('Invalid file path');
    }

    // Process PDF
    const result = await processPDF(safePath);
    
    // Cleanup
    try {
      fs.unlinkSync(safePath);
    } catch (cleanupErr) {
      console.error('Cleanup error:', cleanupErr);
    }

    res.json(result);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Processing failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper Functions
function processPDF(filePath) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [
      '-u',
      path.join(__dirname, 'grader.py'),
      filePath
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => stdout += data.toString());
    pythonProcess.stderr.on('data', (data) => stderr += data.toString());

    pythonProcess.on('close', (code) => {
      if (code !== 0 || stderr) {
        return reject(new Error(stderr || 'Python process failed'));
      }
      
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error('Invalid AI response format'));
      }
    });

    pythonProcess.on('error', (err) => {
      reject(err);
    });
  });
}

// Server Startup
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle uncaught exceptions
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
