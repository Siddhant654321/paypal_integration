import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import "dotenv/config";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { EmailService } from "./email-service";
import { CronService } from "./cron-service";

async function checkRequiredEnvVars() {
  // Always required environment variables
  const criticalVars = ["DATABASE_URL", "SESSION_SECRET"];

  // Check for critical variables first
  const missingCriticalVars = criticalVars.filter(
    (varName) => !process.env[varName],
  );
  if (missingCriticalVars.length > 0) {
    throw new Error(
      `Missing critical environment variables: ${missingCriticalVars.join(", ")}`,
    );
  }

  // Variables that are required in development but optional in production
  const devOnlyVars = [
    "PAYPAL_CLIENT_ID",
    "PAYPAL_CLIENT_SECRET",
    "PAYPAL_PARTNER_MERCHANT_ID",
    "PAYPAL_SANDBOX_PARTNER_MERCHANT_ID",
  ];

  // Email related variables - warn but don't crash
  const emailVars = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD"];

  // In development, check all variables
  if (process.env.NODE_ENV !== "production") {
    const missingDevVars = devOnlyVars.filter(
      (varName) => !process.env[varName],
    );
    if (missingDevVars.length > 0) {
      throw new Error(
        `Missing development environment variables: ${missingDevVars.join(", ")}`,
      );
    }

    const missingEmailVars = emailVars.filter(
      (varName) => !process.env[varName],
    );
    if (missingEmailVars.length > 0) {
      console.warn(
        `[WARNING] Missing email variables: ${missingEmailVars.join(", ")}`,
      );
    }
  } else {
    // In production, just log warnings for non-critical missing variables
    const missingDevVars = devOnlyVars.filter(
      (varName) => !process.env[varName],
    );
    if (missingDevVars.length > 0) {
      console.warn(
        `[WARNING] Missing payment variables: ${missingDevVars.join(", ")}`,
      );
    }

    const missingEmailVars = emailVars.filter(
      (varName) => !process.env[varName],
    );
    if (missingEmailVars.length > 0) {
      console.warn(
        `[WARNING] Missing email variables: ${missingEmailVars.join(", ")}`,
      );
    }
  }
}

async function testDatabaseConnection(retries = 3): Promise<void> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await db.execute(sql`SELECT 1`);
      return;
    } catch (error) {
      lastError = error as Error;
      if (attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(
    `Failed to connect to database after ${retries} attempts: ${lastError?.message}`,
  );
}

async function testEmailService(): Promise<void> {
  try {
    log("Testing email service connection...", "startup");
    // Skip email verification in production if email settings are missing
    if (
      process.env.NODE_ENV === "production" &&
      (!process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASSWORD)
    ) {
      log(
        "Skipping email verification in production due to missing credentials",
        "startup",
      );
      return;
    }

    const isConnected = await EmailService.verifyConnection();
    if (!isConnected) {
      if (process.env.NODE_ENV === "production") {
        log(
          "Warning: Failed to verify email service connection in production",
          "startup",
        );
      } else {
        throw new Error("Failed to verify email service connection");
      }
    } else {
      log("Email service connection verified successfully", "startup");
    }
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      log(
        `Warning: Email service verification failed: ${error instanceof Error ? error.message : String(error)}`,
        "startup",
      );
    } else {
      throw new Error(
        `Email service verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

async function initializeServer(): Promise<Express> {
  const app = express();

  try {
    // Always check environment variables
    await checkRequiredEnvVars();

    // In production, handle service checks differently
    if (process.env.NODE_ENV === "production") {
      // Always test database connection even in production
      await testDatabaseConnection();

      // Try email service but don't fail if it doesn't work
      try {
        await testEmailService();
      } catch (error) {
        log(
          `Warning: Email service check failed but continuing startup: ${error instanceof Error ? error.message : String(error)}`,
          "startup",
        );
      }
    } else {
      // In development, check everything concurrently
      await Promise.all([testDatabaseConnection(), testEmailService()]);
    }

    // Configure CORS
    app.use(
      cors({
        origin:
          process.env.NODE_ENV === "production"
            ? [process.env.PUBLIC_URL || ""].filter(Boolean)
            : ["http://localhost:5173", "http://localhost:5000"],
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      }),
    );

    // Basic middleware setup
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Request logging middleware (only in development)
    if (process.env.NODE_ENV !== "production") {
      app.use((req, res, next) => {
        log(`${req.method} ${req.path}`, "request");
        next();
      });
    }

    // Error handling middleware
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error("[ERROR]", err.message);
      if (process.env.NODE_ENV !== "production") {
        res.status(500).json({
          message: "Internal server error",
          error: err.message,
          stack: err.stack,
        });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Health check endpoint
    app.get("/api/status", (_req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    return app;
  } catch (error) {
    console.error("[FATAL] Server initialization error:", error);
    throw error;
  }
}

async function startServer(
  port: number = 5000,
  maxRetries: number = 10,
): Promise<void> {
  try {
    const app = await initializeServer();
    const server = await registerRoutes(app);

    // Setup frontend
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      await setupVite(app, server);
    }

    // Create a promise to handle server startup
    const startupPromise = new Promise<void>((resolve, reject) => {
      server.once("error", (err: any) => {
        if (err.code === "EADDRINUSE") {
          log(`Port ${port} is in use, will try another port`, "startup");
          server.close();
          resolve(); // Resolve to allow retry logic to work
        } else {
          reject(err);
        }
      });

      server
        .listen(
          {
            port,
            host: "0.0.0.0",
          },
          () => {
            log(`Server started on port ${port}`, "startup");

            // Initialize cron jobs after server starts
            CronService.initialize();
            log("Cron jobs initialized", "startup");

            // Handle graceful shutdown
            const shutdown = () => {
              log("Shutting down gracefully...", "startup");

              // Stop cron jobs
              CronService.stop();
              log("Cron jobs stopped", "startup");

              server.close(() => {
                log("Server closed", "startup");
                process.exit(0);
              });
            };

            process.on("SIGTERM", shutdown);
            process.on("SIGINT", shutdown);

            resolve();
          },
        )
        .on("error", (err: any) => {
          if (err.code === "EADDRINUSE") {
            log(`Port ${port} is in use, trying port ${port + 1}`, "startup");
            server.close();
            if (maxRetries > 0) {
              startServer(port + 1, maxRetries - 1)
                .then(resolve)
                .catch(reject);
            } else {
              reject(
                new Error(
                  "Failed to find an available port after multiple attempts",
                ),
              );
            }
          } else {
            reject(err);
          }
        });
    });

    await startupPromise;
  } catch (error: any) {
    if (error.code === "EADDRINUSE" && maxRetries > 0) {
      log(`Port ${port} is in use, retrying with port ${port + 1}`, "startup");
      await startServer(port + 1, maxRetries - 1);
    } else {
      console.error("[FATAL] Server startup error:", error);
      process.exit(1);
    }
  }
}

// Start the server
startServer().catch((error) => {
  console.error("[FATAL] Unhandled server startup error:", error);
  process.exit(1);
});
