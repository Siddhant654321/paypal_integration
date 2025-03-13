import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { EmailService } from "./email-service";
import { CronService } from "./cron-service";
import { setupAuth } from "./auth";

async function checkRequiredEnvVars() {
  // Always required environment variables
  const criticalVars = [
    'DATABASE_URL',
    'SESSION_SECRET'
  ];

  // Check for critical variables first
  const missingCriticalVars = criticalVars.filter(varName => !process.env[varName]);
  if (missingCriticalVars.length > 0) {
    throw new Error(`Missing critical environment variables: ${missingCriticalVars.join(', ')}`);
  }

  // Variables that are required in development but optional in production
  const devOnlyVars = [
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_PARTNER_MERCHANT_ID',
    'PAYPAL_SANDBOX_PARTNER_MERCHANT_ID'
  ];

  // Email related variables - warn but don't crash
  const emailVars = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD'
  ];

  // In development, check all variables
  if (process.env.NODE_ENV !== 'production') {
    const missingDevVars = devOnlyVars.filter(varName => !process.env[varName]);
    if (missingDevVars.length > 0) {
      console.warn(`[WARNING] Missing development variables: ${missingDevVars.join(', ')}`);
    }

    const missingEmailVars = emailVars.filter(varName => !process.env[varName]);
    if (missingEmailVars.length > 0) {
      console.warn(`[WARNING] Missing email variables: ${missingEmailVars.join(', ')}`);
    }
  }
}

async function testDatabaseConnection(retries = 3): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await db.execute(sql`SELECT 1`);
      log("Database connection successful", "startup");
      return;
    } catch (error) {
      lastError = error as Error;
      if (attempt === retries) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`Failed to connect to database after ${retries} attempts: ${lastError?.message}`);
}


async function initializeServer(): Promise<Express> {
  const app = express();

  try {
    // Check environment variables
    await checkRequiredEnvVars();

    // Test database connection
    await testDatabaseConnection();

    // Configure CORS with more specific options
    app.use(cors({
      origin: process.env.NODE_ENV === 'production'
        ? [process.env.PUBLIC_URL || ''].filter(Boolean)
        : ['http://localhost:5173', 'http://localhost:5000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Basic middleware setup
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Setup authentication
    setupAuth(app);

    // Request logging middleware (only in development)
    if (process.env.NODE_ENV !== 'production') {
      app.use((req, res, next) => {
        log(`${req.method} ${req.path}`, "request");
        next();
      });
    }

    // Error handling middleware
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error("[ERROR]", err);
      if (process.env.NODE_ENV !== 'production') {
        res.status(500).json({
          message: "Internal server error",
          error: err.message,
          stack: err.stack
        });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Health check endpoint
    app.get("/api/health", (_req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    return app;
  } catch (error) {
    console.error("[FATAL] Server initialization error:", error);
    throw error;
  }
}

async function startServer(port: number = 5000): Promise<void> {
  try {
    const app = await initializeServer();
    const server = await registerRoutes(app);

    // Setup frontend
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      await setupVite(app, server);
    }

    server.listen({
      port,
      host: "0.0.0.0",
    }, () => {
      log(`Server started on port ${port}`, "startup");

      // Initialize cron jobs after server starts
      CronService.initialize();
      log("Cron jobs initialized", "startup");

      // Handle graceful shutdown
      const shutdown = () => {
        log('Shutting down gracefully...', "startup");
        CronService.stop();
        server.close(() => {
          log('Server closed', "startup");
          process.exit(0);
        });
      };

      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    });

  } catch (error) {
    console.error('[FATAL] Server startup error:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  console.error('[FATAL] Unhandled server startup error:', error);
  process.exit(1);
});