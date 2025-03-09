import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";

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

    // Start server with port fallback logic
    let PORT = process.env.PORT || 5000;
    const MAX_PORT_ATTEMPTS = 10;
    let portAttempts = 0;

    const startServerWithFallback = (port: number) => {
      server.listen({
        port: port,
        host: "0.0.0.0",
      }, () => {
        log(`Server started on port ${port}`, "startup");
      }).on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`Port ${port} is already in use, trying another port...`);
          if (portAttempts < MAX_PORT_ATTEMPTS) {
            portAttempts++;
            startServerWithFallback(port + 1);
          } else {
            console.error(`Could not find an available port after ${MAX_PORT_ATTEMPTS} attempts.`);
            process.exit(1);
          }
        } else {
          log(`Server error: ${error}`, "startup");
          process.exit(1);
        }
      });
    };

    startServerWithFallback(PORT);


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