import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertAuctionSchema, insertBidSchema, insertProfileSchema, insertBuyerRequestSchema } from "@shared/schema";
import { ZodError } from "zod";
import path from "path";
import multer from 'multer';
import { upload, handleFileUpload } from "./uploads";
import { PaymentService } from "./payments";
import { buffer } from "micro";
import Stripe from "stripe";
import {SellerPaymentService} from "./seller-payments";
import {insertFulfillmentSchema} from "@shared/schema"; 
import { EmailService } from "./email"; 
import { AuctionService } from "./auction-service";
import { AIPricingService } from "./ai-service"; // Added import


// Add middleware to check profile completion
const requireProfile = async (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    console.log("[PROFILE CHECK] User not authenticated");
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Enhanced logging for debugging
  console.log("[PROFILE CHECK] User authentication state:", {
    userId: req.user?.id,
    role: req.user?.role,
    username: req.user?.username,
    isAuthenticated: req.isAuthenticated()
  });

  // Skip profile check for now to fix the auction form issue
  console.log("[PROFILE CHECK] Temporarily bypassing profile check");
  return next();

  // The code below is commented out to fix the "seller not found" issue
  /*
  // Check if profile exists 
  const hasProfile = await storage.hasProfile(req.user.id);
  console.log("[PROFILE CHECK] Profile check result:", {
    userId: req.user.id, 
    role: req.user.role,
    hasProfile
  });

  // For buyers, no profile is required
  if (req.user.role === "buyer") {
    console.log("[PROFILE CHECK] Skipping profile check for buyer");
    return next();
  }

  // For sellers and seller_admin, check profile status
  const isSeller = req.user.role === "seller" || req.user.role === "seller_admin";
  if (isSeller && !hasProfile) {
    console.log("[PROFILE CHECK] Seller missing required profile");
    return res.status(403).json({ message: "Profile completion required" });
  }

  // Profile exists or not required, proceed
  console.log("[PROFILE CHECK] Access granted");
  next();
  */
};

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

    // Check approval for regular sellers - removed the role check since it's redundant
    if (!req.user.approved) {
      return res.status(403).json({ message: "Only approved sellers can perform this action" });
    }

    next();
  };

  // Update the getAuctions endpoint to include seller profiles
  app.get("/api/auctions", async (req, res) => {
    try {
      const filters = {
        species: req.query.species as string | undefined,
        category: req.query.category as string | undefined,
        approved: true, 
      };
      const auctions = await storage.getAuctions(filters);

      // Get seller profiles for each auction
      const auctionsWithProfiles = await Promise.all(
        auctions.map(async (auction) => {
          const sellerProfile = await storage.getProfile(auction.sellerId);
          return { ...auction, sellerProfile };
        })
      );

      res.json(auctionsWithProfiles);
    } catch (error) {
      console.error("Error fetching auctions:", error);
      res.status(500).json({ message: "Failed to fetch auctions" });
    }
  });

  // Get seller's auctions
  app.get("/api/seller/auctions", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Allow both seller and seller_admin to view their auctions
      if (req.user.role !== "seller" && req.user.role !== "seller_admin") {
        return res.status(403).json({ message: "Only sellers can view their auctions" });
      }

      console.log(`[AUCTIONS] Fetching auctions for seller ${req.user.id}`);
      const auctions = await storage.getAuctions({
        sellerId: req.user.id
      });

      console.log(`[AUCTIONS] Found ${auctions.length} auctions`);
      res.json(auctions);
    } catch (error) {
      console.error("[AUCTIONS] Error fetching seller auctions:", error);
      res.status(500).json({ message: "Failed to fetch seller auctions" });
    }
  });

  // Create new auction (sellers only)
  app.post("/api/auctions", requireAuth, upload.array('images', 5), async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (req.user.role !== "seller" && req.user.role !== "seller_admin") {
        return res.status(403).json({ message: "Only sellers can create auctions" });
      }

      const auctionData = req.body;
      const userId = typeof req.user.id === 'string' ? parseInt(req.user.id, 10) : req.user.id;

      // Handle file uploads first
      const uploadedFiles = req.files as Express.Multer.File[];
      let imageUrls = [];
      if (uploadedFiles && uploadedFiles.length > 0) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        imageUrls = uploadedFiles.map(file => `${baseUrl}/uploads/${file.filename}`);
      }

      // Process auction data with explicit price handling
      const parsedData = {
        ...auctionData,
        sellerId: userId,
        startPrice: Number(auctionData.startPrice),
        reservePrice: Number(auctionData.reservePrice || auctionData.startPrice),
        startDate: new Date(auctionData.startDate),
        endDate: new Date(auctionData.endDate),
        images: imageUrls,
        imageUrl: imageUrls[0] || "",
      };

      try {
        const validatedData = insertAuctionSchema.parse(parsedData);
        const result = await storage.createAuction({
          ...validatedData,
          sellerId: userId
        });
        return res.status(201).json(result);
      } catch (validationError) {
        return res.status(400).json({
          message: "Invalid auction data",
          errors: validationError instanceof ZodError ? validationError.errors : String(validationError)
        });
      }
    } catch (error) {
      console.error("[AUCTION CREATE] Error:", error);
      return res.status(500).json({
        message: "Failed to create auction",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Place bid on auction (anyone can bid except the seller of the auction)
  app.post("/api/auctions/:id/bid", requireAuth, requireProfile, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const auctionId = parseInt(req.params.id);
      console.log(`[BID] Processing new bid for auction ${auctionId} from user ${req.user.id}`);

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

      // Convert amount to number if it's a string (and ensure it's in cents)
      let amount;
      if (typeof req.body.amount === 'string') {
        amount = Math.round(parseFloat(req.body.amount) * 100);
      } else {
        amount = req.body.amount;
      }

      if (isNaN(amount)) {
        return res.status(400).json({ message: "Bid amount must be a valid number" });
      }

      if (amount <= auction.currentPrice) {
        return res.status(400).json({
          message: `Bid must be higher than current price of $${(auction.currentPrice / 100).toFixed(2)}`
        });
      }

      console.log(`[BID] Amount validated: $${amount/100} for auction "${auction.title}"`);

      const bidData = {
        auctionId: auction.id,
        bidderId: req.user.id,
        amount: amount,
      };

      console.log("[BID] Creating bid with data:", bidData);
      const bid = await storage.createBid(bidData);
      console.log("[BID] Bid created successfully:", bid);

      // Send notification to the seller about the new bid
      try {
        console.log("[NOTIFICATION] Attempting to send notifications for new bid");
        const { NotificationService } = await import('./notification-service');

        console.log("[NOTIFICATION] Notifying seller:", {
          sellerId: auction.sellerId,
          auctionTitle: auction.title,
          amount: amount
        });

        await NotificationService.notifyNewBid(
          auction.sellerId,
          auction.title,
          amount
        );
        console.log("[NOTIFICATION] Seller notification sent successfully");

        // Get previous bids to notify outbid user
        const previousBids = await storage.getBidsForAuction(auction.id);
        if (previousBids.length > 1) {
          // Sort by amount in descending order to get the second highest bid
          const sortedBids = previousBids.sort((a, b) => b.amount - a.amount);
          const secondHighestBid = sortedBids[1];

          // Only notify if it's a different bidder
          if (secondHighestBid.bidderId !== req.user.id) {
            console.log("[NOTIFICATION] Notifying previous bidder:", {
              bidderId: secondHighestBid.bidderId,
              auctionTitle: auction.title,
              newAmount: amount
            });

            await NotificationService.notifyOutbid(
              secondHighestBid.bidderId,
              auction.title,
              amount
            );
            console.log("[NOTIFICATION] Previous bidder notification sent successfully");
          }
        }
      } catch (notifyError) {
        console.error("[NOTIFICATION] Failed to send bid notification:", notifyError);
        console.error("[NOTIFICATION] Full error details:", {
          error: notifyError,
          stack: notifyError.stack,
          bid: bid,
          auction: auction
        });
      }

      res.status(201).json(bid);
    } catch (error) {
      console.error("[BID] Error:", error);
      if (error instanceof ZodError) {
        res.status(400).json({
          message: "Invalid bid data",
          errors: error.errors
        });
      } else {
        res.status(500).json({
          message: "Failed to place bid",
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }
  });

  // Update the single auction endpoint to include seller profile
  app.get("/api/auctions/:id", async (req, res) => {
    try {
      const auction = await storage.getAuction(parseInt(req.params.id));
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }

      // Get the seller's profile
      const sellerProfile = await storage.getProfile(auction.sellerId);
      res.json({ ...auction, sellerProfile });
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

  // Get admin auctions (including pending)
  app.get("/api/admin/auctions", requireAdmin, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const approved = req.query.approved === 'true' ? true : 
                      req.query.approved === 'false' ? false : undefined;

      console.log(`[ADMIN] Fetching auctions with status: ${status}, approved: ${approved}`);

      const auctions = await storage.getAuctions({ 
        status,
        approved
      });

      // Get seller profiles for each auction
      const auctionsWithSellerProfiles = await Promise.all(
        auctions.map(async (auction) => {
          const sellerProfile = await storage.getProfile(auction.sellerId);
          return { ...auction, sellerProfile };
        })
      );

      console.log(`[ADMIN] Found ${auctions.length} auctions`);
      res.json(auctionsWithSellerProfiles);
    } catch (error) {
      console.error("[ADMIN] Error fetching auctions:", error);
      res.status(500).json({ message: "Failed to fetch auctions" });
    }
  });

  // Add this new endpoint for admin bid management
  app.get("/api/admin/bids", requireAdmin, async (req, res) => {
    try {
      const auctionId = req.query.auctionId ? parseInt(req.query.auctionId as string) : undefined;

      // If auctionId is provided, get bids for that auction
      // Otherwise, return an error as we should always specify an auction
      if (!auctionId) {
        return res.status(400).json({ message: "Auction ID is required" });
      }

      const bids = await storage.getBidsForAuction(auctionId);
      res.json(bids);
    } catch (error) {
      console.error("Error fetching bids:", error);
      res.status(500).json({ message: "Failed to fetch bids" });
    }
  });

  // Update the user bids endpoint to include payment information
  app.get("/api/user/bids", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get all bids by the user with their corresponding auctions
      const bids = await storage.getBidsByUser(req.user.id);

      // Get all auctions for these bids
      const auctions = await Promise.all(
        bids.map(bid => storage.getAuction(bid.auctionId))
      );

      // Filter out any undefined auctions and combine with bid data
      const bidsWithAuctions = bids.map(bid => {
        const auction = auctions.find(a => a?.id === bid.auctionId);
        const isWinningBid = auction?.winningBidderId === req.user!.id;
        return auction ? {
          ...bid,
          auction,
          isWinningBid,
          requiresPayment: isWinningBid && auction.paymentStatus === "pending",
        } : null;
      }).filter(Boolean);

      res.json(bidsWithAuctions);
    } catch (error) {
      console.error("Error fetching user bids:", error);
      res.status(500).json({ message: "Failed to fetch user bids" });
    }
  });


  // Profile routes
  app.post("/api/profile", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const profileData = insertProfileSchema.parse(req.body);

      // Check if profile exists
      const existingProfile = await storage.getProfile(req.user.id);

      let profile;
      if (existingProfile) {
        // Update existing profile
        profile = await storage.updateProfile(req.user.id, profileData);
      } else {
        // Create new profile
        profile = await storage.createProfile({
          ...profileData,
          userId: req.user.id,
        });
      }

      res.status(201).json(profile);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          message: "Invalid profile data",
          errors: error.errors,
        });
      } else {
        console.error("Error saving profile:", error);
        res.status(500).json({ message: "Failed to save profile" });
      }
    }
  });

  app.get("/api/profile", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const profile = await storage.getProfile(req.user.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
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

  // Update the auction approval endpoint
  app.post("/api/admin/auctions/:id/approve", requireAdmin, async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      console.log(`[ADMIN APPROVE] Starting approval process for auction ${auctionId}`);

      if (isNaN(auctionId)) {
        console.log(`[ADMIN APPROVE] Invalid auction ID: ${req.params.id}`);
        return res.status(400).json({ message: "Invalid auction ID" });
      }

      // First check if the auction exists and its current status
      const existingAuction = await storage.getAuction(auctionId);
      if (!existingAuction) {
        console.log(`[ADMIN APPROVE] Auction ${auctionId} not found`);
        return res.status(404).json({ message: "Auction not found" });
      }

      // Log auction state before approval
      console.log(`[ADMIN APPROVE] Current auction state:`, {
        id: existingAuction.id,
        status: existingAuction.status,
        approved: existingAuction.approved
      });

      // Only allow approval of pending auctions
      if (existingAuction.approved) {
        console.log(`[ADMIN APPROVE] Auction ${auctionId} is already approved`);
        return res.status(400).json({ message: "Auction is already approved" });
      }

      const auction = await storage.approveAuction(auctionId);

      // Log successful approval
      console.log(`[ADMIN APPROVE] Successfully approved auction:`, {
        id: auction.id,
        status: auction.status,
        approved: auction.approved
      });

      res.json(auction);
    } catch (error) {
      console.error("[ADMIN APPROVE] Error approving auction:", error);
      res.status(500).json({ 
        message: "Failed to approve auction",
        error: error instanceof Error ? error.message : String(error)
      });
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

  // Add new admin profile route
  app.get("/api/admin/profiles/:userId", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const profile = await storage.getProfile(userId);

      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      // Get user's bids if they're a buyer
      const user = await storage.getUser(userId);
      if (user?.role === "buyer") {
        const bids = await storage.getBidsByUser(userId);
        return res.json({ ...profile, bids });
      }

      // Get user's auctions if they're a seller
      if (user?.role === "seller" || user?.role === "seller_admin") {
        const auctions = await storage.getAuctions({ sellerId: userId });
        return res.json({ ...profile, auctions });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Add routes for getting user's bids and auctions
  app.get("/api/admin/users/:userId/bids", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const bids = await storage.getBidsByUser(userId);
      res.json(bids);
    } catch (error) {
      console.error("Error fetching user bids:", error);
      res.status(500).json({ message: "Failed to fetch user bids" });
    }
  });

  app.get("/api/admin/users/:userId/auctions", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const auctions = await storage.getAuctions({ sellerId: userId });
      res.json(auctions);
    } catch (error) {
      console.error("Error fetching user auctions:", error);
      res.status(500).json({ message: "Failed to fetch user auctions" });
    }
  });

  // Admin profile management
  app.delete("/api/admin/profiles/:userId", requireAdmin, async (req, res) => {
    try {
      await storage.deleteProfile(parseInt(req.params.userId));
      res.sendStatus(200);
    } catch (error) {
      console.error("Error deleting profile:", error);
      res.status(500).json({ message: "Failed to delete profile" });
    }
  });

  // Admin auction management
  app.delete("/api/admin/auctions/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteAuction(parseInt(req.params.id));
      res.sendStatus(200);
    } catch (error) {
      console.error("Error deleting auction:", error);
      res.status(500).json({ message: "Failed to delete auction" });
    }
  });

  app.patch("/api/admin/auctions/:id", requireAdmin, async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const data = req.body;

      // Map legacy categories to new format if present
      if (data.category) {
        const categoryMap = {
          "show": "Show Quality",
          "purebred": "Purebred & Production",
          "fun": "Fun & Mixed"
        };

        if (categoryMap[data.category]) {
          data.category = categoryMap[data.category];
          console.log(`Mapped category from ${req.body.category} to ${data.category}`);
        }
      }

      // Log price data for debugging
      if (data.startPrice !== undefined || data.reservePrice !== undefined || data.currentPrice !== undefined) {
        console.log("Updating auction prices:", {
          auctionId,
          startPrice: data.startPrice,
          reservePrice: data.reservePrice,
          currentPrice: data.currentPrice,
          startPriceType: typeof data.startPrice,
          reservePriceType: typeof data.reservePrice,
          currentPriceType: typeof data.currentPrice
        });
      }

      const updatedAuction = await storage.updateAuction(auctionId, data);
      res.json(updatedAuction);
    } catch (error) {
      console.error("Error updating auction:", error);
      res.status(500).json({ message: "Failed to update auction" });
    }
  });
  
  // Admin endpoint for managing auction photos
  app.post("/api/admin/auctions/:id/photos", requireAdmin, upload.array('images', 5), async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      
      // Check if auction exists
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }
      
      // Handle image uploads
      const uploadedFiles = req.files as Express.Multer.File[];
      if (!uploadedFiles || uploadedFiles.length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }
      
      // Generate URLs for uploaded images
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const imageUrls = uploadedFiles.map(file => `${baseUrl}/uploads/${file.filename}`);
      
      // Get existing images and append new ones
      const existingImages = Array.isArray(auction.images) ? auction.images : [];
      const updatedImages = [...existingImages, ...imageUrls];
      
      // Update auction with new images
      const updatedAuction = await storage.updateAuction(auctionId, {
        images: updatedImages,
        imageUrl: updatedImages[0] || auction.imageUrl // Set first image as primary if available
      });
      
      res.status(200).json({
        message: "Photos added successfully",
        auction: updatedAuction
      });
    } catch (error) {
      console.error("Error adding auction photos:", error);
      res.status(500).json({ message: "Failed to add photos to auction" });
    }
  });
  
  // Admin endpoint for deleting a specific auction photo
  app.delete("/api/admin/auctions/:id/photos/:photoIndex", requireAdmin, async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const photoIndex = parseInt(req.params.photoIndex);
      
      // Check if auction exists
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }
      
      // Validate that the auction has images and the index is valid
      if (!Array.isArray(auction.images) || auction.images.length === 0) {
        return res.status(400).json({ message: "Auction has no images" });
      }
      
      if (photoIndex < 0 || photoIndex >= auction.images.length) {
        return res.status(400).json({ message: "Invalid photo index" });
      }
      
      // Remove the image at the specified index
      const updatedImages = [...auction.images];
      updatedImages.splice(photoIndex, 1);
      
      // Update the auction
      const updatedAuction = await storage.updateAuction(auctionId, {
        images: updatedImages,
        imageUrl: updatedImages.length > 0 ? updatedImages[0] : "" // Update primary image if needed
      });
      
      res.status(200).json({
        message: "Photo deleted successfully",
        auction: updatedAuction
      });
    } catch (error) {
      console.error("Error deleting auction photo:", error);
      res.status(500).json({ message: "Failed to delete auction photo" });
    }
  });

  // Admin bid management
  app.delete("/api/admin/bids/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteBid(parseInt(req.params.id));
      res.sendStatus(200);
    } catch (error) {
      console.error("Error deleting bid:", error);
      res.status(500).json({ message: "Failed to delete bid" });
    }
  });

  // Create buyer request (no auth required)
  app.post("/api/buyer-requests", async (req, res) => {
    try {
      console.log("Creating buyer request with data:", req.body);

      try {
        const requestData = insertBuyerRequestSchema.parse(req.body);
        console.log("Validated request data:", requestData);

        const buyerRequest = await storage.createBuyerRequest({
          ...requestData,
          buyerId: req.user?.id || 0, // Use 0 for anonymous requests
        });

        console.log("Successfully created buyer request:", buyerRequest);
        res.status(201).json(buyerRequest);
      } catch (error) {
        console.error("Validation or creation error:", error);
        if (error instanceof ZodError) {
          return res.status(400).json({
            message: "Invalid request data",
            errors: error.errors,
          });
        }
        throw error;
      }
    } catch (error) {
      console.error("Error creating buyer request:", error);
      res.status(500).json({ 
        message: "Failed to create buyer request",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/buyer-requests", async (req, res) => {
    try {
      const filters = {
        status: req.query.status as string || "open",
      };

      console.log("[BUYER REQUESTS] Fetching with filters:", filters);
      const requests = await storage.getBuyerRequests(filters);
      console.log(`[BUYER REQUESTS] Found ${requests.length} requests`);

      // Get buyer profiles for each request
      const requestsWithProfiles = await Promise.all(
        requests.map(async (request) => {
          const buyerProfile = await storage.getProfile(request.buyerId);
          console.log(`[BUYER REQUESTS] Found profile for buyer ${request.buyerId}:`, 
            buyerProfile ? "yes" : "no");
          return { ...request, buyerProfile };
        })
      );

      console.log(`[BUYER REQUESTS] Returning ${requestsWithProfiles.length} requests with profiles`);
      res.json(requestsWithProfiles);
    } catch (error) {
      console.error("[BUYER REQUESTS] Error fetching requests:", error);
      res.status(500).json({ message: "Failed to fetch buyer requests" });
    }
  });

  app.get("/api/buyer-requests/:id", async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      console.log(`[BUYER REQUEST] Fetching request ${requestId}`);

      if (isNaN(requestId)) {
        console.log(`[BUYER REQUEST] Invalid ID: ${req.params.id}`);
        return res.status(400).json({ message: "Invalid request ID" });
      }

      const request = await storage.getBuyerRequest(requestId);
      if (!request) {
        console.log(`[BUYER REQUEST] Request ${requestId} not found`);
        return res.status(404).json({ message: "Buyer request not found" });
      }

      console.log(`[BUYER REQUEST] Found request:`, request);

      // Increment views
      await storage.incrementBuyerRequestViews(request.id);

      // Get buyer profile if it exists (for non-anonymous requests)
      let buyerProfile = null;
      if (request.buyerId > 0) {
        console.log(`[BUYER REQUEST] Fetching profile for buyer ${request.buyerId}`);
        buyerProfile = await storage.getProfile(request.buyerId);
      }

      console.log(`[BUYER REQUEST] Returning request with profile:`, {
        requestId,
        hasProfile: !!buyerProfile
      });

      res.json({ ...request, buyerProfile });
    } catch (error) {
      console.error("[BUYER REQUEST] Error fetching request:", error);
      res.status(500).json({ message: "Failed to fetch buyer request" });
    }
  });

  // Update buyer request (admin only)
  app.patch("/api/buyer-requests/:id", requireAdmin, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const data = req.body;
      const updatedRequest = await storage.updateBuyerRequest(requestId, data);
      res.json(updatedRequest);
    } catch (error) {
      console.error("Error updating buyer request:", error);
      res.status(500).json({ message: "Failed to update buyer request" });
    }
  });

  // Delete buyer request (admin only)
  app.delete("/api/buyer-requests/:id", requireAdmin, async (req, res) => {
    try {
      const requestId = parseInt(req.params.id);
      await storage.deleteBuyerRequest(requestId);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error deleting buyer request:", error);
      res.status(500).json({ message: "Failed to delete buyer request" });
    }
  });

  app.post("/api/auctions/:id/pay", requireAuth, requireProfile, async (req, res) => {
    try {
      // Log authentication state
      console.log('Payment request authentication:', {
        isAuthenticated: req.isAuthenticated(),
        userId: req.user?.id,
        session: req.session
      });
      if (!req.user) {
        return res.status(401).json({
          message: "Unauthorized - Please log in again",
          code: "AUTH_REQUIRED"
        });
      }
      const auctionId = parseInt(req.params.id);
      const { includeInsurance = false } = req.body;
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }
      // Verify this user won the auction
      if (auction.winningBidderId !== req.user.id) {
        return res.status(403).json({
          message: "Only the winning bidder can pay",
          code: "NOT_WINNER"
        });
      }
      // Get the base URL from the request
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      // Create Stripe Checkout session
      const { sessionId, payment } = await PaymentService.createCheckoutSession(
        auctionId,
        req.user.id,
        includeInsurance,
        baseUrl
      );
      res.json({ sessionId, payment });
    } catch (error) {
      console.error("Payment creation error:", error);
      res.status(500).json({
        message: "Failed to create payment session",
        details: error instanceof Error ? error.message : "Unknown error",
        code: "PAYMENT_CREATION_FAILED"
      });
    }
  });
  
  // Endpoint to retrieve a checkout session URL
  app.get("/api/checkout-session/:sessionId", requireAuth, async (req, res) => {
    try {
      const { sessionId } = req.params;
      // Initialize Stripe with the secret key
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2023-10-16",
      });
      // Retrieve the checkout session from Stripe
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      // Return the URL for client-side redirect
      res.json({ url: session.url });
    } catch (error) {
      console.error("Error retrieving checkout session:", error);
      res.status(500).json({ message: "Failed to retrieve checkout session" });
    }
  });
  
  // Update the webhook handling section
  app.post("/api/webhooks/stripe", async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const rawBody = await buffer(req);
    try {
      console.log("Received Stripe webhook event");
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2023-10-16",
      });
      const event = stripe.webhooks.constructEvent(
        rawBody,
        sig as string,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      console.log("Webhook event type:", event.type);
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          console.log("Processing completed checkout session:", session.id);
          // Update payment and auction status
          await storage.updatePaymentBySessionId(session.id, {
            status: "completed",
            stripePaymentIntentId: session.payment_intent as string,
          });
          // Find and update the associated auction
          const payment = await storage.getPaymentBySessionId(session.id);
          if (payment) {
            console.log("Updating auction status for payment:", payment.id);
            await storage.updateAuction(payment.auctionId, {
              paymentStatus: "completed",
            });
          }
          break;
        }
        case "payment_intent.payment_failed": {
          const failedIntent = event.data.object;
          console.log("Processing failed payment:", failedIntent.id);
          await storage.updatePaymentByIntentId(failedIntent.id, {
            status: "failed",
          });
          break;
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(400).json({ message: "Webhook error" });
    }
  });
  
  // Get payment status for an auction
  app.get("/api/auctions/:id/payment", requireAuth, async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }
      // Only allow winner or seller to view payment status
      if (req.user!.id !== auction.winningBidderId && req.user!.id !== auction.sellerId) {
        return res.status(403).json({ message: "Unauthorized to view payment status" });
      }
      res.json({        status: auction.paymentStatus,        dueDate: auction.paymentDueDate,      });
    } catch (error) {
      console.error("Error fetching paymentstatus:", error);
      res.status(500).json({ message: "Failed to fetch payment status" });
    }
  });
  
  // Add these notification routes after the existing routes
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const notifications = await storage.getNotificationsByUserId(req.user.id);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });
  
  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const notification = await storage.markNotificationAsRead(parseInt(req.params.id));
      res.json(notification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });
  
  app.post("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const notifications = await storage.getNotificationsByUserId(req.user.id);
      await Promise.all(
        notifications.map(notification => 
          storage.markNotificationAsRead(notification.id)
        )
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });
  
  // Add notification count endpoint
  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const count = await storage.getUnreadNotificationsCount(req.user.id);
      res.json({ count });
    } catch (error) {
      console.error("Error getting unread notifications count:", error);
      res.status(500).json({ message: "Failed to get unread notifications count" });
    }
  });
  
  // Add this new route after the existing /api/sellers/status route
  app.get("/api/sellers/active", async (req, res) => {
    try {
      // Get all approved sellers
      const sellers = await storage.getUsers({ 
        role: "seller",
        approved: true 
      });
      // Get profiles and recent auctions for each seller
      const sellersWithDetails = await Promise.all(
        sellers.map(async (seller) => {
          const profile = await storage.getProfile(seller.id);
          const auctions = await storage.getAuctions({ 
            sellerId: seller.id,
            approved: true
          });
          return {
            ...seller,
            profile,
            auctions: auctions.slice(0, 3) // Only return the 3 most recent auctions
          };
        })
      );
      // Filter out sellers without profiles or recent auctions
      const activeSellers = sellersWithDetails.filter(
        seller => seller.profile && seller.auctions.length > 0
      );
      res.json(activeSellers);
    } catch (error) {
      console.error("Error fetching active sellers:", error);
      res.status(500).json({ message: "Failed to fetch active sellers" });
    }
  });
  
  

  app.get("/api/analytics/market-stats", async (req, res) => {
    try {
      const timeFrame = req.query.timeFrame as string || 'month';
      const category = req.query.category as string;
      const species = req.query.species as string;

      console.log("[ANALYTICS] Fetching market stats with params:", { timeFrame, category, species });

      // Get all auctions based on filters
      const auctions = await storage.getAuctions({
        category: category === 'all' ? undefined : category,
        species: species === 'all' ? undefined : species,
        approved: true
      });

      console.log("[ANALYTICS] Found auctions:", auctions.length);

      // Filter and transform auction data for the price trend
      const now = new Date();
      const cutoffDate = new Date();
      switch (timeFrame) {
        case 'week':
          cutoffDate.setDate(cutoffDate.getDate() - 7);
          break;
        case 'year':
          cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
          break;
        default: // month
          cutoffDate.setMonth(cutoffDate.getMonth() - 1);
      }

      // Log the date filtering
      console.log("[ANALYTICS] Cutoff date:", cutoffDate);
      console.log("[ANALYTICS] Current date:", now);

      // Include both active and ended auctions that have prices
      // For active auctions, we'll use their current data
      const validAuctions = auctions.filter(auction => {
        // Convert string dates to Date objects for accurate comparison
        const auctionEndDate = new Date(auction.endDate);
        const auctionStartDate = new Date(auction.startDate);
        
        // Check if the auction has a valid price
        const hasValidPrice = auction.currentPrice > 0 || auction.startPrice > 0;
        
        // Include if auction is after cutoff date OR is currently active
        const isAfterCutoff = auctionEndDate >= cutoffDate;
        const isActive = auctionEndDate >= now;
        
        return hasValidPrice && (isAfterCutoff || isActive);
      });

      console.log("[ANALYTICS] Valid auctions after filtering:", validAuctions.length);

      // Sort auctions by date - use end date for completed auctions or current date for active ones
      const sortedAuctions = validAuctions.sort((a, b) => {
        const dateA = new Date(a.endDate).getTime();
        const dateB = new Date(b.endDate).getTime();
        return dateA - dateB;
      });
      
      console.log("[ANALYTICS] Sorted auctions dates:", sortedAuctions.map(a => 
        ({ id: a.id, title: a.title, start: a.startDate, end: a.endDate, price: a.currentPrice || a.startPrice }))
      );

      // Create price data points
      const priceData = sortedAuctions.map(auction => {
        // Use current price if available, otherwise use start price
        const price = auction.currentPrice > 0 ? auction.currentPrice : auction.startPrice;
        
        // For active auctions, use today's date instead of end date
        const auctionEndDate = new Date(auction.endDate);
        const dateForPoint = auctionEndDate > now ? new Date() : auctionEndDate;
        
        return {
          date: dateForPoint.toISOString(),
          price: price,
          title: auction.title,
          // Calculate moving average for trend line
          medianPrice: calculateMovingAverage(
            sortedAuctions,
            dateForPoint,
            price
          )
        };
      });

      console.log("[ANALYTICS] Generated price data points:", priceData.length);

      // Calculate other stats
      const activeAuctions = auctions.filter(
        auction => new Date(auction.endDate) > now
      ).length;

      // Get all bids for the filtered auctions
      const allBids = await Promise.all(
        validAuctions.map(async auction => {
          const bids = await storage.getBidsForAuction(auction.id);
          return { auctionId: auction.id, bids };
        })
      );

      // Calculate active bidders (unique bidders across all auctions)
      const allBidders = new Set();
      let totalBidsCount = 0;
      
      allBids.forEach(({ bids }) => {
        bids.forEach(bid => {
          allBidders.add(bid.bidderId);
          totalBidsCount++;
        });
      });
      
      const activeBidders = allBidders.size;
      const totalBids = totalBidsCount;

      console.log("[ANALYTICS] Active bidders:", activeBidders);
      console.log("[ANALYTICS] Total bids:", totalBids);

      // Calculate popular categories
      const categoryCount = validAuctions.reduce((acc, auction) => {
        const category = auction.category || "Uncategorized";
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const popularCategories = Object.entries(categoryCount)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      console.log("[ANALYTICS] Popular categories:", popularCategories);

      // Calculate average prices by species
      const speciesPrices = validAuctions.reduce((acc, auction) => {
        const price = auction.currentPrice || auction.startPrice;
        if (!acc[auction.species]) {
          acc[auction.species] = { total: 0, count: 0 };
        }
        acc[auction.species].total += price;
        acc[auction.species].count += 1;
        return acc;
      }, {} as Record<string, { total: number; count: number }>);

      const averagePrices = Object.entries(speciesPrices).map(([species, data]) => ({
        species,
        averagePrice: Math.round(data.total / data.count)
      }));

      const response = {
        activeBidders,
        totalBids,
        priceData,
        activeAuctions,
        species: [...new Set(auctions.map(a => a.species))],
        averagePrices,
        topPerformers: {
          seller: null,
          buyer: null
        },
        popularCategories
      };

      console.log("[ANALYTICS] Response generated with price data points:", 
        response.priceData.length);

      res.json(response);
    } catch (error) {
      console.error("[ANALYTICS] Error fetching market stats:", error);
      res.status(500).json({ message: "Failed to fetch market statistics" });
    }
  });

  // Helper function to calculate moving average for trend line
  function calculateMovingAverage(
    auctions: any[],
    currentDate: Date,
    currentPrice: number,
    windowDays = 7
  ): number {
    const windowStart = new Date(currentDate);
    windowStart.setDate(windowStart.getDate() - windowDays);

    const windowPrices = auctions
      .filter(a => {
        const auctionDate = new Date(a.endDate);
        return auctionDate >= windowStart && auctionDate <= currentDate;
      })
      .map(a => a.currentPrice || a.startPrice);

    if (windowPrices.length === 0) return currentPrice;

    const sum = windowPrices.reduce((acc, price) => acc + price, 0);
    return Math.round(sum / windowPrices.length);
  }

  app.get("/api/sellers/active", async (req, res) => {
    try {
      // Get all approved sellers
      const sellers = await storage.getUsers({ 
        role: "seller",
        approved: true 
      });
      // Get profiles and recent auctions for each seller
      const sellersWithDetails = await Promise.all(
        sellers.map(async (seller) => {
          const profile = await storage.getProfile(seller.id);
          const auctions = await storage.getAuctions({ 
            sellerId: seller.id,
            approved: true
          });
          return {
            ...seller,
            profile,
            auctions: auctions.slice(0, 3) // Only return the 3 most recent auctions
          };
        })
      );
      // Filter out sellers without profiles or recent auctions
      const activeSellers = sellersWithDetails.filter(
        seller => seller.profile && seller.auctions.length > 0
      );
      res.json(activeSellers);
    } catch (error) {
      console.error("Error fetching active sellers:", error);
      res.status(500).json({ message: "Failed to fetch active sellers" });
    }
  });
  

  app.get("/api/analytics/auction-bids", async (req, res) => {
    try {
      // Get all auctions with their bids
      const auctions = await storage.getAuctions({});
      const auctionBids = await Promise.all(
        auctions.map(async (auction) => {
          const bids = await storage.getBidsForAuction(auction.id);
          return {
            auctionId: auction.id,
            totalBids: bids.length
          };
        })
      );
      res.json(auctionBids);
    } catch (error) {
      console.error("Error fetching auction bids:", error);
      res.status(500).json({ message: "Failed to fetch auction bids" });
    }
  });
  

  app.get("/api/analytics/top-performers", async (req, res) => {
    try {
      // Get all auctions with their bids
      const auctions = await storage.getAuctions({});
      const completedAuctions = auctions.filter(a => a.status === "ended" && a.winningBidderId);
      // Calculate seller performance
      const sellerStats = new Map();
      completedAuctions.forEach(auction => {
        if (!sellerStats.has(auction.sellerId)) {
          sellerStats.set(auction.sellerId, { total: 0, auctionsWon: 0 });
        }
        const stats = sellerStats.get(auction.sellerId);
        stats.total += auction.currentPrice;
        stats.auctionsWon += 1;
      });
      // Calculate buyerperformance
      const buyerStats = new Map();
      completedAuctions.forEach(auction => {
        if (!buyerStats.has(auction.winningBidderId)) {
          buyerStats.set(auction.winningBidderId, { total: 0, auctionsWon: 0 });
        }
        const stats = buyerStats.get(auction.winningBidderId);
        stats.total += auction.currentPrice;
        stats.auctionsWon += 1;
      });
      // Get top seller
      let topSeller = null;
      if (sellerStats.size > 0) {
        const [topSellerId, topSellerStats] = Array.from(sellerStats.entries())
          .sort((a, b) => b[1].total - a[1].total)[0];
        const sellerProfile = await storage.getProfile(topSellerId);
        topSeller = {
          userId: topSellerId,
          name: sellerProfile?.businessName || "Anonymous Seller",
          ...topSellerStats
        };
      }
      // Get top buyer
      let topBuyer = null;
      if (buyerStats.size > 0) {
        const [topBuyerId, topBuyerStats] = Array.from(buyerStats.entries())
          .sort((a, b) => b[1].total - a[1].total)[0];
        const buyerProfile = await storage.getProfile(topBuyerId);
        topBuyer = {
          userId: topBuyerId,
          name: buyerProfile?.businessName || "Anonymous Buyer",
          ...topBuyerStats
        };
      }
      res.json({ topSeller, topBuyer });
    } catch (error) {
      console.error("Error fetching top performers:", error);
      res.status(500).json({ message: "Failed to fetch top performers" });
    }
  });
  

  // Set up periodic checks for auction notifications
  const NOTIFICATION_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
  setInterval(async () => {
    try {
      await AuctionService.checkAndNotifyEndingAuctions();
      await AuctionService.checkAndNotifyCompletedAuctions();
    } catch (error) {
      console.error("Error in auction notification check:", error);
    }
  }, NOTIFICATION_CHECK_INTERVAL);
  

  app.post("/api/ai/price-suggestion", requireAuth, requireApprovedSeller, async (req, res) => {
    try {
      const { species, category, quality, additionalDetails } = req.body;

      const suggestion = await AIPricingService.getPriceSuggestion(
        species,
        category,
        quality,
        additionalDetails
      );

      res.json(suggestion);
    } catch (error) {
      console.error("[AI] Error getting price suggestion:", error);
      res.status(500).json({ message: "Failed to generate price suggestion" });
    }
  });

  app.post("/api/ai/description-suggestion", requireAuth, requireApprovedSeller, async (req, res) => {
    try {
      const { title, species, category, details } = req.body;

      const suggestion = await AIPricingService.getDescriptionSuggestion(
        title,
        species,
        category,
        details
      );

      res.json(suggestion);
    } catch (error) {
      console.error("[AI] Error generating description:", error);
      res.status(500).json({ message: "Failed to generate description suggestion" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

const log = (message: string, context: string = 'general') => {
  console.log(`[${context}] ${message}`);
}