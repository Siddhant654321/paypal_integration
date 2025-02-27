import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertAuctionSchema, insertBidSchema } from "@shared/schema";
import { ZodError } from "zod";
import path from "path";
import { upload, handleFileUpload } from "./uploads";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Serve static files from uploads directory
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Middleware to check if user is authenticated
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  };

  // Middleware to check if user is an admin
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated() || (req.user.role !== "admin" && req.user.role !== "seller_admin")) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  };

  // Middleware to check if user is an approved seller or seller_admin
  const requireApprovedSeller = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Allow seller_admin without approval check
    if (req.user.role === "seller_admin") {
      return next();
    }

    // Check approval for regular sellers
    if (req.user.role !== "seller" || !req.user.approved) {
      return res.status(403).json({ message: "Only approved sellers can perform this action" });
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
      console.error("Error fetching auctions:", error);
      res.status(500).json({ message: "Failed to fetch auctions" });
    }
  });

  // Get seller's auctions
  app.get("/api/seller/auctions", requireApprovedSeller, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const auctions = await storage.getAuctions({
        sellerId: req.user.id
      });
      res.json(auctions);
    } catch (error) {
      console.error("Error fetching seller auctions:", error);
      res.status(500).json({ message: "Failed to fetch seller auctions" });
    }
  });

  // Create new auction (sellers only)
  app.post("/api/auctions", requireApprovedSeller, upload.array('images', 5), async (req, res) => {
    try {
      const userId = req.user.id;
      const auctionData = req.body;

      // Convert string values to appropriate types
      const parsedData = {
        ...auctionData,
        startPrice: Number(auctionData.startPrice),
        reservePrice: Number(auctionData.reservePrice),
      };

      try {
        insertAuctionSchema.parse(parsedData);
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({ message: "Invalid auction data", errors: error.errors });
        }
        throw error;
      }

      // Handle uploaded files
      const uploadedFiles = req.files as Express.Multer.File[];
      let imageUrls = [];

      if (uploadedFiles && uploadedFiles.length > 0) {
        // Create URLs for uploaded images
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        imageUrls = uploadedFiles.map(file => `${baseUrl}/uploads/${file.filename}`);
      }

      // Set the seller ID, current price, and image URLs
      const newAuction = {
        ...parsedData,
        sellerId: userId,
        currentPrice: parsedData.startPrice,
        imageUrl: imageUrls.length > 0 ? imageUrls[0] : (parsedData.imageUrl || 'placeholder-image.jpg'),
        images: imageUrls,
      };

      const result = await storage.createAuction(newAuction);
      return res.status(201).json(result);
    } catch (error) {
      console.error("Error creating auction:", error);
      return res.status(500).json({ message: "Failed to create auction" });
    }
  });

  // Place bid on auction (anyone can bid except the seller of the auction)
  app.post("/api/auctions/:id/bid", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const auctionId = parseInt(req.params.id);
      if (isNaN(auctionId)) {
        return res.status(400).json({ message: "Invalid auction ID" });
      }

      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }

      // Don't allow sellers to bid on their own auctions
      if (auction.sellerId === req.user.id) {
        return res.status(403).json({ message: "You cannot bid on your own auction" });
      }

      const now = new Date();
      if (now < auction.startDate) {
        return res.status(400).json({ message: "Auction has not started yet" });
      }

      if (now > auction.endDate) {
        return res.status(400).json({ message: "Auction has already ended" });
      }

      // Convert amount to number if it's a string
      const amount = typeof req.body.amount === 'string'
        ? parseInt(req.body.amount)
        : req.body.amount;

      if (isNaN(amount)) {
        return res.status(400).json({ message: "Bid amount must be a valid number" });
      }

      if (amount <= auction.currentPrice) {
        return res.status(400).json({
          message: `Bid must be higher than current price of $${auction.currentPrice}`
        });
      }

      const bidData = insertBidSchema.parse({
        auctionId: auction.id,
        bidderId: req.user.id,
        amount: amount,
      });

      const bid = await storage.createBid(bidData);
      res.status(201).json(bid);
    } catch (error) {
      console.error("Bid error:", error);
      if (error instanceof ZodError) {
        res.status(400).json({
          message: "Invalid bid data",
          errors: error.errors
        });
      } else {
        res.status(500).json({
          message: "Failed to place bid",
          error: (error as Error).message
        });
      }
    }
  });

  // Add single auction endpoint
  app.get("/api/auctions/:id", async (req, res) => {
    try {
      const auction = await storage.getAuction(parseInt(req.params.id));
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }
      res.json(auction);
    } catch (error) {
      console.error("Error fetching auction:", error);
      res.status(500).json({ message: "Failed to fetch auction" });
    }
  });

  // Add auction bids endpoint
  app.get("/api/auctions/:id/bids", async (req, res) => {
    try {
      const bids = await storage.getBidsForAuction(parseInt(req.params.id));
      res.json(bids);
    } catch (error) {
      console.error("Error fetching bids:", error);
      res.status(500).json({ message: "Failed to fetch bids" });
    }
  });

  // Add this new endpoint after the other auction routes
  app.get("/api/user/bids", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get all bids by the user
      const bids = await storage.getBidsByUser(req.user.id);

      // Get all auctions for these bids
      const auctions = await Promise.all(
        bids.map(bid => storage.getAuction(bid.auctionId))
      );

      // Filter out any undefined auctions and deduplicate
      const uniqueAuctions = [...new Map(
        auctions.filter(Boolean).map(auction => [auction.id, auction])
      ).values()];

      res.json(uniqueAuctions);
    } catch (error) {
      console.error("Error fetching user bids:", error);
      res.status(500).json({ message: "Failed to fetch user bids" });
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

  // File upload endpoint
  app.post("/api/upload", requireAuth, upload.array('files', 5), handleFileUpload);

  // Get all users for admin (with filters)
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const filters = {
        approved: req.query.approved === 'true' ? true :
          req.query.approved === 'false' ? false : undefined,
        role: req.query.role as string | undefined
      };
      console.log("Fetching users with filters:", filters);
      const users = await storage.getUsers(filters);
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}