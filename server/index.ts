import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from 'fs';
import path from 'path';

const app = express();
const DEFAULT_PORT = 5000;

// Force production mode for Stripe redirects
process.env.NODE_ENV = 'production';

console.log("[SERVER] Starting server with environment:", {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT || DEFAULT_PORT,
  STRIPE_CONFIGURED: !!process.env.STRIPE_SECRET_KEY,
  DATABASE_CONFIGURED: !!process.env.DATABASE_URL
});

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Simple request logging
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.path}`);
  next();
});

// Basic error handling
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERROR]", err);
  res.status(500).json({ message: "Internal server error" });
});

// Health check endpoint
app.get("/api/status", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

async function startServer(port: number = DEFAULT_PORT): Promise<void> {
  try {
    // Test database connection
    console.log("[SERVER] Testing database connection...");
    await db.execute(sql`SELECT 1`);
    console.log("[SERVER] Database connection successful");

    // Setup routes
    console.log("[SERVER] Setting up routes...");
    const server = await registerRoutes(app);
    console.log("[SERVER] Routes setup complete");

    // Setup frontend
    try {
      console.log("[SERVER] Setting up static file serving...");
      const buildDir = path.join(process.cwd(), 'server', 'public');

      if (!fs.existsSync(buildDir)) {
        console.warn("[SERVER] Build directory not found:", buildDir);
        console.warn("[SERVER] Static file serving will be disabled until build is present");
      } else {
        serveStatic(app);
        console.log("[SERVER] Frontend setup complete");
      }
    } catch (frontendError) {
      console.error("[SERVER] Frontend setup error:", frontendError);
      // Continue server startup even if frontend setup fails
    }

    // Start server with error handling
    await new Promise<void>((resolve, reject) => {
      console.log("[SERVER] Attempting to start server on port", port);

      const timeoutId = setTimeout(() => {
        reject(new Error(`Server failed to start within 10 seconds on port ${port}`));
      }, 10000);

      server.listen({
        port,
        host: "0.0.0.0",
      }, () => {
        clearTimeout(timeoutId);
        console.log(`[SERVER] Server started successfully on port ${port}`);
        console.log("[SERVER] Production URL configured for Stripe:", 'https://poultryauction.co');
        resolve();
      }).on('error', (error: any) => {
        clearTimeout(timeoutId);
        if (error.code === 'EADDRINUSE') {
          console.log(`[SERVER] Port ${port} is already in use, trying port ${port + 1}`);
          startServer(port + 1);
        } else {
          console.error('[SERVER] Server error:', error);
          reject(error);
        }
      });

      // Handle graceful shutdown
      const shutdown = () => {
        console.log('[SERVER] Shutting down gracefully...');
        server.close(() => {
          console.log('[SERVER] Server closed');
          process.exit(0);
        });
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    });

  } catch (error: any) {
    if (error.code === 'EADDRINUSE') {
      console.log(`[SERVER] Retrying with port ${port + 1}`);
      await startServer(port + 1);
    } else {
      console.error("[SERVER] Fatal error during startup:", error);
      process.exit(1);
    }
  }
}

// Start the server
startServer();