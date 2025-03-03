import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";

// Check for required environment variables
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("ERROR: Missing STRIPE_SECRET_KEY environment variable");
}
if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.warn("WARNING: Missing STRIPE_WEBHOOK_SECRET environment variable");
}

const app = express();

// Configure JSON parsing with error handling - only validate when there's a body
app.use(express.json({
  verify: (req: Request, res: Response, buf: Buffer) => {
    if (buf.length > 0) {
      try {
        JSON.parse(buf.toString());
      } catch (e) {
        res.status(400).json({ 
          message: "Invalid JSON in request body",
          error: (e as Error).message 
        });
        throw e;
      }
    }
  }
}));

app.use(express.urlencoded({ extended: false }));

// Add detailed request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  // Log request details
  if (path.startsWith('/api')) {
    console.log(`[REQUEST] ${req.method} ${path}`, {
      query: req.query,
      body: req.body,
      headers: req.headers
    });
  }

  // Capture original JSON method
  const originalJson = res.json;
  res.json = function (bodyJson, ...args) {
    try {
      // Ensure the response is actually JSON serializable
      const serialized = JSON.stringify(bodyJson);
      const parsed = JSON.parse(serialized);

      // Log response for API endpoints
      if (path.startsWith('/api')) {
        console.log(`[RESPONSE] ${req.method} ${path}`, {
          status: res.statusCode,
          body: parsed
        });
      }

      return originalJson.apply(res, [parsed, ...args]);
    } catch (error) {
      console.error(`[JSON Error] Failed to serialize response for ${path}:`, error);
      return res.status(500).send({ 
        message: "Internal server error: Invalid JSON response",
        path,
        timestamp: new Date().toISOString()
      });
    }
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

// Add basic status endpoint for health checks
app.get("/api/status", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    domain: process.env.REPLIT_DOMAIN || 'localhost:5000'
  });
});

(async () => {
  try {
    log("Starting server initialization...");

    // Test database connection
    try {
      log("Testing database connection...");
      await db.execute(sql`SELECT 1`);
      log("Database connection successful");
    } catch (dbError) {
      log(`Database connection failed: ${dbError}`);
      console.error("Database connection error details:", dbError);
      console.error("Connection details:", {
        host: process.env.DATABASE_HOST || 'not set',
        database: process.env.DATABASE_NAME || 'not set',
        user: process.env.DATABASE_USER || 'not set',
        hasPassword: !!process.env.DATABASE_PASSWORD,
      });
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

    // Enhanced global error handling
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Log detailed error information
      console.error("[Error Handler]", {
        status,
        message,
        stack: err.stack,
        type: err.constructor.name
      });

      // Send sanitized error response
      res.status(status).json({ 
        message,
        status,
        timestamp: new Date().toISOString()
      });
    });

    // Setup static serving for Replit or Vite for development
    if (process.env.REPLIT_DOMAIN) {
      log("Setting up static file serving for Replit production...");
      serveStatic(app);
      log("Static file serving setup complete");
    } else {
      log("Setting up Vite for development...");
      await setupVite(app, server);
      log("Vite setup complete");
    }

    // ALWAYS serve on port 5000
    const port = 5000;

    const startServer = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          server.listen({
            port,
            host: "0.0.0.0",
          }, () => {
            const domain = process.env.REPLIT_DOMAIN ? 
              `https://${process.env.REPLIT_DOMAIN}` : 
              `http://localhost:${port}`;
            log(`Server started successfully on ${domain}`);
            log(`Status endpoint available at ${domain}/api/status`);
            resolve();
          }).on('error', (e: any) => {
            if (e.code === 'EADDRINUSE') {
              log(`Port ${port} is in use. Attempting to free...`);
              reject(e);
            } else {
              log(`Server error: ${e.message}`);
              reject(e);
            }
          });
        });
      } catch (error) {
        if ((error as any).code === 'EADDRINUSE') {
          log(`Attempting to free port ${port}...`);
          try {
            const { execSync } = await import('child_process');
            execSync(`lsof -i :${port} -t | xargs kill -9`);
            log(`Freed port ${port}`);
            // Try starting server again after a brief delay
            setTimeout(() => startServer(), 1000);
          } catch (killError) {
            log(`Failed to free port ${port}: ${killError}`);
            process.exit(1);
          }
        } else {
          log(`Fatal error during server startup: ${error}`);
          process.exit(1);
        }
      }
    };

    startServer();
  } catch (error) {
    log(`Fatal error during server startup: ${error}`);
    process.exit(1);
  }
})();