import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { comparePasswords, hashPassword } from "./utils/password";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
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
}

export { hashPassword, comparePasswords };