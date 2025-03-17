import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import sharp from 'sharp';
import { Request, Response } from 'express';

// Constants
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const THUMBNAILS_DIR = path.join(UPLOADS_DIR, 'thumbnails');
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
const THUMB_WIDTH = 300;
const THUMB_HEIGHT = 300;
const JPEG_QUALITY = 80;

// Ensure the uploads and thumbnails directories exist
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log("[UPLOAD] Created uploads directory at:", UPLOADS_DIR);
  }
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    console.log("[UPLOAD] Created thumbnails directory at:", THUMBNAILS_DIR);
  }
} catch (error) {
  console.error("[UPLOAD] Error creating directories:", error);
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

// Create multer upload instance with file filter for images
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

// Helper function to get base URL
function getBaseUrl(req: Request): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const protocol = isProduction ? 'https' : req.protocol;
  const host = isProduction ? process.env.HOST_URL || req.get('host') : req.get('host');
  return `${protocol}://${host}`;
}

// Process and optimize a single image
async function processImage(file: Express.Multer.File, baseUrl: string): Promise<{ optimized: string; thumbnail: string; } | null> {
  try {
    console.log("[UPLOAD] Processing image:", file.originalname);

    const ext = path.extname(file.filename);
    const baseFilename = path.basename(file.filename, ext);
    const optimizedFilename = `${baseFilename}_opt${ext}`;
    const thumbnailFilename = `${baseFilename}_thumb${ext}`;
    const optimizedPath = path.join(UPLOADS_DIR, optimizedFilename);
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);

    // Process main image
    await sharp(file.path)
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toFile(optimizedPath);

    console.log("[UPLOAD] Created optimized image at:", optimizedPath);

    // Create thumbnail
    await sharp(file.path)
      .resize(THUMB_WIDTH, THUMB_HEIGHT, {
        fit: 'cover',
        position: 'centre'
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toFile(thumbnailPath);

    console.log("[UPLOAD] Created thumbnail at:", thumbnailPath);

    // Delete original file
    await fs.promises.unlink(file.path);
    console.log("[UPLOAD] Deleted original file:", file.path);

    return {
      optimized: `${baseUrl}/uploads/${optimizedFilename}`,
      thumbnail: `${baseUrl}/uploads/thumbnails/${thumbnailFilename}`
    };
  } catch (error) {
    console.error('[UPLOAD] Error processing image:', {
      filename: file.originalname,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return null;
  }
}

// Handler for file uploads
export async function handleFileUpload(req: Request, res: Response) {
  try {
    console.log("[UPLOAD] Starting file upload handling");

    const files = req.files as Express.Multer.File[];
    if (!files || !Array.isArray(files)) {
      console.log("[UPLOAD] No files found in request");
      return res.status(400).json({ message: 'No files uploaded' });
    }

    console.log("[UPLOAD] Processing", files.length, "files");
    const baseUrl = getBaseUrl(req);

    const processedFiles = await Promise.all(
      files.map(async (file) => await processImage(file, baseUrl))
    );

    const successfulUploads = processedFiles.filter(Boolean);
    console.log("[UPLOAD] Successfully processed files:", {
      total: files.length,
      successful: successfulUploads.length
    });

    return res.status(201).json({
      message: 'Files uploaded and optimized successfully',
      files: successfulUploads,
      count: successfulUploads.length
    });
  } catch (error) {
    console.error('[UPLOAD] Error uploading files:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return res.status(500).json({ message: 'Failed to upload files' });
  }
}