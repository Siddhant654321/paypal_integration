import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertAuctionSchema, insertBidSchema } from "@shared/schema";
import { ZodError } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Middleware to check if user is authenticated
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // Middleware to check if user is an admin
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated() || req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };

  // Get all auctions with optional filters
  app.get("/api/auctions", async (req, res) => {
    try {
      const filters = {
        species: req.query.species as string | undefined,
        category: req.query.category as string | undefined,
        approved: true, // Only return approved auctions
      };
      const auctions = await storage.getAuctions(filters);
      res.json(auctions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch auctions" });
    }
  });

  // Get a single auction
  app.get("/api/auctions/:id", async (req, res) => {
    try {
      const auction = await storage.getAuction(parseInt(req.params.id));
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }
      res.json(auction);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch auction" });
    }
  });

  // Create new auction (sellers only)
  app.post("/api/auctions", requireAuth, async (req, res) => {
    try {
      if (req.user.role !== "seller" || !req.user.approved) {
        return res.status(403).json({ message: "Only approved sellers can create auctions" });
      }

      const auctionData = insertAuctionSchema.parse({
        ...req.body,
        sellerId: req.user.id,
      });
      const auction = await storage.createAuction(auctionData);
      res.status(201).json(auction);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: "Invalid auction data" });
      } else {
        res.status(500).json({ message: "Failed to create auction" });
      }
    }
  });

  // Place bid on auction (buyers only)
  app.post("/api/auctions/:id/bid", requireAuth, async (req, res) => {
    try {
      if (req.user.role !== "buyer") {
        return res.status(403).json({ message: "Only buyers can place bids" });
      }

      const auction = await storage.getAuction(parseInt(req.params.id));
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }

      if (new Date() < auction.startDate || new Date() > auction.endDate) {
        return res.status(400).json({ message: "Auction is not active" });
      }

      const bidData = insertBidSchema.parse({
        auctionId: auction.id,
        bidderId: req.user.id,
        amount: req.body.amount,
      });

      if (bidData.amount <= auction.currentPrice) {
        return res.status(400).json({ message: "Bid must be higher than current price" });
      }

      const bid = await storage.createBid(bidData);
      res.status(201).json(bid);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: "Invalid bid data" });
      } else {
        res.status(500).json({ message: "Failed to place bid" });
      }
    }
  });

  // Admin routes
  app.get("/api/admin/auctions", requireAdmin, async (req, res) => {
    try {
      const auctions = await storage.getAuctions({ approved: false });
      res.json(auctions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch pending auctions" });
    }
  });

  app.post("/api/admin/auctions/:id/approve", requireAdmin, async (req, res) => {
    try {
      const auction = await storage.approveAuction(parseInt(req.params.id));
      res.json(auction);
    } catch (error) {
      res.status(500).json({ message: "Failed to approve auction" });
    }
  });

  app.post("/api/admin/users/:id/approve", requireAdmin, async (req, res) => {
    try {
      const user = await storage.approveUser(parseInt(req.params.id));
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to approve user" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
