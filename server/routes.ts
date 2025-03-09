import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertAuctionSchema, insertBidSchema, insertProfileSchema, insertBuyerRequestSchema, insertFulfillmentSchema } from "@shared/schema";
import { ZodError } from "zod";
import path from "path";
import multer from 'multer';
import { upload, handleFileUpload } from "./uploads";
import { PaymentService } from "./payments";
import Stripe from "stripe";
import { SellerPaymentService } from "./seller-payments";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});
import { EmailService } from "./email-service"; 
import { AuctionService } from "./auction-service";
import { AIPricingService } from "./ai-service";
import type { User, InsertUser } from "@shared/schema"; 
import { db } from "./db";
import { sql } from "drizzle-orm";
import { NotificationService } from "./notification-service";
import passport from 'passport'; //Import passport
import { hashPassword } from './auth';


// Create an Express router instance
const router = express.Router();

// Update the requireProfile middleware
const requireProfile = async (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    console.log("[PROFILE CHECK] User not authenticated");
    return res.status(401).json({ message: "Unauthorized" });
  }

  console.log("[PROFILE CHECK] Checking profile completeness for user:", {
    userId: req.user?.id,
    role: req.user?.role,
    username: req.user?.username
  });

  try {
    const profile = await storage.getProfile(req.user.id);

    if (!profile) {
      console.log("[PROFILE CHECK] No profile found");
      return res.status(403).json({ 
        message: "Please complete your profile before bidding",
        requiredFields: ["fullName", "email", "address", "city", "state", "zipCode"]
      });
    }

    // Check required fields
    const requiredFields = ["fullName", "email", "address", "city", "state", "zipCode"];
    const missingFields = requiredFields.filter(field => !profile[field]);

    if (missingFields.length > 0) {
      console.log("[PROFILE CHECK] Missing required fields:", missingFields);
      return res.status(403).json({
        message: "Please complete your profile before bidding",
        missingFields: missingFields
      });
    }

    console.log("[PROFILE CHECK] Profile verification successful");
    next();
  } catch (error) {
    console.error("[PROFILE CHECK] Error verifying profile:", error);
    res.status(500).json({ message: "Failed to verify profile" });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("[ROUTES] Starting route registration");

  try {
    // Setup authentication first
    console.log("[ROUTES] Setting up authentication");
    setupAuth(app);

    // Serve static files from uploads directory
    const uploadsPath = path.join(process.cwd(), 'uploads');
    app.use('/uploads', express.static(uploadsPath, {
      maxAge: '1d',
      etag: true,
      lastModified: true,
      setHeaders: (res, path) => {
        if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png')) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      }
    }));

    // Basic middleware setup
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    
    // Add Stripe webhook endpoint before the JSON body parser
    app.post("/api/webhooks/stripe", express.raw({ type: 'application/json' }), async (req, res) => {
      const sig = req.headers['stripe-signature'];
      
      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        console.error("[STRIPE WEBHOOK] Missing webhook secret");
        return res.status(400).send("Webhook secret not configured");
      }

      try {
        const event = stripe.webhooks.constructEvent(
          req.body,
          sig as string,
          process.env.STRIPE_WEBHOOK_SECRET
        );

        console.log("[STRIPE WEBHOOK] Received event:", event.type);

        switch (event.type) {
          case 'payment_intent.succeeded':
            await PaymentService.handlePaymentSuccess(event.data.object.id);
            break;
          case 'payment_intent.payment_failed':
            await PaymentService.handlePaymentFailure(event.data.object.id);
            break;
        }

        res.json({ received: true });
      } catch (err) {
        console.error("[STRIPE WEBHOOK] Error:", err);
        res.status(400).send("Webhook Error");
      }
    });

    app.use(router);


    // Add authentication endpoints with enhanced logging and response handling
    router.post("/api/login", (req, res, next) => {
      if (!req.body.username || !req.body.password) {
        console.log("[AUTH] Login failed: Missing credentials");
        return res.status(400).json({ 
          message: "Username and password are required" 
        });
      }

      passport.authenticate("local", (err, user, info) => {
        if (err) {
          console.error("[AUTH] Login error:", err);
          return res.status(500).json({ message: "Authentication failed" });
        }
        if (!user) {
          console.log("[AUTH] Login failed: Invalid credentials");
          return res.status(401).json({ message: info?.message || "Invalid credentials" });
        }
        req.login(user, (loginErr) => {
          if (loginErr) {
            console.error("[AUTH] Session creation error:", loginErr);
            return res.status(500).json({ message: "Failed to create session" });
          }
          console.log("[AUTH] Login successful for user:", {
            id: user.id,
            username: user.username,
            role: user.role
          });
          res.json({
            id: user.id,
            username: user.username,
            role: user.role,
            approved: user.approved,
            hasProfile: user.hasProfile
          });
        });
      })(req, res, next);
    });

    // Logout endpoint with proper session cleanup
    router.post("/api/logout", (req, res) => {
      console.log("[AUTH] Logout attempt", {
        isAuthenticated: req.isAuthenticated(),
        sessionID: req.sessionID
      });
      const wasLoggedIn = req.isAuthenticated();

      req.logout((err) => {
        if (err) {
          console.error("[AUTH] Logout error:", err);
          return res.status(500).json({ message: "Failed to logout" });
        }

        // Destroy the session
        req.session.destroy((sessionErr) => {
          if (sessionErr) {
            console.error("[AUTH] Session destruction error:", sessionErr);
          }

          // Clear the session cookie with the same settings as when it was created
          res.clearCookie('poultry.sid', {
            path: '/',
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production' || process.env.REPL_SLUG !== undefined,
            sameSite: 'lax'
          });

          res.json({ 
            message: wasLoggedIn ? "Logged out successfully" : "No active session",
            success: true
          });

          console.log("[AUTH] Logout completed successfully");
        });
      });
    });

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
    router.get("/api/auctions", async (req, res) => {
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
    router.get("/api/seller/auctions", requireAuth, async (req, res) => {
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
    router.post("/api/auctions", requireAuth, requireApprovedSeller, upload.array('images', 5), async (req, res) => {
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
    router.post("/api/auctions/:id/bid", requireAuth, async (req, res) => {
      try {
        // Set content type header
        res.setHeader('Content-Type', 'application/json');

        if (!req.user) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        // First check if user has a complete profile
        const profile = await storage.getProfile(req.user.id);

        console.log("[BID] Checking profile for user:", {
          userId: req.user.id,
          hasProfile: req.user.hasProfile,
          profileExists: !!profile,
          username: req.user.username
        });

        if (!profile) {
          console.log("[BID] No profile found");
          return res.status(403).json({ 
            error: "profile_incomplete",
            message: "Please complete your profile before bidding",
            missingFields: ["fullName", "email", "address", "city", "state", "zipCode"]
          });
        }

        // Check required profile fields with strict validation
        const requiredFields = ["fullName", "email", "address", "city", "state", "zipCode"];
        const missingFields = requiredFields.filter(field => {
          const value = profile[field];
          return !value || (typeof value === 'string' && value.trim() === '');
        });

        if (missingFields.length > 0) {
          console.log("[BID] Missing required fields:", missingFields);
          return res.status(403).json({
            error: "profile_incomplete",
            message: "Please complete your profile before bidding",
            missingFields: missingFields
          });
        }

        // If profile is complete but hasProfile flag is false, update it
        if (!req.user.hasProfile) {
          await storage.updateUser(req.user.id, { hasProfile: true });
        }

        // Continue with bid placement logic...
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

        let amount = typeof req.body.amount === 'string' 
          ? Math.round(parseFloat(req.body.amount) * 100)
          : req.body.amount;

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

        const bidData = {
          auctionId: auction.id,
          bidderId: req.user.id,
          amount: amount,
        };

        console.log("[BID] Creating bid with data:", bidData);
        const bid = await storage.createBid(bidData);
        console.log("[BID] Bid created successfully:", bid);

        // Return successful bid response
        return res.status(201).json({
          ...bid,
          message: "Bid placed successfully"
        });
      } catch (error) {
        console.error("[BID] Error:", error);
        return res.status(500).json({
          message: "Failed to place bid",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Update the single auction endpoint to include seller profile
    router.get("/api/auctions/:id", async (req, res) => {
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
    router.get("/api/auctions/:id/bids", async (req, res) => {
      try {
        const bids = await storage.getBidsForAuction(parseInt(req.params.id));
        res.json(bids);
      } catch (error) {
        console.error("Error fetching bids:", error);
        res.status(500).json({ message: "Failed to fetch bids" });
      }
    });

    // Add payment endpoint for auction winners
    router.post("/api/auctions/:id/pay", requireAuth, requireProfile, async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);
        const { includeInsurance } = req.body;

        console.log("[PAYMENT] Payment request authentication:", {
          isAuthenticated: req.isAuthenticated(),
          userId: req.user?.id,
          timestamp: new Date().toISOString()
        });

        if (!req.user) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          return res.status(404).json({ message: "Auction not found" });
        }

        if (auction.winningBidderId !== req.user.id) {
          return res.status(403).json({ message: "Only the winning bidder can pay for this auction" });
        }

        const { clientSecret, payment } = await PaymentService.createPaymentIntent(
          auctionId,
          req.user.id,
          includeInsurance
        );

        res.json({ clientSecret, payment });
      } catch (error) {
        console.error("[PAYMENT] Error:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Payment initialization failed"
        });
      }
    });

    // Get admin auctions (including pending)
    router.get("/api/admin/auctions", requireAdmin, async (req, res) => {
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
    router.get("/api/admin/bids", requireAdmin, async (req, res) => {
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
    router.get("/api/user/bids", requireAuth, async (req, res) => {
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
    router.post("/api/profile", requireAuth, async (req, res) => {
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

        // Update user's hasProfile status
        const requiredFields = ["fullName", "email", "address", "city", "state", "zipCode"];
        const hasAllFields = requiredFields.every(field => {
          const value = profile[field];
          return value && typeof value === 'string' && value.trim() !== '';
        });

        if (hasAllFields) {
          await storage.updateUser(req.user.id, { hasProfile: true });
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

    router.get("/api/profile", requireAuth, async (req, res) => {
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
    router.get("/api/admin/auctions", requireAdmin, async (req, res) => {
      try {
        const auctions = await storage.getAuctions({ approved: false });
        res.json(auctions);
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch pending auctions" });
      }
    });

    // Update the auction approval endpoint
    router.post("/api/admin/auctions/:id/approve", requireAdmin, async (req, res) => {
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

    router.post("/api/admin/users/:id/approve", requireAdmin, async (req, res) => {
      try {
        const user = await storage.approveUser(parseInt(req.params.id));
        res.json(user);
      } catch (error) {
        res.status(500).json({ message: "Failed to approve user" });
      }
    });

    // File upload endpoint
    router.post("/api/upload", requireAuth, upload.array('files', 5), (req, res) => {
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
    router.get("/api/admin/users", requireAdmin, async (req, res) => {
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
    router.get("/api/admin/profiles/:userId", requireAdmin, async (req, res) => {
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

    // Add endpoint to get all profiles (for admin use)
    router.get("/api/admin/profiles", requireAdmin, async (req, res) => {
      try {
        console.log("[ADMIN] Fetching all profiles");

        // Get all sellers
        const sellers = await storage.getUsers({ 
          role: "seller"
        });
        const sellerAdmins = await storage.getUsers({ 
          role: "seller_admin" 
        });
        const allSellers = [...sellers, ...sellerAdmins];

        // Get profiles for all sellers
        const profiles = await Promise.all(
          allSellers.map(async (seller) => {
            const profile = await storage.getProfile(seller.id);
            return profile ? {...profile, userId: seller.id} : null;
          })
        );

        // Filter out null profiles
        const validProfiles = profiles.filter(Boolean);

        console.log(`[ADMIN] Found ${validProfiles.length} seller profiles`);
        res.json(validProfiles);
      } catch (error) {
        console.error("[ADMIN] Error fetching profiles:", error);
        res.status(500).json({ message: "Failed to fetch profiles" });
      }
    });

    // Add routes for getting user's bids and auctions
    router.get("/api/admin/users/:userId/bids", requireAdmin, async (req, res) => {
      try {
        const userId = parseInt(req.params.userId);
        const bids = await storage.getBidsByUser(userId);
        res.json(bids);
      } catch (error) {
        console.error("Error fetching user bids:", error);
        res.status(500).json({ message: "Failed to fetch user bids" });
      }
    });

    router.get("/api/admin/sellers/stripe-status", requireAdmin, async (req, res) => {
      try {
        console.log("[ADMIN] Fetching Stripe status for sellers");

        const sellers = await storage.getUsers({ role: "seller" });
        const sellerAdmins = await storage.getUsers({ role: "seller_admin" });
        const allSellers = [...sellers, ...sellerAdmins];

        const statusList = await Promise.all(allSellers.map(async(seller) => {
          const profile = await storage.getProfile(seller.id);
          return {
            sellerId: seller.id,
            username: seller.username,
            hasStripeAccount: !!profile?.stripeAccountId,
            stripeAccountStatus: profile?.stripeAccountStatus,
            status: profile?.stripeAccountStatus || "not_started"
          };
        }));

        console.log(`[ADMIN] Retrieved Stripe status for ${statusList.length} sellers`);
        res.json(statusList);
      } catch (error) {
        console.error("Error fetching seller Stripe statuses:", error);
        res.status(500).json({ message: "Failed to fetch seller Stripe statuses" });
      }
    });

    // Fix the typo in the admin auctions endpoint
    router.get("/api/admin/users/:userId/auctions", requireAdmin, async (req, res) => {
      try {
        const userId = parseInt(req.params.userId);
        const auctions = await storage.getAuctions({ sellerId: userId });        res.json(auctions);
      } catch (error) {
        console.error("Error fetching userauctions:", error);
        res.status(500).json({ message: "Failed to fetch user auctions" });
      }
    });

    // Endpoint for sellers to accept/reject below-reserve bids
    router.post("/api/auctions/:id/seller-decision", requireAuth, requireApprovedSeller, async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);
        const { accept } = req.body;

        if (typeof accept !== 'boolean') {
          return res.status(400).json({ message: "Decision (accept) must be provided as true or false" });
        }

        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          return res.status(404).json({ message: "Auction not found" });
        }

        // Verify the seller owns this auction
        if (!req.user || auction.sellerId !== req.user.id) {
          return res.status(403).json({ message: "You can only make decisions for your own auctions" });
        }

        // Verify auction is in correct state
        if (auction.status !== "pending_seller_decision") {
          return res.status(400).json({ message: "This auction is not pending seller decision" });
        }

        if (accept) {
          // Accept the bid - move to payment pending
          await storage.updateAuction(auctionId, {
            status: "ended",
            paymentStatus: "pending"
          });

          // Notify the winning bidder
          if (auction.winningBidderId) {
            await NotificationService.notifyBuyerBidAccepted(
              auction.winningBidderId,
              auction.title,
              auction.currentPrice
            );
          }
        } else {
          // Reject the bid - void the auction
          await storage.updateAuction(auctionId, {
            status: "voided",
            paymentStatus: "failed"
          });

          // Notify the winning bidder
          if (auction.winningBidderId) {
            await NotificationService.notifyBuyerBidRejected(
              auction.winningBidderId,
              auction.title,
              auction.currentPrice
            );
          }
        }

        res.json({
          message: accept ? "Bid accepted, buyer will be notified to complete payment" : "Auction voided, buyer will be notified",
          auction: await storage.getAuction(auctionId)
        });

      } catch (error) {
        console.error("[AUCTION] Error handling seller decision:", error);
        res.status(500).json({ 
          message: "Failed to process seller decision",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Admin profile management
    router.delete("/api/admin/profiles/:userId", requireAdmin, async (req, res) => {
      try {
        await storage.deleteProfile(parseInt(req.params.userId));
        res.sendStatus(200);
      } catch (error) {
        console.error("Error deleting profile:", error);
        res.status(500).json({ message: "Failed to delete profile" });
      }
    });

    // Admin auction management
    router.delete("/api/admin/auctions/:id", requireAdmin, async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);
        
        if (isNaN(auctionId)) {
          return res.status(400).json({ message: "Invalid auction ID" });
        }
        
        console.log(`[ADMIN] Deleting auction with ID: ${auctionId}`);
        
        // Get auction to check if it exists
        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          console.log(`[ADMIN] Auction ${auctionId} not found for deletion`);
          return res.status(404).json({ message: "Auction not found" });
        }
        
        // Delete associated bids first to avoid foreign key constraints
        await storage.deleteBidsForAuction(auctionId);
        
        // Delete the auction
        await storage.deleteAuction(auctionId);
        
        console.log(`[ADMIN] Successfully deleted auction ${auctionId}`);
        return res.status(200).json({ success: true, message: "Auction deleted successfully" });
      } catch (error) {
        console.error("[ADMIN] Error deleting auction:", error);
        return res.status(500).json({ 
          message: "Failed to delete auction", 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    });

    router.patch("/api/admin/auctions/:id", requireAdmin, async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);
        const data = req.body;

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
        const updateData: any = {        ...data,
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
    router.post("/api/admin/auctions/:id/photos", requireAdmin, upload.array('images', 5), async (req, res) => {
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
    router.delete("/api/admin/auctions/:id/photos/:photoIndex", requireAdmin, async (req, res) => {
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
    router.delete("/api/admin/bids/:id", requireAdmin, async (req, res) => {
      try {
        await storage.deleteBid(parseInt(req.params.id));
        res.sendStatus(200);
      } catch (error) {
        console.error("Error deleting bid:", error);
        res.status(500).json({ message: "Failed to delete bid" });
      }
    });

    // Create buyer request (no auth required)
    router.post("/api/buyer-requests", async (req, res) => {
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

    router.get("/api/buyer-requests", async (req, res) => {
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

    router.get("/api/buyer-requests/:id", async (req, res) => {
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
    router.patch("/api/buyer-requests/:id", requireAdmin, async (req, res) => {
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
    router.delete("/api/buyer-requests/:id", requireAdmin, async (req, res) => {
      try {
        const requestId = parseInt(req.params.id);
        await storage.deleteBuyerRequest(requestId);
        res.sendStatus(200);
      } catch (error) {
        console.error("Error deleting buyer request:", error);
        res.status(500).json({ message: "Failed to delete buyer request" });
      }
    });

    router.post("/api/auctions/:id/pay", requireAuth, requireProfile, async (req, res) => {
      try {
        // Log authentication state
        console.log('[PAYMENT] Payment request authentication:', {
          isAuthenticated: req.isAuthenticated(),
          userId: req.user?.id,
          timestamp: new Date().toISOString()
        });
        
        if (!req.user) {
          console.log('[PAYMENT] Unauthorized payment attempt - no user in session');
          return res.status(401).json({
            message: "Unauthorized - Please log in again",
            code: "AUTH_REQUIRED"
          });
        }
        
        const auctionId = parseInt(req.params.id);
        const { includeInsurance = false } = req.body;
        
        console.log(`[PAYMENT] Creating payment session for auction ${auctionId}, buyer ${req.user.id}, insurance: ${includeInsurance}`);
        
        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          console.log(`[PAYMENT] Auction not found: ${auctionId}`);
          return res.status(404).json({ message: "Auction not found" });
        }
        
        // Verify this user won the auction
        if (auction.winningBidderId !== req.user.id) {
          console.log(`[PAYMENT] Unauthorized payment - user ${req.user.id} is not the winner of auction ${auctionId}`);
          return res.status(403).json({
            message: "Only the winning bidder can pay",
            code: "NOT_WINNER"
          });
        }
        
        // Get the base URL from the request
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        console.log(`[PAYMENT] Using base URL: ${baseUrl}`);
        
        // Create Stripe Checkout session
        const { sessionId, url, payment } = await PaymentService.createCheckoutSession(
          auctionId,
          req.user.id,
          includeInsurance,
          baseUrl
        );
        
        console.log(`[PAYMENT] Successfully created checkout session ${sessionId} with URL: ${url}`);
        
        res.json({ 
          sessionId, 
          url, 
          payment,
          success: true
        });
      } catch (error) {
        console.error("[PAYMENT] Payment creation error:", error);
        let errorMessage = "Failed to create payment session";
        let errorCode = "PAYMENT_CREATION_FAILED";
        
        // Check for specific Stripe errors
        if (error instanceof Error) {
          if (error.message.includes("Stripe account")) {
            errorMessage = "Seller has not completed their payment setup";
            errorCode = "SELLER_SETUP_INCOMPLETE";
          } else if (error.message.includes("API key")) {
            errorMessage = "Payment system configuration error";
            errorCode = "STRIPE_CONFIG_ERROR";
          }
        }
        
        res.status(500).json({
          message: errorMessage,
          details: error instanceof Error ? error.message : "Unknown error",
          code: errorCode
        });
      }
    });

    // Endpoint to retrieve a checkout session URL
    router.get("/api/checkout-session/:sessionId", requireAuth, async (req, res) => {
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
    router.post("/api/webhooks/stripe", async (req, res) => {
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
    router.get("/api/auctions/:id/payment", requireAuth, async (req, res) => {
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
    router.get("/api/notifications", requireAuth, async (req, res) => {
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

    router.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
      try {
        const notification = await storage.markNotificationAsRead(parseInt(req.params.id));
        res.json(notification);
      } catch (error) {
        console.error("Error marking notification as read:", error);
        res.status(500).json({ message: "Failed to mark notification as read" });
      }
    });

    router.post("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
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
    router.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
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
    router.post("/api/admin/sellers/:id/approve", requireAdmin, async (req, res) => {
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
    router.get("/api/sellers/active", async (req, res) => {
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


    router.get("/api/analytics/auction-bids", async (req, res) => {
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

    router.get("/api/analytics/top-performers", async (req, res) => {
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
    const NOTIFICATION_CHECK_INTERVAL = 15 * 60 * 1000; // Check every 15 minutes
    setInterval(async () => {
      try {
        console.log("[NOTIFICATION CHECK] Running scheduled auction notification check at", new Date().toISOString());
        await AuctionService.checkAndNotifyEndingAuctions();
        await AuctionService.checkAndNotifyCompletedAuctions();
      } catch (error) {
        console.error("Error in auction notification check:", error);
      }
    }, NOTIFICATION_CHECK_INTERVAL);

    router.post("/api/ai/price-suggestion", requireAuth, requireApprovedSeller, async (req, res) => {
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

    router.post("/api/ai/description-suggestion", requireAuth, requireApprovedSeller, async (req, res) => {
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
    router.post("/api/seller/connect", requireAuth, async (req, res) => {
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
    router.get("/api/seller/status", requireAuth, async (req, res) => {
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
    router.post("/api/auctions/:id/fulfill", requireAuth, requireApprovedSeller, async (req, res) => {
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
        res.status(500).json({ message: "Failed to fulfill auction" });
      }
    });

    // Add new endpoint for getting seller Stripe status
    router.get("/api/admin/sellers/stripe-status", requireAdmin, async (req, res) => {
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
                status: profile?.stripeAccountStatus || "not_started"
              };
            } catch (error) {
              console.error(`[ADMIN] Error getting Stripe status for seller ${seller.id}:`, error);
              return {
                sellerId: seller.id,
                status: "error"
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
    router.delete("/api/admin/users/:userId", requireAdmin, async (req, res) => {
      try {
        const userId = parseInt(req.params.userId);
        console.log("[ADMIN] Deleting user:", userId);

        // First delete profile if exists
        await storage.deleteProfile(userId);

        // Then delete the user
        await storage.deleteUser(userId);

        console.log("[ADMIN] Successfully deleted user and profile");
        res.json({ message: "User deleted successfully" });
      }catch (error) {
        console.error("[ADMIN] Error deleting user:", error);
        res.status(500).json({ message: "Failed to delete user" });
      }
    });

    // Add seller profile endpoint
    router.get("/api/sellers/:id", async (req, res) => {
      try {
        const sellerId = parseInt(req.params.id);
        console.log(`[SELLER] Fetching seller profile for ID: ${sellerId}`);

        // Get the seller
        const seller = await storage.getUser(sellerId);
        if (!seller) {
          return res.status(404).json({ message: "Seller not found" });
        }

        // Get the seller's profile
        const profile = await storage.getProfile(sellerId);
        if (!profile) {
          return res.status(404).json({ message: "Seller profile not found" });
        }

        // Get seller's active auctions
        const auctions = await storage.getAuctions({ 
          sellerId, 
          status: "active",
          approved: true 
        });

        res.json({
          profile,
          activeAuctions: auctions.length
        });
      } catch (error) {
        console.error("[SELLER] Error fetching seller profile:", error);
        res.status(500).json({ message: "Failed to fetch seller profile" });
      }
    });

    router.get("/api/analytics/market-stats", async (req, res) => {
      try {
        const timeFrame = req.query.timeFrame as string || 'month';
        const category = req.query.category as string;
        const species = req.query.species as string;

        console.log("[ANALYTICS] Starting market stats calculation with params:", {
          timeFrame,
          category,
          species,
          timestamp: new Date().toISOString()
        });

        // Get all auctions based on filters
        const auctions = await storage.getAuctions({
          category: category === 'all' ? undefined : category,
          species: species === 'all' ? undefined : species,
          approved: true
        });

        console.log("[ANALYTICS] Initial auction query results:", {
          totalAuctions: auctions.length,
          categories: [...new Set(auctions.map(a => a.category))],
          species: [...new Set(auctions.map(a => a.species))]
        });

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

        // Include both active and ended auctions that have prices
        const validAuctions = auctions.filter(auction => {
          const auctionEndDate = new Date(auction.endDate);
          const hasValidPrice = auction.currentPrice > 0 || auction.startPrice > 0;
          const isAfterCutoff = auctionEndDate >= cutoffDate;
          const isActive = auctionEndDate >= now;

          // Log invalid auctions for debugging
          if (!hasValidPrice) {
            console.log("[ANALYTICS] Auction excluded - no valid price:", {
              id: auction.id,
              title: auction.title,
              currentPrice: auction.currentPrice,
              startPrice: auction.startPrice
            });
          }

          return hasValidPrice && (isAfterCutoff || isActive);
        });

        console.log("[ANALYTICS] Valid auctions after filtering:", {
          total: validAuctions.length,
          timeRange: {
            start: cutoffDate.toISOString(),
            end: now.toISOString()
          }
        });

        // Sort auctions by date
        const sortedAuctions = validAuctions.sort((a, b) => {
          const dateA = new Date(a.endDate).getTime();
          const dateB = new Date(b.endDate).getTime();
          return dateA - dateB;
        });

        // Create price data points
        const priceData = sortedAuctions.map(auction => {
          const price = auction.currentPrice > 0 ? auction.currentPrice : auction.startPrice;
          const auctionEndDate = new Date(auction.endDate);
          const dateForPoint = auctionEndDate > now ? now : auctionEndDate;

          return {
            date: dateForPoint.toISOString(),
            price: price,
            title: auction.title,
            medianPrice: calculateMovingAverage(sortedAuctions, dateForPoint, price)
          };
        });

        // Calculate market statistics
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

        // Calculate bidder statistics
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

        // Calculate category statistics
        const categoryCount = validAuctions.reduce((acc, auction) => {
          const category = auction.category || "Uncategorized";
          acc[category] = (acc[category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const popularCategories = Object.entries(categoryCount)
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count);

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

        // Construct response object
        const response = {
          activeBidders,
          totalBids,
          priceData,
          activeAuctions,
          species: [...new Set(auctions.map(a => a.species))],
          averagePrices,
          popularCategories,
          topPerformers: {
            seller: null,
            buyer: null
          }
        };

        console.log("[ANALYTICS] Response summary:", {
          dataPoints: priceData.length,
          activeBidders,
          totalBids,
          activeAuctions,
          categoriesCount: popularCategories.length,
          speciesCount: averagePrices.length
        });

        res.json(response);
      } catch (error) {
        console.error("[ANALYTICS] Error processing market stats:", error);
        res.status(500).json({ 
          message: "Failed to fetch market statistics",
          error: error instanceof Error ? error.message : String(error)
        });
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

    // Add active sellers endpoint
    router.get("/api/sellers/active", async (req, res) => {
      try {
        const sellers = await storage.getUsers({ 
          role: "seller",
          approved: true 
        });

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

        // Filter for active sellers
        const activeSellers = sellersWithDetails.filter(
          seller => seller.profile && 
                   seller.auctions.some(auction => 
                     auction.status === "active" && 
                     auction.approved === true
                   )
        );

        res.json(activeSellers);
      } catch (error) {
        console.error("[SELLERS] Error fetching active sellers:", error);
        res.status(500).json({ message: "Failed to fetch active sellers" });
      }
    });

    // Create HTTP server
    console.log("[ROUTES] Creating HTTP server");
    const httpServer = createServer(app);

    // WebSocket setup if needed
    // ... WebSocket setup code

    console.log("[ROUTES] Route registration completed successfully");
    return httpServer;
  } catch (error) {
    console.error("[ROUTES] Error during route registration:", error);
    throw error;
  }
}

// Helper function for consistent logging
const log = (message: string, context: string = 'general') => {
  console.log(`[${context}] ${message}`);
};

router.get("/api/user", (req: Express.Request, res: Express.Response) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  res.json(req.user);
});

// Add a session checker endpoint with enhanced logging
router.get("/api/session/check", (req: Express.Request, res: Express.Response) => {
  console.log("[SESSION] Checking session status:", {
    isAuthenticated: req.isAuthenticated(),
    sessionID: req.sessionID,
    hasCookies: !!req.headers.cookie,
    cookies: req.headers.cookie,
    user: req.user ? {
      id: req.user.id,
      role: req.user.role,
      username: req.user.username
    } : null
  });

  if (req.isAuthenticated()) {
    // Return full user data for authenticated sessions
    res.json({
      authenticated: true,
      user: req.user,
      sessionID: req.sessionID
    });
  } else {
    // Check if there's a session cookie present but not valid
    const hasSessionCookie = req.headers.cookie?.includes('poultry.sid');
    
    res.json({
      authenticated: false,
      message: hasSessionCookie ? 
        "Session cookie present but not authenticated" : 
        "No active session",
      hasCookie: hasSessionCookie
    });
  }
});

// Add registration endpoint to the router (not directly on app)
router.post("/api/register", async (req, res) => {
    try {
      const userData = req.body as InsertUser;
      console.log("[ROUTES] Registration attempt:", userData.username);

      // Validate the user data against the schema
      const validationResult = insertUserSchema.safeParse(userData);
      if (!validationResult.success) {
        console.error("[ROUTES] Registration validation error:", validationResult.error);
        return res.status(400).json({
          message: "Invalid user data",
          errors: validationResult.error.format(),
        });
      }

      // Check if username exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        console.log("[ROUTES] Registration failed: Username exists", userData.username);
        return res.status(400).json({ message: "Username already exists" });
      }

      // Check if email exists
      const existingEmail = await storage.getUserByEmail(userData.email);
      if (existingEmail) {
        console.log("[ROUTES] Registration failed: Email exists", userData.email);
        return res.status(400).json({ message: "Email already in use" });
      }

      // Hash the password
      const hashedPassword = await hashPassword(userData.password);

      // Create the user in the database
      const newUser = await storage.createUser({
        ...userData,
        password: hashedPassword,
        approved: userData.role === "buyer", // Auto-approve buyers
        emailNotificationsEnabled: true
      });

      console.log("[ROUTES] User registered successfully:", newUser.id);
      res.status(201).json({ 
        message: "User registered successfully",
        userId: newUser.id,
        username: newUser.username,
        role: newUser.role 
      });
    } catch (error) {
      console.error("[ROUTES] Registration error:", error);
      res.status(500).json({ 
        message: "Registration failed: " + (error instanceof Error ? error.message : "Unknown error") 
      });
    }
});

// Remove the duplicate login endpoint as it's already defined earlier in the file