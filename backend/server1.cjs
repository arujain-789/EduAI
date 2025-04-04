const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

const allowedOrigins = [
  "https://www.eduai2025.app",
  "https://eduai2025.app",
  process.env.NODE_ENV === "development" && "http://localhost:3000"
].filter(Boolean);

// Rest of your existing code using CommonJS syntax...
// (Keep all your route handlers and logic the same,
// just change the import/export syntax to require/module.exports)
// 2. Then use it in CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    const msg = `CORS blocked for origin: ${origin}`;
    console.warn(msg);
    return callback(new Error(msg));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// 3. Apply CORS middleware
app.use(cors(corsOptions));
app.use(express.json());

// Process PDF endpoint
app.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = path.join(__dirname, req.file.path);
    console.log(`File uploaded: ${filePath}`);

    const result = await processPDF(filePath);
    
    // Cleanup uploaded file after processing
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });

    res.json(result);
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ 
      error: 'AI processing failed',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/test', (req, res) => {
  res.json({ status: 'API working' });
});

function processPDF(filePath) {
  return new Promise((resolve, reject) => {
    const pythonProcess = exec(
      `python3 grader.py "${filePath}"`, 
      { 
        maxBuffer: 1024 * 1024 * 5, // 5MB
        timeout: 30000 // 30 seconds
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Execution Error: ${error.message}`);
          return reject(new Error('AI processing failed'));
        }
        if (stderr) {
          console.error(`❌ Python Error: ${stderr}`);
          return reject(new Error(stderr));
        }

        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (parseError) {
          console.error('❌ JSON Parse Error:', parseError);
          console.error('Raw Output:', stdout);
          reject(new Error('Invalid AI response format'));
        }
      }
    );

    pythonProcess.on('timeout', () => {
      pythonProcess.kill();
      reject(new Error('AI processing timed out'));
    });
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
});
