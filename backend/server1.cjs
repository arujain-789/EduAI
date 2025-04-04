require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();

// =====================
// Security Middlewares
// =====================
app.use(helmet());
app.use(express.json({ limit: '10mb' }));

// =====================
// Rate Limiting
// =====================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later'
});

app.use(apiLimiter);

// =====================
// CORS Configuration
// =====================
const allowedOrigins = [
  "https://www.eduai2025.app",
  "https://eduai2025.app"
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Allow no-origin requests
    
    // Case-insensitive comparison
    const originLower = origin.toLowerCase();
    const isAllowed = allowedOrigins.some(
      allowed => originLower === allowed.toLowerCase()
    );

    if (isAllowed) {
      return callback(null, true);
    }

    console.warn(`Blocked CORS request from: ${origin}`);
    callback(new Error(`Origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// =====================
// File Upload Setup
// =====================
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

// =====================
// Routes
// =====================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString()
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

    const safePath = path.join(uploadDir, req.file.filename);
    
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
      details: error.message
    });
  }
});

// =====================
// Helper Functions
// =====================
function processPDF(filePath) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python3', [
      path.join(__dirname, 'server.py'),
      filePath
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000 // 30 seconds
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0 || stderr) {
        return reject(new Error(stderr || 'Processing failed'));
      }
      
      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error('Invalid response format'));
      }
    });

    pythonProcess.on('error', (err) => {
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
  if (err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// =====================
// Server Startup
// =====================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
});

// Handle process events
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});
