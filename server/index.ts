import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";

console.log("[SERVER] Starting server initialization...");

const app = express();

// Basic error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERROR]", {
    message: err.message,
    stack: err.stack,
    type: err.constructor.name
  });
  res.status(500).json({ 
    message: "Internal server error",
    timestamp: new Date().toISOString()
  });
});

// Basic JSON parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Simple request logging
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[REQUEST] ${req.method} ${req.path}`);
  }
  next();
});

// Basic health check endpoint
app.get("/api/status", (_req, res) => {
  try {
    const status = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
    res.json(status);
  } catch (error) {
    console.error("[Status Check] Error:", error);
    res.status(500).json({ status: "error" });
  }
});

(async () => {
  try {
    log("Starting minimal server initialization...");

    // Test database connection
    try {
      log("Testing database connection...");
      await db.execute(sql`SELECT 1`);
      log("Database connection successful");
    } catch (dbError) {
      log(`Database connection failed: ${dbError}`);
      throw dbError;
    }

    // Initialize minimal routes first
    log("Setting up minimal routes...");
    const server = await registerRoutes(app);
    log("Minimal routes setup complete");

    // Setup static serving or Vite
    if (process.env.REPLIT_DOMAIN) {
      log("Setting up static serving...");
      serveStatic(app);
    } else {
      log("Setting up Vite...");
      await setupVite(app, server);
    }

    // Start server
    const port = 5000;
    server.listen({
      port,
      host: "0.0.0.0",
    }, () => {
      const domain = process.env.REPLIT_DOMAIN ? 
        `https://${process.env.REPLIT_DOMAIN}` : 
        `http://localhost:${port}`;
      log(`Server started successfully on ${domain}`);
    }).on('error', (error: Error) => {
      log(`Server startup error: ${error.message}`);
      process.exit(1);
    });

  } catch (error) {
    log(`Fatal error during server startup: ${error}`);
    process.exit(1);
  }
})();