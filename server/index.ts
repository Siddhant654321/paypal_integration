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

// Fix for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Run database migrations first
async function initDatabase() {
  try {
    console.log("Initializing database and running migrations...");
    await runMigrations();

    // Additional check for stripe_charge_id column
    try {
      await db.execute(sql`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'payments' AND column_name = 'stripe_charge_id'
          ) THEN
            ALTER TABLE "payments" ADD COLUMN "stripe_charge_id" varchar;
          END IF;
        END $$;
      `);
      console.log("Database initialization complete");
    } catch (columnError) {
      console.error("Error checking/adding stripe_charge_id column:", columnError);
    }
  } catch (error) {
    console.error("Database initialization error:", error);
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
    sessionSecret = require("crypto").randomBytes(64).toString("hex");
    fs.writeFileSync(SESSION_SECRET_FILE, sessionSecret);
  }
} catch (error) {
  console.error("Error managing session secret:", error);
  sessionSecret = process.env.SESSION_SECRET || require("crypto").randomBytes(64).toString("hex");
}

// Run database initialization
initDatabase().catch(err => {
  console.error("Failed to initialize database:", err);
});

async function initializeServer() {
  const app = express();
  const DEFAULT_PORT = 5000;

  try {
    log("Starting server initialization", "startup");

    // Check critical environment variables
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    if (!process.env.SESSION_SECRET) {
      log("Warning: SESSION_SECRET not set, using default value", "startup");
    }

    // Test database connection with retry logic
    let retries = 5;
    while (retries > 0) {
      try {
        log("Testing database connection...", "startup");
        await db.execute(sql`SELECT 1`);
        log("Database connection successful", "startup");
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw new Error(`Failed to connect to database after 5 attempts: ${error}`);
        }
        log(`Database connection failed, retrying... (${retries} attempts remaining)`, "startup");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Basic middleware setup
    log("Setting up middleware", "startup");
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(session({ secret: sessionSecret, resave: false, saveUninitialized: false }));

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

async function startServer(port: number = 5000): Promise<void> {
  try {
    const app = await initializeServer();

    // Setup routes
    log("Setting up routes...", "startup");
    const server = await registerRoutes(app);
    log("Routes setup complete", "startup");

    // Setup frontend
    try {
      if (process.env.NODE_ENV === "production") {
        log("Setting up static file serving...", "startup");
        serveStatic(app);
      } else {
        log("Setting up Vite development server...", "startup");
        await setupVite(app, server);
      }
      log("Frontend setup complete", "startup");
    } catch (frontendError) {
      log(`Frontend setup error: ${frontendError}`, "startup");
      // Continue server startup even if frontend setup fails
    }

    // Start server with error handling
    await new Promise<void>((resolve, reject) => {
      server.listen({
        port,
        host: "0.0.0.0",
      }, () => {
        log(`Server started on port ${port}`, "startup");
        resolve();
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          log(`Port ${port} is already in use`, "startup");
          reject(error);
        } else {
          log(`Server error: ${error}`, "startup");
          reject(error);
        }
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

  } catch (error: any) {
    if (error.code === 'EADDRINUSE') {
      log(`Retrying with port ${port + 1}`, "startup");
      await startServer(port + 1);
    } else {
      log(`Fatal error during startup: ${error}`, "startup");
      process.exit(1);
    }
  }
}

// Start the server
startServer().catch((error) => {
  log(`Unhandled error during server startup: ${error}`, "startup");
  process.exit(1);
});