
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import type { Request, Response } from 'express';

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
  }
});

export const upload = multer({ storage });

// Handle file upload
export const handleFileUpload = (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files were uploaded' });
    }
    
    const fileUrls = files.map(file => `/uploads/${file.filename}`);
    
    return res.status(200).json({ 
      message: 'Files uploaded successfully',
      files: fileUrls
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    return res.status(500).json({ message: 'Failed to upload files' });
  }
};
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniquePrefix = uuidv4();
    const extension = path.extname(file.originalname);
    cb(null, `${uniquePrefix}${extension}`);
  }
});

// Create multer upload instance with file filter for images
export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Handler for file uploads
export async function handleFileUpload(req: Request, res: Response) {
  try {
    if (!req.files || !Array.isArray(req.files)) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    // Process uploaded files
    const files = req.files as Express.Multer.File[];
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Generate URLs for the uploaded files
    const urls = files.map(file => `${baseUrl}/uploads/${file.filename}`);
    
    res.status(201).json({ 
      message: 'Files uploaded successfully',
      urls,
      count: files.length
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({ message: 'Failed to upload files' });
  }
}
