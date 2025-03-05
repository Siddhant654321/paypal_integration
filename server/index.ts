import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";

const app = express();
const DEFAULT_PORT = 5000;

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
app.get("/api/status", async (_req, res) => {
  try {
    // Test database connection
    await db.execute(sql`SELECT 1`);
    res.json({ 
      status: "ok", 
      database: "connected",
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error("[STATUS] Database connection error:", error);
    res.status(500).json({ 
      status: "error", 
      database: "disconnected",
      timestamp: new Date().toISOString() 
    });
  }
});

async function startServer(port: number = DEFAULT_PORT, retries = 3): Promise<void> {
  try {
    // Test database connection with retries
    console.log("[SERVER] Testing database connection...");
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        await db.execute(sql`SELECT 1`);
        console.log("[SERVER] Database connection successful");
        break;
      } catch (error) {
        lastError = error;
        console.error(`[SERVER] Database connection attempt ${i + 1} failed:`, error);
        if (i < retries - 1) {
          console.log("[SERVER] Retrying in 2 seconds...");
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    if (lastError) throw lastError;

    // Setup routes
    console.log("[SERVER] Setting up routes...");
    const server = await registerRoutes(app);
    console.log("[SERVER] Routes setup complete");

    // Setup frontend
    try {
      if (process.env.NODE_ENV === "production") {
        console.log("[SERVER] Setting up static file serving...");
        serveStatic(app);
      } else {
        console.log("[SERVER] Setting up Vite development server...");
        await setupVite(app, server);
      }
      console.log("[SERVER] Frontend setup complete");
    } catch (frontendError) {
      console.error("[SERVER] Frontend setup error:", frontendError);
      // Continue server startup even if frontend setup fails
    }

    // Start server with error handling
    await new Promise<void>((resolve, reject) => {
      server.listen({
        port,
        host: "0.0.0.0",
      }, () => {
        console.log(`[SERVER] Server started on port ${port}`);
        resolve();
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`[SERVER] Port ${port} is already in use`);
          reject(error);
        } else {
          console.error('[SERVER] Server error:', error);
          reject(error);
        }
      });

      // Handle graceful shutdown
      const shutdown = () => {
        console.log('[SERVER] Shutting down gracefully...');
        server.close(async () => {
          try {
            await db.execute(sql`SELECT 1`); // Final connection check
            console.log('[SERVER] Database connection closed');
          } catch (error) {
            console.error('[SERVER] Error closing database connection:', error);
          }
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