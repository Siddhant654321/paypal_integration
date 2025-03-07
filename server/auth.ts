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
  // Check if we're in production (including Replit environment)
  const isProduction = process.env.NODE_ENV === 'production' || process.env.REPL_SLUG !== undefined;

  if (!process.env.SESSION_SECRET) {
    console.warn("WARNING: SESSION_SECRET not set. Using insecure default secret.");
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'defaultsecret123',
    resave: false, // Changed to false to prevent unnecessary session saves
    saveUninitialized: false, // Changed to false for better security
    store: storage.sessionStore,
    cookie: {
      secure: isProduction, // Only use secure cookies in production
      httpOnly: true,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    },
    name: 'poultry.sid',
    proxy: isProduction // Trust proxy in production
  };

  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log("[AUTH] Login attempt for username:", username);
        const user = await storage.getUserByUsername(username);

        if (!user) {
          console.log("[AUTH] User not found:", username);
          return done(null, false, { message: "Invalid username or password" });
        }

        const isValid = await comparePasswords(password, user.password);
        if (!isValid) {
          console.log("[AUTH] Invalid password for user:", username);
          return done(null, false, { message: "Invalid username or password" });
        }

        console.log("[AUTH] User authenticated successfully:", { id: user.id, role: user.role });
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

      if (isNaN(userId)) {
        console.error("[AUTH] Invalid user ID during deserialization:", { id });
        return done(null, false);
      }

      const user = await storage.getUser(userId);
      if (!user) {
        console.error("[AUTH] User not found during deserialization:", { userId });
        return done(null, false);
      }

      // Include hasProfile flag in the session
      const profile = await storage.getProfile(userId);
      user.hasProfile = !!profile;

      console.log("[AUTH] User deserialized successfully:", { 
        id: user.id, 
        role: user.role, 
        hasProfile: user.hasProfile 
      });

      done(null, user);
    } catch (error) {
      console.error("[AUTH] Deserialization error:", error);
      done(error);
    }
  });

  // Enhanced authentication routes with better error handling
  app.post("/api/register", async (req, res) => {
    try {
      if (!req.body.username || !req.body.password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

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
          console.error("[AUTH] Login error after registration:", err);
          return res.status(500).json({ message: "Failed to login after registration" });
        }
        res.status(201).json(user);
      });
    } catch (error) {
      console.error("[AUTH] Registration error:", error);
      res.status(500).json({ 
        message: "Registration failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/login", (req, res, next) => {
    if (!req.body.username || !req.body.password) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error("[AUTH] Login error:", err);
        return res.status(500).json({ message: "Authentication failed" });
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("[AUTH] Session creation error:", loginErr);
          return res.status(500).json({ message: "Failed to create session" });
        }
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res) => {
    const wasLoggedIn = req.isAuthenticated();
    req.logout((err) => {
      if (err) {
        console.error("[AUTH] Logout error:", err);
        return res.status(500).json({ message: "Failed to logout" });
      }
      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error("[AUTH] Session destruction error:", sessionErr);
        }
        res.clearCookie('poultry.sid');
        res.json({ 
          message: wasLoggedIn ? "Logged out successfully" : "No active session"
        });
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.user);
  });
}