import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";

const app = express();

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

(async () => {
  try {
    // Test database connection
    console.log("[SERVER] Testing database connection...");
    await db.execute(sql`SELECT 1`);
    console.log("[SERVER] Database connection successful");

    // Setup routes
    console.log("[SERVER] Setting up routes...");
    const server = await registerRoutes(app);
    console.log("[SERVER] Routes setup complete");

    // Setup static serving or Vite
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