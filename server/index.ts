import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";

console.log("[SERVER] Starting minimal server initialization...");

const app = express();

// Simple error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERROR]", err);
  res.status(500).json({ message: "Internal server error" });
});

// Basic JSON parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Basic request logging
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.path}`);
  next();
});

// Basic health check endpoint
app.get("/api/status", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

(async () => {
  try {
    // Test database connection
    console.log("[SERVER] Testing database connection...");
    await db.execute(sql`SELECT 1`);
    console.log("[SERVER] Database connection successful");

    // Setup minimal routes
    console.log("[SERVER] Setting up routes...");
    const server = await registerRoutes(app);
    console.log("[SERVER] Routes setup complete");

    // Setup static serving or Vite
    if (process.env.REPLIT_DOMAIN) {
      console.log("[SERVER] Setting up static serving...");
      serveStatic(app);
    } else {
      console.log("[SERVER] Setting up Vite...");
      await setupVite(app, server);
    }

    // Start server
    const port = 5000;
    server.listen({
      port,
      host: "0.0.0.0",
    }, () => {
      console.log(`[SERVER] Server started on port ${port}`);
    });

  } catch (error) {
    console.error("[SERVER] Fatal error during startup:", error);
    process.exit(1);
  }
})();