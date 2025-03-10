import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";

async function checkRequiredEnvVars() {
  const requiredVars = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'PAYPAL_CLIENT_ID',
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_PARTNER_MERCHANT_ID',
    'PAYPAL_SANDBOX_PARTNER_MERCHANT_ID'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

async function initializeServer() {
  const app = express();
  const DEFAULT_PORT = 5000;

  try {
    log("Starting server initialization", "startup");

    // Check environment variables first
    log("Checking environment variables...", "startup");
    await checkRequiredEnvVars();
    log("Environment variables verified", "startup");

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

    // Request logging middleware
    app.use((req, res, next) => {
      log(`${req.method} ${req.path}`, "request");
      next();
    });

    // Error handling middleware
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error("[ERROR]", err);
      res.status(500).json({ message: "Internal server error" });
    });

    // Global error handler for uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('[FATAL] Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
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
      console.error('[FRONTEND] Setup error:', frontendError);
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
      console.error('[FATAL] Server startup error:', error);
      process.exit(1);
    }
  }
}

// Start the server
startServer().catch((error) => {
  log(`Unhandled error during server startup: ${error}`, "startup");
  console.error('[FATAL] Unhandled server startup error:', error);
  process.exit(1);
});