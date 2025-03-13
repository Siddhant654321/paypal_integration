import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Request, Response } from 'express';
import express from 'express';

// Constants
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Ensure the uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log("[UPLOAD] Created uploads directory at:", UPLOADS_DIR);
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

// Create multer upload instance
export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
  },
  fileFilter: (_req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Configure static file serving
export function setupUploads(app: express.Express) {
  // Serve files from the uploads directory
  app.use('/uploads', express.static(UPLOADS_DIR));
  console.log("[UPLOAD] Configured static file serving for uploads directory");
}

// Helper function to get base URL
function getBaseUrl(req: Request): string {
  const protocol = req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
}

// Handler for file uploads
export async function handleFileUpload(req: Request, res: Response) {
  try {
    console.log("[UPLOAD] Starting file upload handling");

    if (!req.files || !Array.isArray(req.files)) {
      console.log("[UPLOAD] No files uploaded");
      return res.status(400).json({ message: 'No files uploaded' });
    }

    // Process uploaded files
    const files = req.files as Express.Multer.File[];
    console.log("[UPLOAD] Processing", files.length, "files");

    // Get base URL
    const baseUrl = getBaseUrl(req);
    console.log("[UPLOAD] Using base URL:", baseUrl);

    // Generate URLs for the uploaded files
    const urls = files.map(file => {
      const url = `${baseUrl}/uploads/${file.filename}`;
      console.log("[UPLOAD] Generated URL for file:", {
        filename: file.filename,
        url: url
      });
      return url;
    });

    console.log("[UPLOAD] Successfully processed all files:", {
      count: files.length,
      urls: urls
    });

    res.status(201).json({ 
      message: 'Files uploaded successfully',
      urls,
      count: files.length
    });
  } catch (error) {
    console.error('[UPLOAD] Error uploading files:', error);
    res.status(500).json({ message: 'Failed to upload files' });
  }
}