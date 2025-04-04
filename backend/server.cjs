import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: 'uploads/' });

// Enhanced CORS configuration
const allowedOrigins = [
  "https://www.eduai2025.app",
  "https://eduai2025.app",
  process.env.NODE_ENV === "development" && "http://localhost:3000"
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

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
});
