import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";

// Check for required Stripe environment variables
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("ERROR: Missing STRIPE_SECRET_KEY environment variable");
}
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn("WARNING: Missing STRIPE_WEBHOOK_SECRET environment variable");
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add detailed request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Log startup process
    log("Starting server initialization...");

    // Test database connection
    try {
      log("Testing database connection...");
      await db.execute(sql`SELECT 1`);
      log("Database connection successful");
    } catch (dbError) {
      log(`Database connection failed: ${dbError}`);
      throw dbError;
    }

    // Verify required environment variables
    log("Verifying environment variables...");
    const requiredEnvVars = [
      'DATABASE_URL',
      'STRIPE_SECRET_KEY',
      'STRIPE_PUBLISHABLE_KEY',
      'STRIPE_WEBHOOK_SECRET'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
    log("Environment variables verified");

    // Initialize routes
    log("Registering routes...");
    const server = await registerRoutes(app);
    log("Routes registered successfully");

    // Global error handling
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      log(`Error handler caught: ${err.stack || err}`);
      res.status(status).json({ message });
    });

    // Setup Vite or static serving
    if (app.get("env") === "development") {
      log("Setting up Vite for development...");
      await setupVite(app, server);
      log("Vite setup complete");
    } else {
      log("Setting up static file serving for production...");
      serveStatic(app);
      log("Static file serving setup complete");
    }

    // ALWAYS serve on port 5000
    const port = 5000;

    const startServer = () => {
      server.listen({
        port,
        host: "0.0.0.0",
      }, () => {
        log(`Server started successfully on port ${port}`);
      }).on('error', (e: any) => {
        if (e.code === 'EADDRINUSE') {
          log(`Port ${port} is already in use. Attempting to close existing server...`);

          // Try to find and kill the process using this port
          import('child_process').then(cp => cp.exec(`lsof -i :${port} -t | xargs kill -9`, (err: any) => {
            if (err) {
              log(`Could not free port ${port}: ${err.message}`);
              process.exit(1);
            } else {
              log(`Successfully freed port ${port}, restarting server...`);
              // Wait a moment before trying again
              setTimeout(startServer, 1000);
            }
          }));
        } else {
          log(`Server error: ${e.message}`);
          process.exit(1);
        }
      });
    };

    startServer();
  } catch (error) {
    log(`Fatal error during server startup: ${error}`);
    process.exit(1);
  }
})();