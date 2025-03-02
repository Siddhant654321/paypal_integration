import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
    interface Request {
      userProfile?: any; // To be replaced with proper Profile type
    }
  }
}

interface AuthError {
  message: string;
  code: string;
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
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable must be set");
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
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
    new LocalStrategy(async (username: string, password: string, done: (error: any, user?: any, options?: any) => void) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log("[AUTH] Login failed - user not found:", username);
          return done(null, false, { message: "Invalid username or password" });
        }

        const isValidPassword = await comparePasswords(password, user.password);
        if (!isValidPassword) {
          console.log("[AUTH] Login failed - invalid password:", username);
          return done(null, false, { message: "Invalid username or password" });
        }

        // Get profile status
        const profile = await storage.getProfile(user.id);

        console.log("[AUTH] Login successful:", { 
          id: user.id, 
          role: user.role,
          hasProfile: user.hasProfile,
          profileComplete: profile?.isComplete 
        });

        return done(null, user);
      } catch (error) {
        console.error("[AUTH] Authentication error:", error);
        return done(error);
      }
    })
  );

  passport.serializeUser((user: Express.User, done: (err: any, id?: number) => void) => {
    console.log("[AUTH] Serializing user:", { 
      id: user.id, 
      role: user.role,
      hasProfile: user.hasProfile 
    });
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string | number, done: (err: any, user?: Express.User | false) => void) => {
    try {
      const userId = typeof id === 'string' ? parseInt(id, 10) : id;
      console.log("[AUTH] Deserializing user:", userId);

      const user = await storage.getUser(userId);
      if (!user) {
        console.error("[AUTH] Deserialization failed - user not found:", userId);
        return done(null, false);
      }

      // Get profile status during deserialization
      const profile = await storage.getProfile(userId);

      console.log("[AUTH] User deserialized:", {
        id: user.id,
        role: user.role,
        hasProfile: user.hasProfile,
        profileComplete: profile?.isComplete
      });

      done(null, user);
    } catch (error) {
      console.error("[AUTH] Deserialization error:", error);
      done(error);
    }
  });

  app.post("/api/register", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log("[AUTH] Registration failed - username exists:", req.body.username);
        return res.status(400).json({ 
          message: "Username already exists",
          code: "USERNAME_EXISTS"
        } as AuthError);
      }

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
        hasProfile: false
      });

      console.log("[AUTH] Registration successful:", {
        id: user.id,
        role: user.role,
        hasProfile: user.hasProfile
      });

      req.login(user, (err) => {
        if (err) {
          console.error("[AUTH] Login after registration failed:", err);
          return next(err);
        }
        res.status(201).json({
          id: user.id,
          username: user.username,
          role: user.role,
          hasProfile: user.hasProfile
        });
      });
    } catch (error) {
      console.error("[AUTH] Registration error:", error);
      next(error);
    }
  });

  app.post("/api/login", (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: { message: string } | undefined) => {
      if (err) {
        console.error("[AUTH] Login error:", err);
        return next(err);
      }
      if (!user) {
        console.log("[AUTH] Login failed:", info?.message);
        return res.status(401).json({ 
          message: info?.message || "Authentication failed",
          code: "AUTH_FAILED"
        } as AuthError);
      }
      req.login(user, (err) => {
        if (err) {
          console.error("[AUTH] Session creation error:", err);
          return next(err);
        }
        console.log("[AUTH] Login successful:", {
          id: user.id,
          role: user.role,
          hasProfile: user.hasProfile
        });
        res.json({
          id: user.id,
          username: user.username,
          role: user.role,
          hasProfile: user.hasProfile
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    req.logout((err) => {
      if (err) {
        console.error("[AUTH] Logout error:", err);
        return next(err);
      }
      console.log("[AUTH] Logout successful:", { userId });
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      console.log("[AUTH] Unauthorized access to /api/user");
      return res.status(401).json({ 
        message: "Not authenticated",
        code: "NOT_AUTHENTICATED"
      } as AuthError);
    }

    console.log("[AUTH] User data retrieved:", {
      id: req.user.id,
      role: req.user.role,
      hasProfile: req.user.hasProfile
    });

    res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      hasProfile: req.user.hasProfile
    });
  });
}