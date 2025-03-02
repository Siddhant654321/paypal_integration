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
          console.log("[AUTH] Authentication failed for username:", username);
          return done(null, false, { message: "Invalid username or password" });
        }
        console.log("[AUTH] User authenticated:", { 
          id: user.id, 
          role: user.role,
          hasProfile: user.hasProfile 
        });
        return done(null, user);
      } catch (error) {
        console.error("[AUTH] Authentication error:", error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    console.log("[AUTH] Serializing user:", { 
      id: user.id, 
      role: user.role,
      hasProfile: user.hasProfile 
    });
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string | number, done) => {
    try {
      // Ensure id is a number
      const userId = typeof id === 'string' ? parseInt(id, 10) : id;
      console.log("[AUTH] Deserializing user:", { userId, type: typeof userId });

      const user = await storage.getUser(userId);
      if (!user) {
        console.error("[AUTH] User not found during deserialization:", { userId });
        return done(null, false);
      }

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

  // Add profile validation middleware
  export function requireCompleteProfile(roles: string[] = []) {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        console.log("[AUTH] No user found in requireCompleteProfile middleware");
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Skip profile check for admin users
      if (req.user.role === "admin") {
        return next();
      }

      // If roles are specified, check if user has required role
      if (roles.length > 0 && !roles.includes(req.user.role)) {
        console.log("[AUTH] User role not authorized:", {
          userRole: req.user.role,
          requiredRoles: roles
        });
        return res.status(403).json({ message: "Not authorized" });
      }

      try {
        const profile = await storage.getProfile(req.user.id);

        if (!profile) {
          console.log("[AUTH] No profile found for user:", req.user.id);
          return res.status(403).json({ 
            message: "Please complete your profile first",
            code: "PROFILE_REQUIRED"
          });
        }

        // Check required fields based on role
        const baseRequiredFields = {
          fullName: profile.fullName,
          email: profile.email,
          phoneNumber: profile.phoneNumber,
          address: profile.address,
          city: profile.city,
          state: profile.state,
          zipCode: profile.zipCode
        };

        const isSeller = req.user.role === "seller" || req.user.role === "seller_admin";
        const sellerFields = isSeller ? {
          businessName: profile.businessName,
          breedSpecialty: profile.breedSpecialty,
          npipNumber: profile.npipNumber
        } : {};

        const requiredFields = { ...baseRequiredFields, ...sellerFields };
        const missingFields = Object.entries(requiredFields)
          .filter(([_, value]) => !value)
          .map(([key]) => key);

        if (missingFields.length > 0) {
          console.log("[AUTH] Incomplete profile fields:", {
            userId: req.user.id,
            missingFields
          });
          return res.status(403).json({
            message: "Please complete all required profile fields",
            code: "INCOMPLETE_PROFILE",
            missingFields
          });
        }

        // If we get here, profile is complete
        if (!req.user.hasProfile) {
          await storage.updateUser(req.user.id, { hasProfile: true });
          console.log("[AUTH] Updated hasProfile flag for user:", req.user.id);
        }

        next();
      } catch (error) {
        console.error("[AUTH] Error checking profile:", error);
        next(error);
      }
    };
  }

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log("[AUTH] Registration failed - username exists:", req.body.username);
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
        hasProfile: false // Explicitly set hasProfile to false for new users
      });

      console.log("[AUTH] User registered successfully:", {
        id: user.id,
        role: user.role,
        hasProfile: user.hasProfile
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      console.error("[AUTH] Registration error:", error);
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error("[AUTH] Login error:", err);
        return next(err);
      }
      if (!user) {
        console.log("[AUTH] Login failed:", info?.message);
        return res.status(401).json({ message: info?.message || "Authentication failed" });
      }
      req.login(user, (err) => {
        if (err) {
          console.error("[AUTH] Login session error:", err);
          return next(err);
        }
        console.log("[AUTH] User logged in successfully:", {
          id: user.id,
          role: user.role,
          hasProfile: user.hasProfile
        });
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    const userId = req.user?.id;
    req.logout((err) => {
      if (err) {
        console.error("[AUTH] Logout error:", err);
        return next(err);
      }
      console.log("[AUTH] User logged out successfully:", { userId });
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      console.log("[AUTH] Unauthorized access to /api/user");
      return res.status(401).json({ message: "Not authenticated" });
    }
    console.log("[AUTH] User data retrieved:", {
      id: req.user.id,
      role: req.user.role,
      hasProfile: req.user.hasProfile
    });
    res.json(req.user);
  });
}