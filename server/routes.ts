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
import { SellerPaymentService } from "./seller-payments";
import { insertFulfillmentSchema } from "@shared/schema"; 
import { EmailService } from "./email"; 
import { AuctionService } from "./auction-service";
import { AIPricingService } from "./ai-service";
import type { User } from "./storage";
import { db } from "./db";
import { sql } from "drizzle-orm";

// Add middleware to check profile completion
const requireProfile = async (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    console.log("[PROFILE CHECK] User not authenticated");
    return res.status(401).json({ message: "Unauthorized" });
  }

  console.log("[PROFILE CHECK] User authentication state:", {
    userId: req.user?.id,
    role: req.user?.role,
    username: req.user?.username,
    isAuthenticated: req.isAuthenticated()
  });

  return next();
};

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Add authentication endpoints with enhanced logging and response handling
  app.post("/api/login", async (req, res) => {
    try {
      console.log("[AUTH] Login attempt:", {
        username: req.body.username,
        hasPassword: !!req.body.password
      });

      res.setHeader('Content-Type', 'application/json');

      if (!req.body.username || !req.body.password) {
        console.log("[AUTH] Login failed: Missing credentials");
        return res.status(400).json({ 
          message: "Username and password are required" 
        });
      }

      const user = await storage.authenticateUser(req.body.username, req.body.password);

      if (!user) {
        console.log("[AUTH] Login failed: Invalid credentials");
        return res.status(401).json({ 
          message: "Invalid username or password" 
        });
      }

      console.log("[AUTH] User authenticated successfully:", {
        id: user.id,
        role: user.role
      });

      req.login(user, (err) => {
        if (err) {
          console.error("[AUTH] Session creation failed:", err);
          return res.status(500).json({ 
            message: "Failed to create session" 
          });
        }

        console.log("[AUTH] Session created successfully");
        res.json(user);
      });

    } catch (error) {
      console.error("[AUTH] Login error:", error);
      res.status(500).json({ 
        message: "Authentication failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/logout", (req, res) => {
    console.log("[AUTH] Logout attempt");
    res.setHeader('Content-Type', 'application/json');
    req.logout((err) => {
      if (err) {
        console.error("[AUTH] Logout error:", err);
        return res.status(500).json({ 
          message: "Failed to logout" 
        });
      }
      console.log("[AUTH] Logout successful");
      res.json({ message: "Logged out successfully" });
    });
  });

  // Serve static files from uploads directory
  const uploadsPath = path.join(process.cwd(), 'uploads');
  app.use('/uploads', express.static(uploadsPath, {
    maxAge: '1d', // Cache for 1 day
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png')) {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
      }
    }
  }));

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
    try {
      console.log("[SELLER CHECK] Checking seller authorization:", {
        isAuthenticated: req.isAuthenticated(),
        user: req.user ? {
          id: req.user.id,
          role: req.user.role,
          approved: req.user.approved
        } : null
      });

      if (!req.isAuthenticated()) {
        console.log("[SELLER CHECK] User not authenticated");
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Allow seller_admin without approval check
      if (req.user.role === "seller_admin") {
        console.log("[SELLER CHECK] User is seller_admin, access granted");
        return next();
      }

      if (req.user.role !== "seller") {
        console.log("[SELLER CHECK] User is not a seller", { role: req.user.role });
        return res.status(403).json({ message: "Only sellers can perform this action" });
      }

      // Check approval for regular sellers
      if (!req.user.approved) {
        console.log("[SELLER CHECK] Seller not approved");
        return res.status(403).json({ message: "Only approved sellers can perform this action" });
      }

      console.log("[SELLER CHECK] Access granted to approved seller");
      next();
    } catch (error) {
      console.error("[SELLER CHECK] Error in seller authorization:", error);
      res.status(500).json({ message: "Authorization check failed" });
    }
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
      // Set content type header
      res.setHeader('Content-Type', 'application/json');

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

      // Check if auction has ended
      const now = new Date();
      const endTime = new Date(auction.endDate);
      if (now > endTime) {
        return res.status(400).json({ message: "Auction has ended" });
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

      // Check if bid was placed in the last 5 minutes and extend if necessary
      const timeUntilEnd = endTime.getTime() - now.getTime();
      const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

      console.log("[BID EXTENSION] Checking bid timing:", {
        auctionId: auction.id,
        auctionTitle: auction.title,
        currentTime: now.toISOString(),
        auctionEndTime: endTime.toISOString(),
        timeUntilEnd: timeUntilEnd / 1000, // Convert to seconds for readability
        extensionThreshold: fiveMinutes / 1000,
        shouldExtend: timeUntilEnd <= fiveMinutes
      });

      if (timeUntilEnd <= fiveMinutes) {
        const newEndDate = new Date(now.getTime() + fiveMinutes);
        console.log("[BID EXTENSION] Extending auction:", {
          auctionId: auction.id,
          auctionTitle: auction.title,
          originalEndDate: endTime.toISOString(),
          newEndDate: newEndDate.toISOString(),
          extensionAmount: fiveMinutes / 1000
        });

        await storage.updateAuction(auction.id, {
          endDate: newEndDate,
          status: "active"
        });

        console.log("[BID EXTENSION] Auction successfully extended");

        // Send notification about auction extension
        try {
          const { NotificationService } = await import('./notification-service');

          // Notify seller
          console.log("[BID EXTENSION] Notifying seller:", auction.sellerId);
          await NotificationService.notifyAuctionExtended(
            auction.sellerId,
            auction.title,
            newEndDate
          );

          // Get all unique bidders for this auction
          const auctionBids = await storage.getBidsForAuction(auction.id);
          const uniqueBidders = [...new Set(auctionBids.map(bid => bid.bidderId))];

          console.log("[BID EXTENSION] Notifying other bidders:", {
            totalBidders: uniqueBidders.length,
            currentBidder: req.user.id
          });

          // Notify all bidders about the extension
          for (const bidderId of uniqueBidders) {
            if (bidderId !== req.user.id) { // Don't notify the current bidder
              await NotificationService.notifyAuctionExtended(
                bidderId,
                auction.title,
                newEndDate
              );
            }
          }

          console.log("[BID EXTENSION] Successfully notified all participants");
        } catch (notifyError) {
          console.error("[BID EXTENSION] Failed to send notifications:", notifyError);
          // Continue with bid process even if notifications fail
        }
      }

      // Send notification to the seller about the new bid
      try {
        console.log("[NOTIFICATION] Sending bid notifications");
        const { NotificationService } = await import('./notification-service');

        await NotificationService.notifyNewBid(
          auction.sellerId,
          auction.title,
          amount
        );
        console.log("[NOTIFICATION] Seller notification sent");

        // Get previous bids to notify outbid user
        const previousBids = await storage.getBidsForAuction(auction.id);
        if (previousBids.length > 1) {
          // Sort by amount in descending order to get the second highest bid
          const sortedBids = previousBids.sort((a, b) => b.amount - a.amount);
          const secondHighestBid = sortedBids[1];

          // Only notify if it's a different bidder
          if (secondHighestBid.bidderId !== req.user.id) {
            await NotificationService.notifyOutbid(
              secondHighestBid.bidderId,
              auction.title,
              amount
            );
            console.log("[NOTIFICATION] Previous bidder notification sent");
          }
        }
      } catch (notifyError) {
        console.error("[NOTIFICATION] Failed to send bid notification:", notifyError);
      }

      // Return successful bid response
      return res.status(201).json(bid);
    } catch (error) {
      console.error("[BID] Error:", error);
      return res.status(500).json({
        message: "Failed to place bid",
        error: error instanceof Error ? error.message : "Unknown error"
      });
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
      if (!auctionId) {
        return res.status(400).json({ message: "Auction ID is required" });
      }

      // Get bids with bidder information
      const bids = await storage.getBidsForAuction(auctionId);
      const bidsWithBidders = await Promise.all(
        bids.map(async (bid) => {
          const bidder = await storage.getUser(bid.bidderId);
          const bidderProfile = await storage.getProfile(bid.bidderId);
          return {
            ...bid,
            bidder: {
              username: bidder?.username,
              fullName: bidderProfile?.fullName,
              email: bidderProfile?.email
            }
          };
        })
      );

      console.log(`[ADMIN BIDS] Retrieved ${bidsWithBidders.length} bids with bidder details for auction ${auctionId}`);
      res.json(bidsWithBidders);
    } catch (error) {
      console.error("[ADMIN BIDS] Error fetching bids:", error);
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

      // Only allow approval of pending auctions
      if (existingAuction.approved) {
        console.log(`[ADMIN APPROVE] Auction ${auctionId} is already approved`);
        return res.status(400).json({ message: "Auction is already approved" });
      }

      // Update auction to be approved and active
      const updatedAuction = await storage.updateAuction(auctionId, {
        approved: true,
        status: 'active'
      });

      console.log(`[ADMIN APPROVE] Successfully approved auction:`, {
        id: updatedAuction.id,
        status: updatedAuction.status,
        approved: updatedAuction.approved
      });

      res.json(updatedAuction);
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
  app.post("/api/upload", requireAuth, upload.array('files', 5), (req, res) => {
  try {
    handleFileUpload(req, res);
  } catch (error) {
    console.error('[UPLOAD] Uncaught error in file upload handler:', error);
    res.status(500).json({ 
      message: 'An unexpected error occurred during file upload',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

  // Update the get users endpoint to properly filter by approval status
  app.get("/api/admin/users", requireAdmin, async (req, res) => {
    try {
      const filters = {
        approved: req.query.approved === 'true' ? true :
          req.query.approved === 'false' ? false : undefined,
        role: req.query.role as string | undefined
      };

      console.log("[ADMIN] Fetching users with filters:", filters);
      const users = await storage.getUsers(filters);

      // For pending sellers, only return those that are not approved
      if (filters.approved === false && filters.role === "seller") {
        const pendingSellers = users.filter(user => !user.approved);
        return res.json(pendingSellers);
      }

      // For approved sellers, only return those that are approved
      if (filters.approved === true && (filters.role === "seller" || filters.role === "seller_admin")) {
        const approvedSellers = users.filter(user => user.approved);
        return res.json(approvedSellers);
      }

      res.json(users);
    } catch (error) {
      console.error("[ADMIN] Error fetching users:", error);
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

  app.get("/api/admin/sellers/stripe-status", requireAdmin, async (req, res) => {
    try {
      const sellers = await storage.getUsers({ role: "seller" });
      const sellerAdmins = await storage.getUsers({ role: "seller_admin" });
      const allSellers = [...sellers, ...sellerAdmins];

      const statusList = await Promise.all(allSellers.map(async (seller) => {
        const profile = await storage.getProfile(seller.id);
        return {
          sellerId: seller.id,
          username: seller.username,
          hasStripeAccount: !!profile?.stripeAccountId,
          stripeAccountStatus: profile?.stripeAccountStatus
        };
      }));

      res.json(statusList);
    } catch (error) {
      console.error("Error fetching seller Stripe statuses:", error);
      res.status(500).json({ message: "Failed to fetch seller Stripe statuses" });
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

// Market Analytics Endpoints
app.get("/api/analytics/market-stats", async (req, res) => {
  try {
    const timeFrame = req.query.timeFrame as string || "month";
    const category = req.query.category as string || "all";
    const species = req.query.species as string || "all";

    console.log(`[ANALYTICS] Fetching market stats with filters:`, {
      timeFrame,
      category,
      species
    });

    // Get auctions data for analysis
    const auctionFilters: any = { approved: true };
    if (category !== "all") {
      auctionFilters.category = category;
    }
    if (species !== "all") {
      auctionFilters.species = species;
    }

    const auctions = await storage.getAuctions(auctionFilters);
    
    // Get all bids for analysis
    let allBids = [];
    for (const auction of auctions) {
      const bids = await storage.getBidsForAuction(auction.id);
      allBids.push(...bids);
    }

    // Calculate active auctions
    const now = new Date();
    const activeAuctions = auctions.filter(
      auction => new Date(auction.startDate) <= now && new Date(auction.endDate) >= now
    ).length;

    // Get unique bidders in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentBids = allBids.filter(bid => new Date(bid.createdAt) >= thirtyDaysAgo);
    const activeBidders = [...new Set(recentBids.map(bid => bid.bidderId))].length;

    // Process auction data for price trends
    const priceData = auctions
      .filter(auction => auction.status === "ended" && auction.winningBidderId)
      .map(auction => ({
        date: new Date(auction.endDate).toISOString().split('T')[0],
        price: auction.currentPrice,
        title: auction.title
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Get all species for filter dropdown
    const species_list = [...new Set(auctions.map(auction => auction.species))];

    // Calculate average prices by species
    const speciesPrices = {};
    auctions
      .filter(auction => auction.status === "ended" && auction.winningBidderId)
      .forEach(auction => {
        if (!speciesPrices[auction.species]) {
          speciesPrices[auction.species] = [];
        }
        speciesPrices[auction.species].push(auction.currentPrice);
      });
    
    const averagePrices = Object.entries(speciesPrices).map(([species, prices]) => ({
      species,
      averagePrice: Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length)
    }));

    // Calculate popular categories
    const categoryCount = {};
    auctions.forEach(auction => {
      if (!categoryCount[auction.category]) {
        categoryCount[auction.category] = 0;
      }
      categoryCount[auction.category]++;
    });
    
    const popularCategories = Object.entries(categoryCount)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    // Get top performers (sellers and buyers)
    const completedAuctions = auctions.filter(auction => 
      auction.status === "ended" && auction.winningBidderId
    );

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
    
    // Calculate buyer performance
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
        name: buyerProfile?.fullName || "Anonymous Buyer",
        ...topBuyerStats
      };
    }

    const responseData = {
      activeBidders,
      totalBids: allBids.length,
      activeAuctions,
      priceData,
      species: species_list,
      averagePrices,
      popularCategories,
      topPerformers: {
        seller: topSeller,
        buyer: topBuyer
      }
    };

    console.log(`[ANALYTICS] Successfully generated market stats`);
    res.json(responseData);
  } catch (error) {
    console.error("[ANALYTICS] Error generating market stats:", error);
    res.status(500).json({ message: "Failed to generate market statistics" });
  }
});


      console.log("[ADMIN AUCTION UPDATE] Received update data:", {
        auctionId,
        updateData: data,
        hasImages: !!data.images
      });

      // Get the existing auction to compare with
      const existingAuction = await storage.getAuction(auctionId);
      if (!existingAuction) {
        return res.status(404).json({ message: "Auction not found" });
      }

      // Initialize update data object
      const updateData: any = {
        ...data,
        images: data.images || existingAuction.images // Preserve existing images if none provided
      };

      // Ensure we're not losing the primary image
      if (!updateData.imageUrl && updateData.images?.length > 0) {
        updateData.imageUrl = updateData.images[0];
      }

      console.log("[ADMIN AUCTION UPDATE] Processed update data:", {
        images: updateData.images,
        imageUrl: updateData.imageUrl
      });

      const updatedAuction = await storage.updateAuction(auctionId, updateData);
      console.log("[ADMIN AUCTION UPDATE] Successfully updated auction:", {
        id: updatedAuction.id,
        imageCount: updatedAuction.images?.length || 0
      });

      res.json(updatedAuction);
    } catch (error) {
      console.error("[ADMIN AUCTION UPDATE] Error:", error);
      res.status(500).json({
        message: "Failed to update auction",
        error: error instanceof Error ? error.message : String(error)
      });
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
            buyerProfile ? "yes" : "no");          return { ...request, buyerProfile };
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

  // Add seller approval endpoint
  app.post("/api/admin/sellers/:id/approve", requireAdmin, async (req, res) => {
    try {
      const sellerId = parseInt(req.params.id);
      console.log(`[ADMIN] Approving seller with ID ${sellerId}`);

      // Find the user associated with this seller ID
      const users = await storage.getUsers();
      const sellerUser = users.find(user => user.id === sellerId);

      if (!sellerUser) {
        return res.status(404).json({ message: "Seller not found" });
      }

      // Update the user's approved status
      await storage.updateUser(sellerId, { approved: true });

      // Send notification to the user
      await NotificationService.createNotification(sellerId, {
        type: "account",
        title: "Account Approved",
        message: "Your seller account has been approved! You can now create auctions."
      });

      console.log(`[ADMIN] Successfully approved seller ${sellerId}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error approving seller:", error);
      res.status(500).json({ message: "Failed to approve seller" });
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
      // Filter out sellers without profiles or active approved auctions
      const activeSellers = sellersWithDetails.filter(
        seller => seller.profile && 
                 seller.auctions.some(auction => 
                   auction.status === "active" && 
                   auction.approved === true
                 )
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
      console.log("[AI ENDPOINT] Received price suggestion request:", {
        body: req.body,
        user: {
          id: req.user.id,
          role: req.user.role
        }
      });

      const { species, category, quality, additionalDetails } = req.body;

      const suggestion = await AIPricingService.getPriceSuggestion(
        species,
        category,
        quality || "Standard",
        additionalDetails || ""
      );

      console.log("[AI ENDPOINT] Generated price suggestion:", suggestion);
      res.json(suggestion);
    } catch (error) {
      console.error("[AI ENDPOINT] Error getting price suggestion:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to generate price suggestion" 
      });
    }
  });

  app.post("/api/ai/description-suggestion", requireAuth, requireApprovedSeller, async (req, res) => {
    try {
      console.log("[AI ENDPOINT] Received description suggestion request:", {
        body: req.body,
        user: {
          id: req.user.id,
          role: req.user.role
        }
      });

      const { title, species, category, details } = req.body;

      const suggestion = await AIPricingService.getDescriptionSuggestion(
        title || `${species} - ${category}`,
        species,
        category,
        details || ""
      );

      console.log("[AI ENDPOINT] Generated description suggestion:", suggestion);
      res.json(suggestion);
    } catch (error) {
      console.error("[AI ENDPOINT] Error generating description:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to generate description" 
      });
    }
  });

  // Stripe Connect for sellers
  app.post("/api/seller/connect", requireAuth, async (req, res) => {
    try {
      console.log("[Stripe Connect] Starting connect process");
      const user = req.user as User;
      console.log("[Stripe Connect] User:", user.id);

      const profile = await storage.getProfile(user.id);
      if (!profile) {
        console.log("[Stripe Connect] Profile not found for user:", user.id);
        return res.status(404).json({ message: "Profile not found" });
      }
      console.log("[Stripe Connect] Profile found:", profile.email);

      console.log("[StripeConnect] Creating seller account");
      const { accountId, url } = await SellerPaymentService.createSellerAccount(
        profile
      );
      console.log("[Stripe Connect] Account created, ID:", accountId);
      console.log("[Stripe Connect] Redirect URL generated");

      return res.json({ accountId, url });
    } catch (error) {
      console.error("[Stripe Connect] Error:", error);
      if (error instanceof Error) {
        console.error("[Stripe Connect] Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      return res.status(500).json({
        message: "Failed to connect with Stripe",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Get seller's Stripe account status
  app.get("/api/seller/status", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const profile = await storage.getProfile(req.user.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      if (!profile.stripeAccountId) {
        return res.json({ status: "not_started" });
      }

      const status = await SellerPaymentService.getAccountStatus(profile.stripeAccountId);

      // Update profile with latest status from Stripe if it's changed
      if (profile.stripeAccountStatus !== status) {
        await storage.updateSellerStripeAccount(req.user.id, {
          accountId: profile.stripeAccountId,
          status
        });
      }

      return res.json({ 
        status,
        accountId: profile.stripeAccountId
      });
    } catch (error) {
      console.error("[Seller Status] Error:", error);
      return res.status(500).json({ 
        message: "Failed to fetch seller status",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // API endpoint for fulfillment
  app.post("/api/auctions/:id/fulfill", requireAuth, requireApprovedSeller, async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const { trackingNumber, carrier, notes } = req.body;

      // Verify auction belongs to seller
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }

      if (auction.sellerId !== req.user.id) {
        return res.status(403).json({ message: "Not authorized to fulfill this auction" });
      }

      // Create fulfillment record
      await storage.createFulfillment({
        auctionId,
        trackingNumber,
        carrier,
        notes,
        status: "shipped"
      });

      // Update auction status
      await storage.updateAuction(auctionId, {
        status: "fulfilled",
      });

      // Find the payment for this auction
      const payment = await storage.findPaymentByAuctionId(auctionId);
      if (payment && payment.status === "completed" && !payment.payoutProcessed) {
        try {
          // Now that we have tracking info, create the payout to the seller
          await SellerPaymentService.createPayout(
            payment.id,
            auction.sellerId,
            payment.sellerPayout
          );

          // Mark that payout has been processed
          await storage.markPaymentPayoutProcessed(payment.id);

          console.log(`Successfully processed payout for auction ${auctionId} to seller ${auction.sellerId}`);
        } catch (payoutError) {
          console.error("Error processing seller payout:", payoutError);
          // We'll still mark the auction as fulfilled, but log the payout error
        }
      }

      // Notify the buyer
      if (auction.winningBidderId) {
        await NotificationService.notifyFulfillment(
          auction.winningBidderId,
          auction.title,
          trackingNumber,
          carrier
        );
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Error fulfilling auction:", error);
      return res.status(500).json({ message: "Failed to fulfill auction" });
    }
  });

  // Add new endpoint for getting seller Stripe status
  app.get("/api/admin/sellers/stripe-status", requireAdmin, async (req, res) => {
    try {
      console.log("[ADMIN] Fetching Stripe status for sellers");

      // Get all sellers
      const sellers = await storage.getUsers({ role: "seller" });

      // Get Stripe status for each seller
      const sellerStatuses = await Promise.all(
        sellers.map(async (seller) => {
          try {
            const profile = await storage.getProfile(seller.id);

            // If no profile exists, return not_started status
            if (!profile) {
              return {
                sellerId: seller.id,
                status: "not_started"
              };
            }

            // Return the status from profile
            return {
              sellerId: seller.id,
              status: profile.stripeAccountStatus || "not_started"
            };
          } catch (error) {
            console.error(`[ADMIN] Error getting Stripe status for seller ${seller.id}:`, error);
            return {
              sellerId: seller.id,
              status: "not_started"
            };
          }
        })
      );

      res.json(sellerStatuses);
    } catch (error) {
      console.error("[ADMIN] Error fetching seller Stripe status:", error);
      res.status(500).json({ message: "Failed to fetch seller status" });
    }
  });

  // Add new endpoint for deleting users
  app.delete("/api/admin/users/:userId", requireAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      console.log("[ADMIN] Deleting user:", userId);

      // First delete profile if exists
      await storage.deleteProfile(userId);

      // Then delete the user
      await storage.deleteUser(userId);

      console.log("[ADMIN] Successfully deleted user and profile");
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("[ADMIN] Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Add seller profile endpoint
  app.get("/api/sellers/:id", async (req, res) => {
    try {
      const sellerId = parseInt(req.params.id);
      console.log(`[SELLER] Fetching seller profile for ID: ${sellerId}`);

      // Get the seller
      const seller = await storage.getUser(sellerId);
      if (!seller) {
        console.log(`[SELLER] Seller not found with ID: ${sellerId}`);
        return res.status(404).json({ message: "Seller not found" });
      }

      // Get seller's profile
      const profile = await storage.getProfile(sellerId);
      if (!profile) {
        console.log(`[SELLER] Profile not found for seller ID: ${sellerId}`);
        return res.status(404).json({ message: "Seller profile not found" });
      }

      // Get seller's auctions
      const auctions = await storage.getAuctions({ sellerId });
      console.log(`[SELLER] Found ${auctions.length} auctions for seller${sellerId}`);

      // Combine and return all data
      const sellerData = {
        ...seller,
        profile,
        auctions
      };

      console.log(`[SELLER] Successfully compiled seller data for ID: ${sellerId}`);
      res.json(sellerData);
    } catch (error) {
      console.error("[SELLER] Error fetching seller profile:", error);
      res.status(500).json({ message: "Failed to fetch seller profile" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

const log = (message: string, context: string = 'general') => {
  console.log(`[${context}] ${message}`);
}