import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db, runMigrations } from "./db";
import { sql } from "drizzle-orm";
import session from "express-session";
import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

// Fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Run database migrations first
async function initDatabase() {
  try {
    console.log("Initializing database connection...");
    // Temporarily skip migrations for debugging
    // await runMigrations();

    // Test basic database connectivity
    await db.execute(sql`SELECT 1`);
    console.log("Database connection successful");
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

// Load or generate secure session secret
const SESSION_SECRET_FILE = path.join(__dirname, "..", "session-secret.txt");
let sessionSecret: string;

try {
  if (fs.existsSync(SESSION_SECRET_FILE)) {
    sessionSecret = fs.readFileSync(SESSION_SECRET_FILE, "utf8").trim();
  } else {
    // Generate a new secret
    sessionSecret = randomBytes(64).toString("hex");
    fs.writeFileSync(SESSION_SECRET_FILE, sessionSecret);
  }
} catch (error) {
  console.error("Error managing session secret:", error);
  sessionSecret = process.env.SESSION_SECRET || randomBytes(64).toString("hex");
}

// Run database initialization
initDatabase().catch(err => {
  console.error("Failed to initialize database:", err);
});

async function initializeServer() {
  const app = express();

  try {
    log("Starting server initialization", "startup");

    // Check critical environment variables
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    // Basic middleware setup
    log("Setting up middleware", "startup");
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ 
      secret: sessionSecret, 
      resave: false, 
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    }));

    // Request logging middleware
    app.use((req, res, next) => {
      log(`${req.method} ${req.path}`, "request");
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

    return app;
  } catch (error) {
    log(`Fatal error during server initialization: ${error}`, "startup");
    throw error;
  }
}

async function startServer(): Promise<void> {
  const PORT = 5000; // Always use port 5000

  try {
    log("Beginning server startup sequence...", "startup");
    const app = await initializeServer();

    // Setup routes
    log("Setting up routes...", "startup");
    const server = await registerRoutes(app);
    log("Routes setup complete", "startup");

    // Setup frontend
    try {
      log("Setting up frontend...", "startup");
      // Always use static file serving for development
      serveStatic(app);
      log("Frontend setup complete", "startup");
    } catch (frontendError) {
      log(`Frontend setup error: ${frontendError}`, "startup");
      // Continue server startup even if frontend setup fails
    }

    // Start server with error handling
    await new Promise<void>((resolve, reject) => {
      log(`Starting server on port ${PORT}...`, "startup");

      server.listen(PORT, "0.0.0.0", () => {
        log(`Server successfully started on port ${PORT}`, "startup");
        resolve();
      }).on('error', (error: any) => {
        log(`Server startup error: ${error}`, "startup");
        reject(error);
      });

      // Handle graceful shutdown
      const shutdown = () => {
        log('Shutting down gracefully...', "startup");
        server.close(() => {
          log('Server closed', "startup");
          process.exit(0);
        });
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    });

  } catch (error) {
    log(`Fatal error during server startup: ${error}`, "startup");
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  log(`Unhandled error during server startup: ${error}`, "startup");
  process.exit(1);
});