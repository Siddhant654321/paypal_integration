import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";
import cors from 'cors';

async function initializeServer() {
  const app = express();
  const PORT = 5000; // Always use port 5000
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5000';

  try {
    log("Starting server initialization", "startup");

    // Check critical environment variables
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    if (!process.env.SESSION_SECRET) {
      log("Warning: SESSION_SECRET not set, using default value", "startup");
    }

    // Test database connection
    try {
      log("Testing database connection...", "startup");
      await db.execute(sql`SELECT 1`);
      log("Database connection successful", "startup");
    } catch (error) {
      log(`Database connection failed: ${error}`, "startup");
      throw error;
    }

    // Basic middleware setup
    log("Setting up middleware", "startup");
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Set up CORS with proper configuration
    app.use(cors({
      origin: [
        clientOrigin,
        'http://localhost:5000',
        'https://checkout.stripe.com',
        'https://js.stripe.com'
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }));

    // Set security headers
    app.use((req, res, next) => {
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://checkout.stripe.com https://js.stripe.com");
      next();
    });

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

    // Start server - always use port 5000
    server.listen({
      port: 5000,
      host: "0.0.0.0",
    }, () => {
      log("Server started on port 5000", "startup");
    }).on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        log("Port 5000 is already in use. Please ensure no other process is using this port.", "startup");
        process.exit(1);
      } else {
        log(`Server error: ${error}`, "startup");
        process.exit(1);
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

  } catch (error) {
    log(`Fatal error during startup: ${error}`, "startup");
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  log(`Unhandled error during server startup: ${error}`, "startup");
  process.exit(1);
});