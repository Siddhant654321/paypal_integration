import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import path from "path";
import multer from 'multer';
import { upload, handleFileUpload } from "./uploads";
import { PaymentService } from "./payments";
import Stripe from "stripe";
import { SellerPaymentService } from "./seller-payments";
import { AuctionService } from "./auction-service";
import { AIPricingService } from "./ai-service";
import type { User, Auction } from "./storage";
import { insertAuctionSchema, insertBidSchema, insertProfileSchema, insertBuyerRequestSchema, insertFulfillmentSchema } from "@shared/schema";
import { ZodError } from "zod";


// Helper function to get raw body for Stripe webhook
const getRawBody = async (req: express.Request): Promise<Buffer> => {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

// Add middleware to check profile completion
const requireProfile = async (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    console.log("[PROFILE CHECK] User not authenticated");
    return res.status(401).json({ message: "Unauthorized" });
  }

  console.log("[PROFILE CHECK] User:", {
    id: req.user?.id,
    role: req.user?.role,
    isAuthenticated: req.isAuthenticated()
  });

  // For development, temporarily skip profile check
  return next();
};

// Authentication middleware
const requireAuth = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

// Admin middleware
const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated() || (req.user.role !== "admin" && req.user.role !== "seller_admin")) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

// Approved seller middleware
const requireApprovedSeller = (req: any, res: any, next: any) => {
  try {
    console.log("[SELLER CHECK]", {
      isAuthenticated: req.isAuthenticated(),
      user: req.user ? {
        id: req.user.id,
        role: req.user.role,
        approved: req.user.approved
      } : null
    });

    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (req.user.role === "seller_admin") {
      return next();
    }

    if (req.user.role !== "seller") {
      return res.status(403).json({ message: "Only sellers can perform this action" });
    }

    if (!req.user.approved) {
      return res.status(403).json({ message: "Only approved sellers can perform this action" });
    }

    next();
  } catch (error) {
    console.error("[SELLER CHECK] Error:", error);
    res.status(500).json({ message: "Authorization check failed" });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("[ROUTES] Starting minimal route registration");

  const server = createServer(app);

  try {
    // Setup basic auth
    console.log("[ROUTES] Setting up authentication...");
    setupAuth(app);
    console.log("[ROUTES] Authentication setup complete");

    // Basic auctions endpoint
    app.get("/api/auctions", async (_req, res) => {
      try {
        console.log("[ROUTES] Fetching auctions");
        const auctions = await storage.getAuctions({ approved: true });
        res.json(auctions);
      } catch (error) {
        console.error("[ROUTES] Error fetching auctions:", error);
        res.status(500).json({
          message: "Failed to fetch auctions",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    console.log("[ROUTES] Minimal route registration complete");
    return server;
  } catch (error) {
    console.error("[ROUTES] Error during route registration:", error);
    throw error;
  }
}