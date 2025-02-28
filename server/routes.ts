import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertAuctionSchema, insertBidSchema, insertProfileSchema } from "@shared/schema";
import { ZodError } from "zod";
import path from "path";
import multer from 'multer';
import { upload, handleFileUpload } from "./uploads";
import { PaymentService } from "./payments";
import { buffer } from "micro";
import Stripe from "stripe";
import {SellerPaymentService} from "./seller-payments";
import {insertFulfillmentSchema} from "@shared/schema"; // Assuming this schema is defined elsewhere
import { EmailService } from "./email"; // Assuming this service is defined elsewhere


// Add middleware to check profile completion
const requireProfile = async (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const hasProfile = await storage.hasProfile(req.user.id);
  if (!hasProfile) {
    return res.status(403).json({ message: "Profile completion required" });
  }

  next();
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

    // Check approval for regular sellers
    if (req.user.role !== "seller" || !req.user.approved) {
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
        approved: true, // Only return approved auctions by default
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
  app.post("/api/auctions", requireApprovedSeller, requireProfile, upload.array('images', 5), async (req, res) => {
    try {
      const userId = req.user!.id;
      const auctionData = req.body;

      console.log("Creating auction with user:", userId);
      console.log("Received auction data:", auctionData);
      console.log("Received files:", req.files);

      // Convert string values to appropriate types and ensure required fields
      const parsedData = {
        ...auctionData,
        startPrice: Number(auctionData.startPrice || 0),
        reservePrice: Number(auctionData.reservePrice || 0),
        startDate: auctionData.startDate || new Date().toISOString(),
        endDate: auctionData.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        // Initialize images array if not present
        images: Array.isArray(auctionData.images) ? auctionData.images : [],
      };

      console.log("Parsed auction data for validation:", parsedData);

      try {
        const validatedData = insertAuctionSchema.parse(parsedData);
        console.log("Validation successful:", validatedData);
      } catch (error) {
        if (error instanceof ZodError) {
          console.error("Validation error:", error.errors);
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
        console.log("Image URLs created:", imageUrls);
      }

      // Set the seller ID, current price, and image URLs
      const newAuction = {
        ...parsedData,
        sellerId: userId,
        currentPrice: parsedData.startPrice,
        images: imageUrls,
        imageUrl: imageUrls[0] || "", // Set first image as main image
        approved: false, // New auctions start unapproved
      };

      try {
        console.log("Creating auction:", newAuction);
        const result = await storage.createAuction(newAuction);
        return res.status(201).json(result);
      } catch (dbError) {
        console.error("Database error creating auction:", dbError);
        return res.status(500).json({
          message: `Failed to save auction: ${(dbError as Error).message}`,
          details: dbError
        });
      }
    } catch (error) {
      console.error("Error creating auction:", error);
      return res.status(500).json({
        message: `Failed to create auction: ${(error as Error).message}`,
        details: error
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
      const updatedAuction = await storage.updateAuction(auctionId, req.body);
      res.json(updatedAuction);
    } catch (error) {
      console.error("Error updating auction:", error);
      res.status(500).json({ message: "Failed to update auction" });
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

  // Add these new endpoints in the registerRoutes function
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

  // Stripe webhook handling
  app.post("/api/webhooks/stripe", async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const rawBody = await buffer(req);

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2025-02-24.acacia",
      });
      const event = stripe.webhooks.constructEvent(
        rawBody,
        sig as string,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      switch (event.type) {
        case "payment_intent.succeeded":
          await PaymentService.handlePaymentSuccess(event.data.object.id);
          break;
        case "payment_intent.payment_failed":
          await PaymentService.handlePaymentFailure(event.data.object.id);
          break;
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

      res.json({
        status: auction.paymentStatus,
        dueDate: auction.paymentDueDate,
      });
    } catch (error) {
      console.error("Error fetching payment status:", error);
      res.status(500).json({ message: "Failed to fetch payment status" });
    }
  });

  // Add this new endpoint for handling auction end
  app.post("/api/auctions/:id/end", requireAuth, async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const auction = await storage.getAuction(auctionId);

      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }

      // Verify auction has actually ended
      if (new Date() <= new Date(auction.endDate)) {
        return res.status(400).json({ message: "Auction has not ended yet" });
      }

      // Get highest bid
      const bids = await storage.getBidsForAuction(auctionId);
      const highestBid = bids.length > 0
        ? bids.reduce((max, bid) => bid.amount > max.amount ? bid : max, bids[0])
        : null;

      if (!highestBid) {
        // No bids placed, void the auction
        await storage.updateAuction(auctionId, {
          status: "voided",
        });
        return res.json({ message: "Auction ended with no bids" });
      }

      // Check if reserve price was met
      const reserveMet = highestBid.amount >= auction.reservePrice;

      if (reserveMet) {
        // Automatically award to highest bidder
        await storage.updateAuction(auctionId, {
          status: "ended",
          winningBidderId: highestBid.bidderId,
          reserveMet: true,
          paymentStatus: "pending",
          paymentDueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days to pay
        });
        return res.json({
          message: "Auction ended successfully, reserve met",
          winningBidderId: highestBid.bidderId
        });
      } else {
        // Set to pending seller decision
        await storage.updateAuction(auctionId, {
          status: "pending_seller_decision",
          reserveMet: false,
        });
        return res.json({
          message: "Auction ended, awaiting seller decision",
          highestBid: highestBid.amount
        });
      }
    } catch (error) {
      console.error("Error ending auction:", error);
      res.status(500).json({ message: "Failed to end auction" });
    }
  });

  // Add endpoint for seller decision
  app.post("/api/auctions/:id/seller-decision", requireAuth, async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const { decision } = req.body;

      if (!decision || !["accept", "void"].includes(decision)) {
        return res.status(400).json({ message: "Invalid decision" });
      }

      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }

      // Verify this is the seller
      if (auction.sellerId !== req.user!.id) {
        return res.status(403).json({ message: "Only the seller can make this decision" });
      }

      // Verify auction is in pending_seller_decision status
      if (auction.status !== "pending_seller_decision") {
        return res.status(400).json({ message: "Auction is not awaiting seller decision" });
      }

      // Get highest bid
      const bids = await storage.getBidsForAuction(auctionId);
      const highestBid = bids.reduce((max, bid) => bid.amount > max.amount ? bid : max, bids[0]);

      if (decision === "accept") {
        // Accept the highest bid
        await storage.updateAuction(auctionId, {
          status: "ended",
          winningBidderId: highestBid.bidderId,
          sellerDecision: "accept",
          paymentStatus: "pending",
          paymentDueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days to pay
        });
        return res.json({
          message: "Highest bid accepted",
          winningBidderId: highestBid.bidderId
        });
      } else {
        // Void the auction
        await storage.updateAuction(auctionId, {
          status: "voided",
          sellerDecision: "void"
        });
        return res.json({ message: "Auction voided by seller" });
      }
    } catch (error) {
      console.error("Error processing seller decision:", error);
      res.status(500).json({ message: "Failed to process seller decision" });
    }
  });

  // Seller onboarding and payout routes
  app.post("/api/seller/connect", requireAuth, requireProfile, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get publishable key (make sure it's using the correct env var name)
      const stripePublishableKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY;
      if (!stripePublishableKey) {
        console.error("Missing Stripe publishable key");
        return res.status(500).json({
          message: "Server configuration error",
          details: "Missing Stripe publishable key"
        });
      }

      console.log("Stripe Connect request initiated. PublishableKey available:", !!stripePublishableKey);

      // Validate protocol and host
      if (!req.protocol || !req.get('host')) {
        console.error("Missing protocol or host in request:", { protocol: req.protocol, host: req.get('host') });
        return res.status(500).json({
          message: "Invalid server configuration",
          details: "Could not determine server URL"
        });
      }

      // Construct base URL
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      console.log("Using base URL:", baseUrl);

      // Check if user already has a Stripe account
      const existingProfile = await storage.getProfile(req.user.id);
      if (existingProfile?.stripeAccountId) {
        console.log("User already has Stripe account:", existingProfile.stripeAccountId);

        // Get onboarding link for existing account
        try {
          const onboardingUrl = await SellerPaymentService.getOnboardingLink(
            existingProfile.stripeAccountId,
            baseUrl
          );

          return res.json({
            url: onboardingUrl,
            accountId: existingProfile.stripeAccountId,
            publishableKey: stripePublishableKey
          });
        } catch (linkError) {
          console.error("Failed to create onboarding link:", linkError);
          return res.status(500).json({
            message: "Failed to create Stripe onboarding link",
            error: linkError instanceof Error ? linkError.message : "Unknown error"
          });
        }
      }

      // Get user profile
      const profile = await storage.getProfile(req.user.id);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      console.log("Creating new Stripe account for user:", req.user.id);

      // Create Stripe account
      const accountId = await SellerPaymentService.createSellerAccount(profile);

      // Get onboarding link
      const onboardingUrl = await SellerPaymentService.getOnboardingLink(accountId, baseUrl);

      console.log("Onboarding URL generated:", onboardingUrl);

      res.json({
        url: onboardingUrl,
        accountId,
        publishableKey: stripePublishableKey
      });
    } catch (error) {
      console.error("Error creating seller account:", error);
      res.status(500).json({
        message: "Failed to create seller account",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/seller/status", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const profile = await storage.getProfile(req.user.id);
      if (!profile?.stripeAccountId) {
        return res.json({ status: "not_started" });
      }

      const status = await SellerPaymentService.getAccountStatus(profile.stripeAccountId);
      res.json({ status });
    } catch (error) {
      console.error("Error checking seller status:", error);
      res.status(500).json({ message: "Failed to check seller status" });
    }
  });

  app.post("/api/seller/onboarding/refresh", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const profile = await storage.getProfile(req.user.id);
      if (!profile?.stripeAccountId) {
        return res.status(404).json({ message: "Stripe account not found" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const onboardingUrl = await SellerPaymentService.getOnboardingLink(
        profile.stripeAccountId,
        baseUrl
      );

      res.json({ url: onboardingUrl });
    } catch (error) {
      console.error("Error refreshing onboarding link:", error);
      res.status(500).json({ message: "Failed to refresh onboarding link" });
    }
  });

  app.get("/api/seller/payouts", requireAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const payouts = await storage.getPayoutsBySeller(req.id);
      res.json(payouts);
    } catch (error) {
      console.error("Error fetching payouts:", error);
      res.status(500).json({ message: "Failed to fetch payouts" });
    }
  });

  // Add this new analytics endpoint to the registerRoutes function
  app.get("/api/analytics/market-stats", async (req, res) => {
    try {
      // Get all approved auctions
      const allAuctions = await storage.getAuctions({ approved: true });

      // Count active auctions (not ended and approved)
      const now = new Date();
      const activeAuctions = allAuctions.filter(auction =>
        new Date(auction.endDate) > now && auction.approved
      ).length;

      // Calculate average prices by species
      const speciesPrices = allAuctions.reduce((acc, auction) => {
        if (!acc[auction.species]) {
          acc[auction.species] = { total: 0, count: 0 };
        }
        acc[auction.species].total += auction.currentPrice;
        acc[auction.species].count += 1;
        return acc;
      }, {} as Record<string, { total: number; count: number }>);

      const averagePrices = Object.entries(speciesPrices).map(([species, data]) => ({
        species,
        averagePrice: Math.round(data.total / data.count)
      }));

      // Calculate top seller and buyer for the last month
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      // Get completed auctions from last month
      const lastMonthAuctions = allAuctions.filter(auction =>
        auction.paymentStatus === 'completed' &&
        new Date(auction.endDate) >= lastMonth
      );

      // Calculate seller totals
      const sellerTotals = lastMonthAuctions.reduce((acc, auction) => {
        if (!acc[auction.sellerId]) {
          acc[auction.sellerId] = { total: 0, count: 0 };
        }
        acc[auction.sellerId].total += auction.currentPrice;
        acc[auction.sellerId].count += 1;
        return acc;
      }, {} as Record<string, { total: number; count: number }>);

      // Calculate buyer totals
      const buyerTotals = lastMonthAuctions.reduce((acc, auction) => {
        if (!acc[auction.winningBidderId]) {
          acc[auction.winningBidderId] = { total: 0, count: 0 };
        }
        acc[auction.winningBidderId].total += auction.currentPrice;
        acc[auction.winningBidderId].count += 1;
        return acc;
      }, {} as Record<string, { total: number; count: number }>);

      // Find top seller
      let topSeller = { userId: 0, total: 0, count: 0 };
      for (const [userId, data] of Object.entries(sellerTotals)) {
        if (data.total > topSeller.total) {
          topSeller = { userId: parseInt(userId), ...data };
        }
      }

      // Find top buyer
      let topBuyer = { userId: 0, total: 0, count: 0 };
      for (const [userId, data] of Object.entries(buyerTotals)) {
        if (data.total > topBuyer.total) {
          topBuyer = { userId: parseInt(userId), ...data };
        }
      }

      // Get user profiles for top performers
      const [topSellerProfile, topBuyerProfile] = await Promise.all([
        topSeller.userId ? storage.getProfile(topSeller.userId) : null,
        topBuyer.userId ? storage.getProfile(topBuyer.userId) : null,
      ]);

      // Calculate price history (average price by month)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const monthlyPrices = allAuctions
        .filter(auction => new Date(auction.endDate) >= sixMonthsAgo)
        .reduce((acc, auction) => {
          const monthKey = new Date(auction.endDate).toISOString().slice(0, 7);
          if (!acc[monthKey]) {
            acc[monthKey] = { total: 0, count: 0 };
          }
          acc[monthKey].total += auction.currentPrice;
          acc[monthKey].count += 1;
          return acc;
        }, {} as Record<string, { total: number; count: number }>);

      const priceHistory = Object.entries(monthlyPrices)
        .map(([date, data]) => ({
          date: `${date}-01`,  // First day of each month
          averagePrice: Math.round(data.total / data.count)
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Calculate popular categories
      const categoryCount = allAuctions.reduce((acc, auction) => {
        acc[auction.category] = (acc[auction.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const popularCategories = Object.entries(categoryCount)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      res.json({
        averagePrices,
        activeAuctions,
        topPerformers: {
          seller: topSellerProfile ? {
            name: topSellerProfile.fullName,
            total: topSeller.total,
            auctionsWon: topSeller.count
          } : null,
          buyer: topBuyerProfile ? {
            name: topBuyerProfile.fullName,
            total: topBuyer.total,
            auctionsWon: topBuyer.count
          } : null
        },
        priceHistory,
        popularCategories
      });
    } catch (error) {
      console.error("Error fetching market statistics:", error);
      res.status(500).json({ message: "Failed to fetch market statistics" });
    }
  });

  // Get winner details for seller
  app.get("/api/auctions/:id/winner", requireAuth, async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const auction = await storage.getAuction(auctionId);

      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }

      // Verify this is the seller
      if (auction.sellerId !== req.user!.id) {
        return res.status(403).json({ message: "Only the seller can view winner details" });
      }

      // Verify auction is ended and has a winner
      if (auction.status !== "ended" || !auction.winningBidderId) {
        return res.status(400).json({ message: "Auction must be ended and have a winner" });
      }

      const winnerDetails = await storage.getWinnerDetails(auctionId);
      if (!winnerDetails) {
        return res.status(404).json({ message: "Winner details not found" });
      }

      res.json(winnerDetails);
    } catch (error) {
      console.error("Error getting winner details:", error);
      res.status(500).json({ message: "Failed to get winner details" });
    }
  });

  // Submit fulfillment details
  app.post("/api/auctions/:id/fulfill", requireAuth, async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const auction = await storage.getAuction(auctionId);

      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }

      // Verify this is the seller
      if (auction.sellerId !== req.user!.id) {
        return res.status(403).json({ message: "Only the seller can fulfill the auction" });
      }

      // Verify auction is ended and has a winner
      if (auction.status !== "ended" || !auction.winningBidderId) {
        return res.status(400).json({ message: "Auction must be ended and have a winner" });
      }

      // Verify payment is completed
      if (auction.paymentStatus !== "completed") {
        return res.status(400).json({ message: "Payment must be completed before fulfillment" });
      }

      // Validate and create fulfillment
      const fulfillmentData = insertFulfillmentSchema.parse({
        ...req.body,
        auctionId,
      });

      const fulfillment = await storage.createFulfillment(fulfillmentData);

      // Email notifications temporarily disabled for testing
      /*
      // Get winner user and send notification
      const winner = await storage.getUser(auction.winningBidderId);
      if (winner) {
        await EmailService.sendNotification('fulfillment', winner, {
          auctionTitle: auction.title,
          shippingCarrier: fulfillmentData.shippingCarrier,
          trackingNumber: fulfillmentData.trackingNumber,
          shippingDate: fulfillmentData.shippingDate.toISOString(),
          estimatedDeliveryDate: fulfillmentData.estimatedDeliveryDate?.toISOString(),
        });
      }
      */

      res.status(201).json(fulfillment);
    } catch (error) {
      console.error("Error fulfilling auction:", error);
      if (error instanceof ZodError) {
        res.status(400).json({
          message: "Invalid fulfillment data",
          errors: error.errors,
        });
      } else {
        res.status(500).json({ message: "Failed to fulfill auction" });
      }
    }
  });

  // Get fulfillment status
  app.get("/api/auctions/:id/fulfillment", requireAuth, async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const auction = await storage.getAuction(auctionId);

      if (!auction) {
        return res.status(404).json({ message: "Auction not found" });
      }

      // Only allow winner or seller to view fulfillment status
      if (req.user!.id !== auction.winningBidderId && req.user!.id !== auction.sellerId) {
        return res.status(403).json({ message: "Unauthorized to view fulfillment status" });
      }

      const fulfillment = await storage.getFulfillment(auctionId);
      res.json(fulfillment || { status: "pending" });
    } catch (error) {
      console.error("Error getting fulfillment status:", error);
      res.status(500).json({ message: "Failed to get fulfillment status" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

const log = (message: string, context: string = 'general') => {
  console.log(`[${context}] ${message}`);
}