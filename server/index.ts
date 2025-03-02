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

// Security headers
app.use((req, res, next) => {
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;"
  );
  // Other security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

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

  // Enhance authentication logging
  if (req.path.startsWith('/api/auth') || req.path === '/api/user') {
    console.log('[AUTH] Request:', {
      path: req.path,
      method: req.method,
      isAuthenticated: req.isAuthenticated?.(),
      sessionID: req.sessionID,
      userId: req.user?.id
    });
  }

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
      'STRIPE_WEBHOOK_SECRET',
      'SESSION_SECRET' // Add SESSION_SECRET to required vars
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

    // Global error handling with improved logging
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      const errorDetails = app.get('env') === 'development' ? err.stack : undefined;

      log(`Error handler caught: ${err.stack || err}`);

      res.status(status).json({ 
        message,
        code: err.code || 'INTERNAL_ERROR',
        details: errorDetails
      });
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

    const startServer = async () => {
      try {
        log(`Checking if port ${port} is in use...`);
        const childProcess = await import('child_process');
        const { execSync } = childProcess;
        try {
          execSync(`lsof -i :${port} -t | xargs kill -9`);
          log(`Freed port ${port}`);
          setTimeout(() => bindServer(), 1000);
        } catch (err) {
          bindServer();
        }
      } catch (error) {
        log(`Error during server startup: ${error}`);
        process.exit(1);
      }
    };

    const bindServer = () => {
      server.listen({
        port,
        host: "0.0.0.0",
      }, () => {
        log(`Server started successfully on port ${port}`);
      }).on('error', (e: any) => {
        if (e.code === 'EADDRINUSE') {
          log(`Port ${port} is still in use. Please restart your Repl to free resources.`);
          process.exit(1);
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