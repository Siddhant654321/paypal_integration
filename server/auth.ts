import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    name: 'poultry.sid' // Custom session name
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Invalid username or password" });
        }
        console.log("[AUTH] User authenticated:", { id: user.id, role: user.role });
        return done(null, user);
      } catch (error) {
        console.error("[AUTH] Authentication error:", error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    console.log("[AUTH] Serializing user:", { id: user.id, role: user.role });
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string | number, done) => {
    try {
      const userId = typeof id === 'string' ? parseInt(id, 10) : id;
      console.log("[AUTH] Deserializing user:", { userId });

      const user = await storage.getUser(userId);
      if (!user) {
        console.error("[AUTH] User not found during deserialization:", { userId });
        return done(null, false);
      }

      console.log("[AUTH] User deserialized successfully:", { id: user.id, role: user.role });
      done(null, user);
    } catch (error) {
      console.error("[AUTH] Deserialization error:", error);
      done(error);
    }
  });

  // Fix login endpoint to properly handle JSON responses
  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error("[AUTH] Login error:", err);
        return res.status(500).json({ 
          message: "Internal server error",
          error: err.message
        });
      }

      if (!user) {
        return res.status(401).json({ 
          message: info?.message || "Authentication failed" 
        });
      }

      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("[AUTH] Login session error:", loginErr);
          return res.status(500).json({ 
            message: "Failed to create session",
            error: loginErr.message
          });
        }
        res.json(user);
      });
    })(req, res, next);
  });

  // Fix register endpoint to properly handle JSON responses
  app.post("/api/register", async (req, res) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      req.login(user, (err) => {
        if (err) {
          console.error("[AUTH] Registration session error:", err);
          return res.status(500).json({ 
            message: "User created but failed to log in",
            error: err.message
          });
        }
        res.status(201).json(user);
      });
    } catch (error) {
      console.error("[AUTH] Registration error:", error);
      res.status(500).json({ 
        message: "Failed to create user",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Fix logout endpoint to properly handle JSON responses
  app.post("/api/logout", (req, res) => {
    const userId = req.user?.id;
    console.log("[AUTH] Logout attempt for user:", userId);

    req.logout((err) => {
      if (err) {
        console.error("[AUTH] Logout error:", err);
        return res.status(500).json({ 
          message: "Failed to logout",
          error: err.message
        });
      }

      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error("[AUTH] Session destruction error:", sessionErr);
          return res.status(500).json({ 
            message: "Failed to clear session",
            error: sessionErr.message
          });
        }

        console.log("[AUTH] User logged out successfully:", userId);
        res.json({ message: "Logged out successfully" });
      });
    });
  });

  // Fix user endpoint to properly handle JSON responses
  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.user);
  });
}