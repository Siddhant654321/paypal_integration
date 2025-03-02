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
    name: 'poultry.sid'
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
        return done(null, user);
      } catch (error) {
        console.error("[AUTH] Authentication error:", error);
        return done(error);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string | number, done) => {
    try {
      const userId = typeof id === 'string' ? parseInt(id, 10) : id;
      const user = await storage.getUser(userId);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  function requireCompleteProfile(roles: string[] = []) {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Skip profile check for admin users
      if (req.user.role === "admin") {
        return next();
      }

      // Check role authorization
      if (roles.length > 0 && !roles.includes(req.user.role)) {
        return res.status(403).json({ message: "Not authorized" });
      }

      try {
        const profile = await storage.getProfile(req.user.id);
        if (!profile) {
          return res.status(403).json({ 
            message: "Please complete your profile first",
            code: "PROFILE_REQUIRED"
          });
        }

        // Define required fields based on user role
        let requiredFields = [
          'fullName',
          'email',
          'phoneNumber',
          'address',
          'city',
          'state',
          'zipCode'
        ];

        // Add seller fields if user is a seller
        if (req.user.role === "seller" || req.user.role === "seller_admin") {
          requiredFields = requiredFields.concat(['businessName', 'breedSpecialty', 'npipNumber']);
        }

        // Check for missing fields
        const missingFields = requiredFields.filter(field => {
          const value = profile[field as keyof typeof profile];
          return !value || value.toString().trim() === '';
        });

        if (missingFields.length > 0) {
          return res.status(403).json({
            message: "Please complete all required profile fields",
            code: "INCOMPLETE_PROFILE",
            missingFields
          });
        }

        // Update hasProfile flag if needed
        if (!req.user.hasProfile) {
          await storage.updateUser(req.user.id, { hasProfile: true });
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
        return res.status(400).json({ message: "Username already exists" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
        hasProfile: false
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Authentication failed" });
      }
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.user);
  });
}