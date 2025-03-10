import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";
import cors from 'cors';

// Simple logging utility for server startup
const log = (message: string) => {
  console.log(`[SERVER] ${message}`);
};

async function initializeServer() {
  const app = express();
  const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5000';

  try {
    log("Starting server initialization");

    // Check critical environment variables
    log("Checking environment variables...");
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    if (!process.env.SESSION_SECRET) {
      log("Warning: SESSION_SECRET not set, using default value");
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      log("Warning: STRIPE_SECRET_KEY not set");
    }
    log("Environment variables checked");

    // Temporarily bypass database connection test
    log("Database connection test bypassed for debugging");

    // Set up CORS
    log("Setting up CORS...");
    app.use(cors({
      origin: [
        clientOrigin,
        'http://localhost:5000',
        'https://checkout.stripe.com',
        'https://js.stripe.com'
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
    }));
    log("CORS setup complete");

    // Basic middleware setup
    log("Setting up middleware...");
    app.use(express.urlencoded({ extended: false }));
    app.use("/api/webhooks/stripe", express.raw({ type: 'application/json' }));
    app.use(express.json());
    log("Middleware setup complete");

    // Set security headers
    log("Setting up security headers...");
    app.use((req, res, next) => {
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.replit.com https://*.replit.dev https://checkout.stripe.com https://js.stripe.com");
      res.setHeader('Access-Control-Allow-Origin', '*');
      next();
    });
    log("Security headers setup complete");

    // Request logging middleware
    app.use((req, res, next) => {
      log(`${req.method} ${req.path}`);
      next();
    });

    // Register API routes before static file serving
    log("Setting up routes...");
    const server = await registerRoutes(app);
    log("Routes setup complete");

    // Temporarily disable Vite setup for debugging
    if (process.env.NODE_ENV === "production") {
      log("Setting up static file serving...");
      serveStatic(app);
      log("Static file serving setup complete");
    } else {
      log("Vite development server setup bypassed for debugging");
    }

    // Error handling middleware - must be last
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      console.error("[ERROR]", err);
      res.status(500).json({ 
        message: "Internal server error",
        error: err.message
      });
    });

    // Health check endpoint
    app.get("/api/status", (_req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    return server;
  } catch (error) {
    log(`Fatal error during server initialization: ${error}`);
    throw error;
  }
}

async function startServer(): Promise<void> {
  try {
    log("Starting server initialization...");
    const server = await initializeServer();
    log("Server initialization complete, attempting to listen on port 5000");

    server.listen({
      port: 5000,
      host: "0.0.0.0",
    }, () => {
      log("Server started successfully on port 5000");
    }).on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        log("Error: Port 5000 is already in use. This port is required for the application.");
        process.exit(1);
      } else {
        log(`Server error: ${error}`);
        process.exit(1);
      }
    });

    // Handle graceful shutdown
    const shutdown = () => {
      log('Shutting down gracefully...');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    log(`Fatal error during startup: ${error}`);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  log(`Unhandled error during server startup: ${error}`);
  process.exit(1);
});