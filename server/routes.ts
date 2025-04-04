import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import {
  insertAuctionSchema,
  insertBidSchema,
  insertProfileSchema,
  insertBuyerRequestSchema,
  insertUserSchema,
  insertPasswordResetTokenSchema,
} from "@shared/schema";
import type {
  User,
  InsertUser,
  Profile,
  PasswordResetToken,
} from "@shared/schema";
import { ZodError } from "zod";
import path from "path";
import multer from "multer";
import { upload, handleFileUpload } from "./uploads";
import { PaymentService } from "./payments";
import { buffer } from "micro";
import { SellerPaymentService } from "./seller-payments";
import { EmailService } from "./email-service";
import {
  hashPassword,
  comparePasswords,
  generateToken,
} from "./utils/password";
import { AuctionService } from "./auction-service";
import { AIPricingService } from "./ai-service";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { NotificationService } from "./notification-service";
import { generateToken } from "./utils/password";
import passport from "passport";
import { hashPassword } from "./auth";
import { randomPaypalID } from "./utils/randomPaypalID";

// Create an Express router instance
const router = express.Router();

// Middleware to check if user is authenticated
const requireAuth = (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

// Middleware to check if user is an admin
const requireAdmin = (req: any, res: any, next: any) => {
  if (
    !req.isAuthenticated() ||
    (req.user.role !== "admin" && req.user.role !== "seller_admin")
  ) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
};

// Middleware to check if user has a complete profile
const requireProfile = async (req: any, res: any, next: any) => {
  if (!req.isAuthenticated()) {
    console.log("[PROFILE CHECK] User not authenticated");
    return res.status(401).json({ message: "Unauthorized" });
  }

  console.log("[PROFILE CHECK] Checking profile completeness for user:", {
    userId: req.user?.id,
    role: req.user?.role,
    username: req.user?.username,
  });

  try {
    const profile = await storage.getProfile(req.user.id);

    if (!profile) {
      console.log("[PROFILE CHECK] No profile found");
      return res.status(403).json({
        message: "Please complete your profile before bidding",
        requiredFields: [
          "fullName",
          "email",
          "address",
          "city",
          "state",
          "zipCode",
        ],
      });
    }

    // Check required fields
    const requiredFields = [
      "fullName",
      "email",
      "address",
      "city",
      "state",
      "zipCode",
    ];
    const missingFields = requiredFields.filter((field) => !profile[field]);

    if (missingFields.length > 0) {
      console.log("[PROFILE CHECK] Missing required fields:", missingFields);
      return res.status(403).json({
        message: "Please complete your profile before bidding",
        missingFields: missingFields,
      });
    }

    console.log("[PROFILE CHECK] Profile verification successful");
    next();
  } catch (error) {
    console.error("[PROFILE CHECK] Error verifying profile:", error);
    res.status(500).json({ message: "Failed to verify profile" });
  }
};

// Add profile route with enhanced error logging
router.post("/api/profile", requireAuth, async (req, res) => {
  try {
    console.log("[PROFILE] Received profile update request:", {
      userId: req.user?.id,
      body: { ...req.body, password: undefined }, // Log body without sensitive data
    });

    if (!req.user) {
      console.log("[PROFILE] No authenticated user found");
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Validate the request body
    try {
      const validatedData = insertProfileSchema.parse({
        ...req.body,
        userId: req.user.id,
      });
      console.log("[PROFILE] Data validation passed");

      const result = await storage.createProfile(validatedData);
      console.log("[PROFILE] Profile created/updated successfully:", {
        userId: result.userId,
        email: result.email,
      });

      // Update user's hasProfile flag
      await storage.updateUser(req.user.id, { hasProfile: true });
      console.log("[PROFILE] Updated user hasProfile flag");

      return res.json(result);
    } catch (validationError) {
      console.error("[PROFILE] Validation error:", validationError);
      return res.status(400).json({
        message: "Invalid profile data",
        errors:
          validationError instanceof Error
            ? validationError.message
            : String(validationError),
      });
    }
  } catch (error) {
    console.error("[PROFILE] Server error:", error);
    return res.status(500).json({
      message: "Failed to save profile",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// PayPal webhook handler
router.post("/webhook/paypal", async (req, res) => {
  try {
    const event = req.body;
    console.log("[WEBHOOK] Received PayPal webhook:", {
      eventType: event.event_type,
      resourceId: event.resource?.id,
      timestamp: new Date().toISOString(),
    });

    switch (event.event_type) {
      case "CHECKOUT.ORDER.COMPLETED":
        await PaymentService.handlePaymentSuccess(event.resource.id);
        break;
      case "CHECKOUT.ORDER.FAILED":
        await PaymentService.handlePaymentFailure(event.resource.id);
        break;
      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.event_type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("[WEBHOOK] Error handling webhook:", error);
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

// PayPal seller onboarding route
router.post("/api/seller/connect", requireAuth, async (req, res) => {
  try {
    console.log("[PAYPAL] Starting seller onboarding for user:", req.user?.id);

    const profile = await storage.getProfile(req.user!.id);
    if (!profile) {
      console.log("[PAYPAL] Profile not found for user:", req.user?.id);
      return res.status(404).json({ message: "Profile not found" });
    }

    console.log("[PAYPAL] Creating seller account with profile:", {
      userId: profile.userId,
      email: profile.email,
    });

    const { merchantId, url } =
      await SellerPaymentService.createSellerAccount(profile);

    console.log("[PAYPAL] Seller account created successfully:", {
      merchantId: merchantId.substring(0, 8) + "...",
      urlPrefix: url.substring(0, 30) + "...",
    });

    res.json({ merchantId, url });
  } catch (error) {
    console.error("[PAYPAL] Onboarding error:", error);
    res.status(500).json({
      message: "Failed to start PayPal onboarding",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// PayPal seller account status check
router.get("/api/seller/status", requireAuth, async (req, res) => {
  try {
    console.log("[PAYPAL] Checking seller status for user:", req.user?.id);

    const profile = await storage.getProfile(req.user!.id);
    if (!profile?.paypalMerchantId) {
      console.log("[PAYPAL] No PayPal account found for user:", req.user?.id);
      return res.json({ status: "not_started" });
    }

    const status = await SellerPaymentService.getAccountStatus(
      profile.paypalMerchantId,
    );

    console.log("[PAYPAL] Seller status checked:", {
      userId: req.user?.id,
      merchantId: profile.paypalMerchantId.substring(0, 8) + "...",
      status,
    });

    res.json({ status });
  } catch (error) {
    console.error("[PAYPAL] Status check error:", error);
    res.status(500).json({
      message: "Failed to check PayPal account status",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Payment initiation route with enhanced logging
router.post(
  "/api/auctions/:id/pay",
  requireAuth,
  requireProfile,
  async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const { includeInsurance } = req.body;

      console.log("[PAYMENT] Initiating payment for auction:", {
        auctionId,
        buyerId: req.user?.id,
        includeInsurance,
        timestamp: new Date().toISOString(),
      });

      if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const result = await PaymentService.createCheckoutSession(
        auctionId,
        req.user.id,
        includeInsurance,
      );

      console.log("[PAYMENT] Payment session created:", {
        orderId: result.orderId,
        auctionId,
        status: "pending",
      });

      res.json(result);
    } catch (error) {
      console.error("[PAYMENT] Payment initiation error:", error);

      // Handle specific PayPal API errors
      if (error instanceof Error) {
        if (error.message.includes("INVALID_REQUEST")) {
          return res.status(400).json({
            message:
              "Invalid payment request. Please check your details and try again.",
          });
        }
        if (error.message.includes("PERMISSION_DENIED")) {
          return res.status(403).json({
            message:
              "Payment authorization failed. Please try again or contact support.",
          });
        }
      }

      res.status(500).json({
        message:
          error instanceof Error ? error.message : "Failed to initiate payment",
      });
    }
  },
);

// Add the order approval endpoint near other payment routes
router.post("/api/auctions/:id/approve", requireAuth, async (req, res) => {
  try {
    const auctionId = parseInt(req.params.id);
    console.log(
      `[APPROVAL] Processing order approval for auction ${auctionId}`,
    );

    // Get auction details
    const auction = await storage.getAuction(auctionId);
    if (!auction) {
      return res.status(404).json({ message: "Auction not found" });
    }

    // Verify user is buyer
    if (auction.buyerId !== req.user!.id) {
      return res
        .status(403)
        .json({ message: "Only the buyer can approve the order" });
    }

    // Get payment record
    const payment = await storage.getPaymentByAuctionId(auctionId);
    if (!payment || !payment.paypalOrderId) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    console.log(`[APPROVAL] Found payment record:`, {
      paymentId: payment.id,
      status: payment.status,
      orderId: payment.paypalOrderId,
    });

    // Approve the order with PayPal
    await PaymentService.approveOrder(payment.paypalOrderId);

    // Update auction status
    await storage.updateAuction(auctionId, {
      status: "pending_payment",
      paymentStatus: "pending",
    });

    res.json({ success: true });
  } catch (error) {
    console.error("[APPROVAL] Error approving order:", error);
    res.status(500).json({
      message:
        error instanceof Error ? error.message : "Failed to approve order",
    });
  }
});

// Add confirmation endpoint
router.post("/api/payments/:orderId/confirm", requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log("[PAYPAL] Processing order confirmation:", { orderId });

    await PaymentService.confirmOrder(orderId);

    const payment = await storage.findPaymentByPayPalId(orderId);
    if (payment) {
      await storage.updatePayment(payment.id, {
        status: "completed_pending_shipment",
        completedAt: new Date(),
      });

      // Update auction status
      await storage.updateAuction(payment.auctionId, {
        status: "pending_fulfillment",
        paymentStatus: "completed_pending_shipment",
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[PAYPAL] Confirmation error:", error);
    res.status(500).json({
      message:
        error instanceof Error ? error.message : "Failed to confirm order",
    });
  }
});

// Add authorization endpoint near other payment routes
router.post(
  "/api/payments/:orderId/authorize",
  requireAuth,
  async (req, res) => {
    try {
      const { orderId } = req.params;
      console.log("[PAYPAL] Processing authorization:", { orderId });

      const authResult = await PaymentService.authorizeOrder(orderId);
      res.json({
        success: true,
        authorizationId:
          authResult.purchase_units[0].payments.authorizations[0].id,
      });
    } catch (error) {
      console.error("[PAYPAL] Authorization error:", error);
      res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to authorize payment",
      });
    }
  },
);

// Update capture endpoint to use authorizationId
router.post("/api/payments/capture", requireAuth, async (req, res) => {
  try {
    const { orderId, authorizationId } = req.body;
    console.log("[PAYMENT CAPTURE] Starting payment capture:", {
      orderId,
      authorizationId,
      userId: req.user?.id,
    });

    if (!orderId || !authorizationId) {
      return res
        .status(400)
        .json({ message: "Order ID and Authorization ID are required" });
    }

    await PaymentService.captureAuthorizedPayment(orderId, authorizationId);
    res.json({ success: true });
  } catch (error) {
    console.error("[PAYMENT CAPTURE] Error:", error);

    if (
      error instanceof Error &&
      error.message.includes("INSTRUMENT_DECLINED")
    ) {
      return res.status(400).json({
        message:
          "Payment method was declined. Please try a different payment method.",
        error: "INSTRUMENT_DECLINED",
      });
    }

    if (
      error instanceof Error &&
      error.message.includes("ORDER_NOT_APPROVED")
    ) {
      return res.status(400).json({
        message:
          "Payment not yet approved. Please complete the PayPal checkout first.",
        error: "ORDER_NOT_APPROVED",
      });
    }

    res.status(500).json({
      message:
        error instanceof Error ? error.message : "Failed to capture payment",
    });
  }
});

// Add the client token endpoint near other payment routes
router.get("/api/payments/client-token", requireAuth, async (req, res) => {
  try {
    console.log("[PAYPAL] Generating client token for user:", req.user?.id);
    const clientToken = await PaymentService.generateClientToken();
    res.json({ clientToken });
  } catch (error) {
    console.error("[PAYPAL] Error generating client token:", error);
    res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to generate client token",
    });
  }
});

// Add fulfillment endpoint
router.post("/api/auctions/:id/fulfill", requireAuth, async (req, res) => {
  try {
    const auctionId = parseInt(req.params.id);
    console.log(
      `[FULFILLMENT] Processing fulfillment for auction ${auctionId}`,
    );

    // Get auction details
    const auction = await storage.getAuction(auctionId);
    if (!auction) {
      return res.status(404).json({ message: "Auction not found" });
    }

    // Verify user is seller
    if (
      auction.sellerId !== req.user!.id &&
      req.user!.role !== "seller_admin"
    ) {
      return res
        .status(403)
        .json({ message: "Only the seller can fulfill the auction" });
    }

    // Get payment record
    const payment = await storage.getPaymentByAuctionId(auctionId);
    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    console.log(`[FULFILLMENT] Found payment record:`, {
      paymentId: payment.id,
      status: payment.status,
      auctionId,
      amount: payment.amount,
      sellerPayout: payment.sellerPayout,
    });

    const { trackingInfo } = req.body;
    if (!trackingInfo) {
      return res
        .status(400)
        .json({ message: "Tracking information is required" });
    }

    // Release funds to seller and update statuses
    try {
      await PaymentService.releaseFundsToSeller(payment.id, trackingInfo);
      console.log(`[FULFILLMENT] Successfully processed fulfillment:`, {
        auctionId,
        paymentId: payment.id,
        trackingInfo,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("[FULFILLMENT] PayPal payout error:", error);
      if (
        error instanceof Error &&
        error.message.includes("PayPal validation error")
      ) {
        return res.status(400).json({
          message:
            "Failed to process payout. Please ensure your PayPal account is properly set up and try again.",
        });
      }
      throw error;
    }
  } catch (error) {
    console.error("[FULFILLMENT] Error processing fulfillment:", error);
    res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to process fulfillment",
    });
  }
});

// Middleware to check if user is an approved seller or seller_admin
const requireApprovedSeller = (req: any, res: any, next: any) => {
  try {
    console.log("[SELLER CHECK] Checking seller authorization:", {
      isAuthenticated: req.isAuthenticated(),
      user: req.user
        ? {
            id: req.user.id,
            role: req.user.role,
            approved: req.user.approved,
          }
        : null,
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
      console.log("[SELLER CHECK] User is not a seller", {
        role: req.user.role,
      });
      return res
        .status(403)
        .json({ message: "Only sellers can perform this action" });
    }

    // Check approval for regular sellers
    if (!req.user.approved) {
      console.log("[SELLER CHECK] Seller not approved");
      return res
        .status(403)
        .json({ message: "Only approved sellers can perform this action" });
    }

    console.log("[SELLER CHECK] Access granted to approved seller");
    next();
  } catch (error) {
    console.error("[SELLER CHECK] Error in seller authorization:", error);
    res.status(500).json({ message: "Authorization check failed" });
  }
};

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("[ROUTES] Starting route registration");

  try {
    // Setup authentication first
    console.log("[ROUTES] Setting up authentication");
    setupAuth(app);

    // Serve static files from uploads directory
    const uploadsPath = path.join(process.cwd(), "uploads");
    app.use(
      "/uploads",
      express.static(uploadsPath, {
        maxAge: "1d",
        etag: true,
        lastModified: true,
        dotfiles: "allow",
        setHeaders: (res, path) => {
          // Add CORS headers
          res.setHeader("Access-Control-Allow-Origin", "*");
          // Set caching headers for images
          if (
            path.endsWith(".jpg") ||
            path.endsWith(".jpeg") ||
            path.endsWith(".png")
          ) {
            res.setHeader("Cache-Control", "public, max-age=86400");
          }
        },
      }),
    );

    // Add error handling for static files
    app.use((err: any, req: any, res: any, next: any) => {
      if (err.code === "ENOENT") {
        console.error(`[STATIC] File not found: ${req.url}`);
        res.status(404).json({ message: "File not found" });
      } else {
        console.error(`[STATIC] Error serving file: ${err}`);
        next(err);
      }
    });

    // Basic middleware setup
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(router);

    // Add registration endpoint with validation and error handling
    router.post("/api/register", async (req, res) => {
      try {
        console.log("[AUTH] Registration attempt:", {
          username: req.body.username,
          email: req.body.email,
          role: req.body.role,
        });

        // Validate registration data
        const validatedData = insertUserSchema.parse(req.body);

        // Hash the password
        const hashedPassword = await hashPassword(validatedData.password);

        // Create the user
        const user = await storage.createUser({
          ...validatedData,
          password: hashedPassword,
        });

        console.log("[AUTH] Registration successful:", {
          userId: user.id,
          username: user.username,
          role: user.role,
        });

        // If registering as a seller, notify admins
        if (user.role === "seller") {
          await EmailService.notifyAdminsOfNewSeller(user);
        }

        res.status(201).json({
          id: user.id,
          username: user.username,
          role: user.role,
          approved: user.approved,
          hasProfile: user.hasProfile,
        });
      } catch (error) {
        console.error("[AUTH] Registration error:", error);

        if (error instanceof ZodError) {
          return res.status(400).json({
            message: "Invalid registration data",
            errors: error.errors,
          });
        }

        // Handle unique constraint violations
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "23505"
        ) {
          return res.status(400).json({
            message: "Username or email already exists",
          });
        }

        res.status(500).json({
          message: "Registration failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Add authentication endpoints with enhanced logging and response handling

    // Password reset request route
    router.post("/api/forgot-password", async (req, res) => {
      try {
        const { email } = req.body;

        if (!email) {
          return res.status(400).json({ message: "Email is required" });
        }

        // Find user by email
        const user = await storage.getUserByEmail(email);
        if (!user) {
          // For security reasons, don't reveal if the email exists or not
          return res.status(200).json({
            message:
              "If that email exists in our system, you will receive a password reset link shortly.",
          });
        }

        // Generate reset token
        const resetToken = generateToken(32);
        const expiryHours = 24; // Token valid for 24 hours

        // Store token in database
        await storage.createPasswordResetToken(
          user.id,
          resetToken,
          expiryHours,
        );

        // Send reset email
        const emailSent = await EmailService.sendPasswordResetEmail(
          email,
          resetToken,
          user.username,
        );

        if (!emailSent) {
          console.error("[PASSWORD RESET] Failed to send email to:", email);
          return res
            .status(500)
            .json({
              message: "Failed to send reset email. Please try again later.",
            });
        }

        return res.status(200).json({
          message:
            "If that email exists in our system, you will receive a password reset link shortly.",
        });
      } catch (error) {
        console.error(
          "[PASSWORD RESET] Error processing reset request:",
          error,
        );
        return res
          .status(500)
          .json({ message: "An error occurred. Please try again later." });
      }
    });

    // Verify reset token route
    router.get("/api/reset-password/:token", async (req, res) => {
      try {
        const { token } = req.params;

        if (!token) {
          return res.status(400).json({ message: "Invalid reset token" });
        }

        // Check if token exists and is valid
        const resetToken = await storage.getValidPasswordResetToken(token);

        if (!resetToken) {
          return res
            .status(400)
            .json({ message: "Invalid or expired reset token" });
        }

        return res.status(200).json({
          message: "Token is valid",
          userId: resetToken.userId,
        });
      } catch (error) {
        console.error("[PASSWORD RESET] Error verifying token:", error);
        return res
          .status(500)
          .json({ message: "An error occurred. Please try again later." });
      }
    });

    // Reset password with token route
    router.post("/api/reset-password/:token", async (req, res) => {
      try {
        const { token } = req.params;
        const { newPassword } = req.body;

        if (!token || !newPassword) {
          return res
            .status(400)
            .json({ message: "Token and new password are required" });
        }

        // Validate password strength
        if (newPassword.length < 8) {
          return res
            .status(400)
            .json({ message: "Password must be at least 8 characters long" });
        }

        // Check if token exists and is valid
        const resetToken = await storage.getValidPasswordResetToken(token);

        if (!resetToken) {
          return res
            .status(400)
            .json({ message: "Invalid or expired reset token" });
        }

        // Update user's password
        await storage.updateUserPassword(resetToken.userId, newPassword);

        // Mark token as used
        await storage.markPasswordResetTokenAsUsed(resetToken.id);

        return res
          .status(200)
          .json({ message: "Password has been reset successfully" });
      } catch (error) {
        console.error("[PASSWORD RESET] Error resetting password:", error);
        return res
          .status(500)
          .json({ message: "An error occurred. Please try again later." });
      }
    });

    router.post("/api/login", (req, res, next) => {
      if (!req.body.username || !req.body.password) {
        console.log("[AUTH] Login failed: Missing credentials");
        return res.status(400).json({
          message: "Username and password are required",
        });
      }

      passport.authenticate("local", (err, user, info) => {
        if (err) {
          console.error("[AUTH] Login error:", err);
          return res.status(500).json({ message: "Authentication failed" });
        }
        if (!user) {
          console.log("[AUTH] Login failed: Invalid credentials");
          return res
            .status(401)
            .json({ message: info?.message || "Invalid credentials" });
        }
        req.login(user, (loginErr) => {
          if (loginErr) {
            console.error("[AUTH] Session creation error:", loginErr);
            return res
              .status(500)
              .json({ message: "Failed to create session" });
          }
          console.log("[AUTH] Login successful for user:", {
            id: user.id,
            username: user.username,
            role: user.role,
          });
          res.json({
            id: user.id,
            username: user.username,
            role: user.role,
            approved: user.approved,
            hasProfile: user.hasProfile,
          });
        });
      })(req, res, next);
    });

    // Logout endpoint with proper session cleanup
    router.post("/api/logout", (req, res) => {
      console.log("[AUTH] Logout attempt", {
        isAuthenticated: req.isAuthenticated(),
        sessionID: req.sessionID,
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
          res.clearCookie("poultry.sid", {
            path: "/",
            httpOnly: true,
            secure:
              process.env.PAYPAL_ENV === "production" ||
              process.env.REPL_SLUG !== undefined,
            sameSite: "lax",
          });

          res.json({
            message: wasLoggedIn
              ? "Logged out successfully"
              : "No active session",
            success: true,
          });

          console.log("[AUTH] Logout completed successfully");
        });
      });
    });

    // Update the auctions list endpoint to include view counts
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
            return {
              ...auction,
              sellerProfile,
              views: auction.views || 0, // Ensure views is included
            };
          }),
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
          return res
            .status(403)
            .json({ message: "Only sellers can view their auctions" });
        }

        console.log(`[AUCTIONS] Fetching auctions for seller ${req.user.id}`);
        const auctions = await storage.getAuctions({
          sellerId: req.user.id,
        });

        console.log(`[AUCTIONS] Found ${auctions.length} auctions`);
        res.json(auctions);
      } catch (error) {
        console.error("[AUCTIONS] Error fetching seller auctions:", error);
        res.status(500).json({ message: "Failed to fetch seller auctions" });
      }
    });

    // Create new auction (sellers only)
    router.post(
      "/api/auctions",
      requireAuth,
      requireApprovedSeller,
      upload.array("images", 5),
      async (req, res) => {
        try {
          const auctionData = req.body;
          const userId =
            typeof req.user.id === "string"
              ? parseInt(req.user.id, 10)
              : req.user.id;

          console.log("[AUCTION CREATE] Starting auction creation request:", {
            body: req.body,
            files: req.files ? (req.files as Express.Multer.File[]).length : 0,
            userId: userId,
          });

          // Process uploaded files
          let imageUrls: string[] = [];
          let thumbnailUrls: string[] = [];

          if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            try {
              console.log("[AUCTION CREATE] Processing files:", {
                fileCount: req.files.length,
                firstFile: req.files[0]?.originalname,
              });

              // Process each file individually
              const processedFiles = await Promise.all(
                req.files.map((file) => handleFileUpload(req, file)),
              );

              // Filter out any null results and extract URLs
              const successfulFiles = processedFiles.filter(
                (result) => result !== null,
              );

              if (successfulFiles.length > 0) {
                imageUrls = successfulFiles.map((f) => f.optimized);
                thumbnailUrls = successfulFiles.map((f) => f.thumbnail);

                console.log("[AUCTION CREATE] Image processing complete:", {
                  imageCount: imageUrls.length,
                  thumbnailCount: thumbnailUrls.length,
                  firstImage: imageUrls[0]?.substring(0, 50) + "...",
                });
              } else {
                console.warn(
                  "[AUCTION CREATE] No files were successfully processed",
                );
                return res
                  .status(400)
                  .json({ message: "Failed to process image files" });
              }
            } catch (error) {
              console.error("[AUCTION CREATE] Error processing files:", error);
              return res
                .status(500)
                .json({ message: "Failed to process uploaded files" });
            }
          } else {
            console.log("[AUCTION CREATE] No files uploaded with auction");
          }

          // Process auction data
          const processedData = {
            ...auctionData,
            sellerId: userId,
            startPrice: parseFloat(auctionData.startPrice), // Already in cents from client
            reservePrice: parseFloat(
              auctionData.reservePrice || auctionData.startPrice,
            ),
            startDate: new Date(auctionData.startDate),
            endDate: new Date(auctionData.endDate),
            images: imageUrls,
            imageUrl: imageUrls[0] || "",
            thumbnails: thumbnailUrls,
            thumbnailUrl: thumbnailUrls[0] || "",
          };

          console.log("[AUCTION CREATE] Processed auction data:", {
            title: processedData.title,
            startPrice: `$${(processedData.startPrice / 100).toFixed(2)}`,
            reservePrice: `$${(processedData.reservePrice / 100).toFixed(2)}`,
            startDate: processedData.startDate.toISOString(),
            endDate: processedData.endDate.toISOString(),
            imageCount: processedData.images.length,
          });

          try {
            const validatedData = insertAuctionSchema.parse(processedData);
            console.log("[AUCTION CREATE] Data validation passed");

            const result = await storage.createAuction(validatedData);
            console.log("[AUCTION CREATE] Auction created successfully:", {
              auctionId: result.id,
              title: result.title,
              sellerId: result.sellerId,
            });

            // Notify admins about the new auction
            await EmailService.notifyAdminsOfNewAuction(result.id);

            return res.status(201).json(result);
          } catch (validationError) {
            console.error(
              "[AUCTION CREATE] Validation error:",
              validationError,
            );
            return res.status(400).json({
              message: "Invalid auction data",
              errors:
                validationError instanceof ZodError
                  ? validationError.errors
                  : String(validationError),
            });
          }
        } catch (error) {
          console.error("[AUCTION CREATE] Error:", error);
          return res.status(500).json({
            message: "Failed to create auction",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    // Update auction endpoint
    router.patch(
      "/api/auctions/:id",
      requireAuth,
      requireApprovedSeller,
      upload.array("images", 5),
      async (req, res) => {
        try {
          const auctionId = parseInt(req.params.id);
          console.log("[AUCTION UPDATE] Starting auction update request", {
            auctionId,
            body: req.body,
            files: req.files ? (req.files as Express.Multer.File[]).length : 0,
            userId: req.user?.id,
          });

          // Get existing auction
          const existingAuction = await storage.getAuction(auctionId);
          if (!existingAuction) {
            console.log("[AUCTION UPDATE] Auction not found:", auctionId);
            return res.status(404).json({ message: "Auction not found" });
          }

          // Verify ownership
          if (
            existingAuction.sellerId !== req.user!.id &&
            req.user!.role !== "seller_admin"
          ) {
            console.log("[AUCTION UPDATE] Unauthorized update attempt", {
              auctionSellerId: existingAuction.sellerId,
              requestUserId: req.user!.id,
            });
            return res
              .status(403)
              .json({ message: "You can only edit your own auctions" });
          }

          // Process uploaded files
          let newImageUrls: string[] = [];
          let newThumbnailUrls: string[] = [];
          if (req.files && (req.files as Express.Multer.File[]).length > 0) {
            try {
              const uploadResult = await handleFileUpload(req, "auction");
              if (uploadResult && uploadResult.files) {
                newImageUrls = uploadResult.files.map((file) => file.optimized);
                newThumbnailUrls = uploadResult.files.map(
                  (file) => file.thumbnail,
                );
                console.log("[AUCTION UPDATE] Processed image URLs:", {
                  images: newImageUrls,
                  thumbnails: newThumbnailUrls,
                });
              }
            } catch (error) {
              console.error("[AUCTION UPDATE] Error processing files:", error);
              return res
                .status(500)
                .json({ message: "Failed to process uploaded files" });
            }
          }

          // Process update data
          const updateData = {
            ...req.body,
            startPrice: req.body.startPrice
              ? Number(req.body.startPrice)
              : undefined,
            reservePrice: req.body.reservePrice
              ? Number(req.body.reservePrice)
              : undefined,
            startDate: req.body.startDate
              ? new Date(req.body.startDate)
              : undefined,
            endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
            images: newImageUrls.length > 0 ? newImageUrls : undefined,
            imageUrl: newImageUrls.length > 0 ? newImageUrls[0] : undefined,
            thumbnails:
              newThumbnailUrls.length > 0 ? newThumbnailUrls : undefined,
            thumbnailUrl:
              newThumbnailUrls.length > 0 ? newThumbnailUrls[0] : undefined,
          };

          console.log("[AUCTION UPDATE] Processed update data:", updateData);

          // Update the auction
          const updatedAuction = await storage.updateAuction(
            auctionId,
            updateData,
          );
          console.log("[AUCTION UPDATE] Auction updated successfully:", {
            auctionId: updatedAuction.id,
            title: updatedAuction.title,
          });

          res.json(updatedAuction);
        } catch (error) {
          console.error("[AUCTION UPDATE] Error:", error);
          res.status(500).json({
            message: "Failed to update auction",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    // Update auction approval status
    router.patch(
      "/api/admin/auctions/:id/status",
      requireAuth,
      requireAdmin,
      async (req, res) => {
        try {
          const auctionId = parseInt(req.params.id);
          const { approved, reason } = req.body;

          console.log("[ADMIN] Updating auction status:", {
            auctionId,
            approved,
            reason: reason || "No reason provided",
            adminUser: req.user?.id,
          });

          // Get the auction details
          const auction = await storage.getAuction(auctionId);
          if (!auction) {
            console.log("[ADMIN] Auction not found:", auctionId);
            return res.status(404).json({ message: "Auction not found" });
          }

          // Get the seller details
          const seller = await storage.getUser(auction.sellerId);
          if (!seller) {
            console.log(
              "[ADMIN] Seller not found for auction:",
              auction.sellerId,
            );
            return res.status(404).json({ message: "Seller not found" });
          }

          console.log("[ADMIN] Found seller:", {
            sellerId: seller.id,
            email: seller.email,
            notifications: seller.emailNotificationsEnabled,
          });

          // Update the auction status
          const updatedAuction = await storage.updateAuction(auctionId, {
            approved,
            status: approved ? "active" : "rejected",
          });

          // Send email notification based on approval status
          if (approved) {
            console.log("[ADMIN] Sending approval notification to seller");
            try {
              await EmailService.sendNotification("auction_approval", seller, {
                auctionTitle: auction.title,
                startDate: auction.startDate,
                imageUrl: auction.imageUrl,
                auctionId: auction.id,
              });
              console.log("[ADMIN] Approval email sent successfully");

              // Create in-app notification for approval
              await NotificationService.createNotification({
                userId: seller.id,
                type: "auction",
                title: "Auction Approved",
                message: `Your auction "${auction.title}" has been approved and is now live!`,
                linkUrl: `/auctions/${auction.id}`,
                status: "unread",
              });
              console.log("[ADMIN] Approval notification created");
            } catch (notifyError) {
              console.error(
                "[ADMIN] Error sending approval notifications:",
                notifyError,
              );
            }
          } else {
            console.log("[ADMIN] Sending denial notification to seller");
            try {
              await EmailService.sendNotification("auction_denial", seller, {
                auctionTitle: auction.title,
                reason: reason || "No specific reason provided",
                auctionId: auction.id,
              });
              console.log("[ADMIN] Denial email sent successfully");

              // Create in-app notification for denial
              await NotificationService.createNotification({
                userId: seller.id,
                type: "auction",
                title: "Auction Update Required",
                message: `Your auction "${auction.title}" requires updates before it can be approved.`,
                linkUrl: `/seller/auctions/${auction.id}/edit`,
                status: "unread",
              });
              console.log("[ADMIN] Denial notification created");
            } catch (notifyError) {
              console.error(
                "[ADMIN] Error sending denial notifications:",
                notifyError,
              );
            }
          }

          console.log("[ADMIN] Auction status updated successfully:", {
            auctionId,
            status: approved ? "approved" : "rejected",
            notificationSent: true,
          });

          res.json(updatedAuction);
        } catch (error) {
          console.error("[ADMIN] Error updating auction status:", error);
          res.status(500).json({
            message: "Failed to update auction status",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    // Place bid on auction (anyone can bid except the seller of the auction)
    router.post("/api/auctions/:id/bid", requireAuth, async (req, res) => {
      try {
        // Set content type header
        res.setHeader("Content-Type", "application/json");

        if (!req.user) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        // First check if user has a complete profile
        const profile = await storage.getProfile(req.user.id);

        console.log("[BID] Checking profile for user:", {
          userId: req.user.id,
          hasProfile: req.user.hasProfile,
          profileExists: !!profile,
          username: req.user.username,
        });

        if (!profile) {
          console.log("[BID] No profile found");
          return res.status(403).json({
            error: "profile_incomplete",
            message: "Please complete your profile before bidding",
            missingFields: [
              "fullName",
              "email",
              "address",
              "city",
              "state",
              "zipCode",
            ],
          });
        }

        // Check required profile fields with strict validation
        const requiredFields = [
          "fullName",
          "email",
          "address",
          "city",
          "state",
          "zipCode",
        ];
        const missingFields = requiredFields.filter((field) => {
          const value = profile[field];
          return !value || (typeof value === "string" && value.trim() === "");
        });

        if (missingFields.length > 0) {
          console.log("[BID] Missing required fields:", missingFields);
          return res.status(403).json({
            error: "profile_incomplete",
            message: "Please complete your profile before bidding",
            missingFields: missingFields,
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
          return res
            .status(403)
            .json({ message: "You cannot bid on your own auction" });
        }

        let amount =
          typeof req.body.amount === "string"
            ? Math.round(parseFloat(req.body.amount) * 100)
            : req.body.amount;

        if (isNaN(amount)) {
          return res
            .status(400)
            .json({ message: "Bid amount must be a valid number" });
        }

        if (amount <= auction.currentPrice) {
          return res.status(400).json({
            message: `Bid must be higher than current price of $${(auction.currentPrice / 100).toFixed(2)}`,
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
          message: "Bid placed successfully",
        });
      } catch (error) {
        console.error("[BID] Error:", error);
        return res.status(500).json({
          message: "Failed to place bid",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Update the single auction endpoint to include view tracking
    router.get("/api/auctions/:id", async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);

        // Check if user has already viewed this auction in their session
        const viewedAuctions = req.session.viewedAuctions || {};
        const hasViewed = viewedAuctions[auctionId];

        if (!hasViewed) {
          // Increment views counter atomically using SQL
          await db.execute(
            sql`UPDATE auctions SET views = views + 1 WHERE id = ${auctionId}`,
          );

          // Mark auction as viewed in session
          viewedAuctions[auctionId] = true;
          req.session.viewedAuctions = viewedAuctions;

          console.log(
            `[VIEWS] Incremented view count for auction ${auctionId}`,
          );
        }

        const auction = await storage.getAuction(auctionId);
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

    // Get bids with bidder information for an auction
    router.get("/api/auctions/:id/bids", async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);
        console.log(`[BIDS] Fetching bids for auction ${auctionId}`);

        const bids = await storage.getBidsForAuction(auctionId);

        // Get bidder profiles for each bid
        const bidsWithProfiles = await Promise.all(
          bids.map(async (bid) => {
            const bidderProfile = await storage.getProfile(bid.bidderId);
            return {
              ...bid,
              bidderProfile: bidderProfile
                ? {
                    fullName: bidderProfile.fullName,
                    email: bidderProfile.email,
                    city: bidderProfile.city,
                    state: bidderProfile.state,
                  }
                : null,
            };
          }),
        );

        console.log(
          `[BIDS] Found ${bids.length} bids for auction ${auctionId}`,
        );
        res.json(bidsWithProfiles);
      } catch (error) {
        console.error("[BIDS] Error fetching bids:", error);
        res.status(500).json({ message: "Failed to fetch bids" });
      }
    });

    // Add endpoint to get tracking info for buyers
    router.get("/api/auctions/:id/tracking", requireAuth, async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);
        console.log(
          `[TRACKING] Retrieving tracking info for auction ${auctionId}`,
        );

        // Get auction details
        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          return res.status(404).json({ message: "Auction not found" });
        }

        // Verify user is the buyer
        if (
          auction.winningBidderId !== req.user!.id &&
          req.user!.role !== "seller_admin"
        ) {
          return res
            .status(403)
            .json({ message: "Only the buyer can view tracking information" });
        }

        // Get payment record with tracking info
        const payment = await storage.getPaymentByAuctionId(auctionId);
        if (!payment) {
          return res.status(404).json({ message: "Payment record not found" });
        }

        console.log(`[TRACKING] Found tracking info:`, {
          auctionId,
          paymentId: payment.id,
          hasTracking: !!payment.trackingInfo,
        });

        res.json({
          trackingInfo: payment.trackingInfo || null,
          status: payment.status,
          updatedAt: payment.updatedAt,
        });
      } catch (error) {
        console.error("[TRACKING] Error retrieving tracking info:", error);
        res
          .status(500)
          .json({ message: "Failed to retrieve tracking information" });
      }
    });

    // Endpoint for admins to trigger test emails
    router.post("/api/admin/test-emails", requireAdmin, async (req, res) => {
      try {
        const testEmail = "pipsnchicks@gmail.com";
        console.log("[TEST] Sending test emails to:", testEmail);

        await EmailService.sendTestEmails(testEmail);

        res.json({
          success: true,
          message: "Test emails sent successfully",
        });
      } catch (error) {
        console.error("[TEST] Error sending test emails:", error);
        res.status(500).json({
          message: "Failed to send test emails",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Admin routes for auction management
    router.get("/api/admin/auctions", requireAdmin, async (req, res) => {
      try {
        const status = req.query.status as string | undefined;
        const approved =
          req.query.approved === "true"
            ? true
            : req.query.approved === "false"
              ? false
              : undefined;

        console.log(
          `[ADMIN] Fetching auctions with status: ${status}, approved: ${approved}`,
        );

        const auctions = await storage.getAuctions({
          status,
          approved,
        });

        // Get seller profiles for each auction
        const auctionsWithSellerProfiles = await Promise.all(
          auctions.map(async (auction) => {
            const sellerProfile = await storage.getProfile(auction.sellerId);
            return { ...auction, sellerProfile };
          }),
        );

        console.log(`[ADMIN] Found ${auctions.length} auctions`);
        res.json(auctionsWithSellerProfiles);
      } catch (error) {
        console.error("[ADMIN] Error fetching auctions:", error);
        res.status(500).json({ message: "Failed to fetch auctions" });
      }
    });

    // Get detailed auction information for admins including all bids
    router.get("/api/admin/auctions/:id", requireAdmin, async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);
        console.log(`[ADMIN] Fetching detailed auction info ${auctionId}`);

        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          return res.status(404).json({ message: "Auction not found" });
        }

        // Get payment information
        const payment = await storage.getPaymentByAuctionId(auctionId);

        // Get seller profile
        const sellerProfile = await storage.getProfile(auction.sellerId);

        // Get all bids with complete bidder information
        const bids = await storage.getBidsForAuction(auctionId);
        const bidsWithProfiles = await Promise.all(
          bids.map(async (bid) => {
            const bidderProfile = await storage.getProfile(bid.bidderId);
            return {
              ...bid,
              bidderProfile: bidderProfile
                ? {
                    id: bidderProfile.userId,
                    fullName: bidderProfile.fullName,
                    email: bidderProfile.email,
                    phoneNumber: bidderProfile.phoneNumber,
                    address: bidderProfile.address,
                    city: bidderProfile.city,
                    state: bidderProfile.state,
                    zipCode: bidderProfile.zipCode,
                  }
                : null,
              timestamp: bid.timestamp,
              amount: bid.amount,
            };
          }),
        );

        // Sort bids by timestamp descending (most recent first)
        bidsWithProfiles.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        const detailedAuction = {
          auction: {
            ...auction,
            sellerProfile,
          },
          payment: payment
            ? {
                status: payment.status,
                amount: payment.amount,
                createdAt: payment.createdAt,
                completedAt: payment.completedAt,
                trackingInfo: payment.trackingInfo,
              }
            : null,
          bids: bidsWithProfiles,
        };

        console.log(
          `[ADMIN] Retrieved detailed auction info with ${bidsWithProfiles.length} bids`,
        );
        res.json(detailedAuction);
      } catch (error) {
        console.error("[ADMIN] Error fetching auction details:", error);
        res.status(500).json({ message: "Failed to fetch auction details" });
      }
    });

    // Get detailed bid history for an auction (admin only)
    router.get(
      "/api/admin/auctions/:id/bids",
      requireAdmin,
      async (req, res) => {
        try {
          const auctionId = parseInt(req.params.id);
          console.log(`[ADMIN] Fetching bid history for auction ${auctionId}`);

          const auction = await storage.getAuction(auctionId);
          if (!auction) {
            return res.status(404).json({ message: "Auction not found" });
          }

          // Get all bids for the auction with full bidder profiles
          const bids = await storage.getBidsForAuction(auctionId);
          const bidsWithProfiles = await Promise.all(
            bids.map(async (bid) => {
              const bidderProfile = await storage.getProfile(bid.bidderId);
              return {
                ...bid,
                bidderProfile: bidderProfile
                  ? {
                      fullName: bidderProfile.fullName,
                      email: bidderProfile.email,
                      city: bidderProfile.city,
                      state: bidderProfile.state,
                    }
                  : null,
              };
            }),
          );

          console.log(
            `[ADMIN] Found ${bids.length} bids for auction ${auctionId}`,
          );
          res.json(bidsWithProfiles);
        } catch (error) {
          console.error("[ADMIN] Error fetching bid history:", error);
          res.status(500).json({ message: "Failed to fetch bid history" });
        }
      },
    );

    // Delete an auction (admin only)
    router.delete("/api/admin/auctions/:id", requireAdmin, async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);
        if (isNaN(auctionId)) {
          console.log(`[ADMIN] Invalid auction ID provided: ${req.params.id}`);
          return res.status(400).json({ message: "Invalid auction ID" });
        }

        console.log(`[ADMIN] Attempting to delete auction ${auctionId}`);

        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          console.log(`[ADMIN] Auction ${auctionId} not found`);
          return res.status(404).json({ message: "Auction not found" });
        }

        // Delete the auction and all related data
        await storage.deleteAuction(auctionId);

        console.log(`[ADMIN] Successfully deleted auction ${auctionId}`);
        return res.json({
          success: true,
          message: "Auction deleted successfully",
        });
      } catch (error) {
        console.error("[ADMIN] Error deleting auction:", error);
        return res.status(500).json({
          message: "Failed to delete auction",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Get detailed auction status including payment info
    router.get("/api/auctions/:id/status", async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);

        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          return res.status(404).json({ message: "Auction not found" });
        }

        // Get payment information
        const payment = await storage.getPaymentByAuctionId(auctionId);

        // Get seller profile
        const sellerProfile = await storage.getProfile(auction.sellerId);

        // Get winning bidder profile if exists
        let winningBidderProfile = null;
        if (auction.winningBidderId) {
          winningBidderProfile = await storage.getProfile(
            auction.winningBidderId,
          );
        }

        // Get all bids with bidder information
        const bids = await storage.getBidsForAuction(auctionId);
        const bidsWithProfiles = await Promise.all(
          bids.map(async (bid) => {
            const bidderProfile = await storage.getProfile(bid.bidderId);
            return {
              ...bid,
              bidderProfile: bidderProfile
                ? {
                    fullName: bidderProfile.fullName,
                    email: bidderProfile.email,
                    city: bidderProfile.city,
                    state: bidderProfile.state,
                  }
                : null,
            };
          }),
        );

        const detailedStatus = {
          auction: {
            ...auction,
            sellerProfile,
          },
          payment: payment
            ? {
                status: payment.status,
                amount: payment.amount,
                createdAt: payment.createdAt,
                completedAt: payment.completedAt,
                trackingInfo: payment.trackingInfo,
              }
            : null,
          winner: winningBidderProfile
            ? {
                id: winningBidderProfile.userId,
                fullName: winningBidderProfile.fullName,
                email: winningBidderProfile.email,
                city: winningBidderProfile.city,
                state: winningBidderProfile.state,
              }
            : null,
          bids: bidsWithProfiles,
        };

        res.json(detailedStatus);
      } catch (error) {
        console.error("Error fetching auction status:", error);
        res.status(500).json({ message: "Failed to fetch auction status" });
      }
    });

    // Add this new endpoint for admin bid management
    router.get("/api/admin/bids", requireAdmin, async (req, res) => {
      try {
        const auctionId = req.query.auctionId
          ? parseInt(req.query.auctionId as string)
          : undefined;

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
                email: bidderProfile?.email,
              },
            };
          }),
        );

        console.log(
          `[ADMIN BIDS] Retrieved ${bidsWithBidders.length} bids with bidder details for auction ${auctionId}`,
        );
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
          bids.map((bid) => storage.getAuction(bid.auctionId)),
        );

        // Filter out any undefined auctions and combine with bid data
        const bidsWithAuctions = bids
          .map((bid) => {
            const auction = auctions.find((a) => a?.id === bid.auctionId);
            const isWinningBid = auction?.winningBidderId === req.user!.id;
            return auction
              ? {
                  ...bid,
                  auction,
                  isWinningBid,
                  requiresPayment:
                    isWinningBid && auction.paymentStatus === "pending",
                }
              : null;
          })
          .filter(Boolean);

        res.json(bidsWithAuctions);
      } catch (error) {
        console.error("Error fetching user bids:", error);
        res.status(500).json({ message: "Failed to fetch user bids" });
      }
    });

    // Get winner details for an auction
    router.get("/api/auctions/:id/winner", requireAuth, async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);
        console.log(
          `[WINNER] Fetching winner details for auction ${auctionId}`,
        );

        // Get auction details
        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          return res.status(404).json({ message: "Auction not found" });
        }

        // Check if user is the seller
        if (
          auction.sellerId !== req.user!.id &&
          req.user!.role !== "seller_admin"
        ) {
          console.log(
            `[WINNER] Unauthorized access attempt by user ${req.user!.id}`,
          );
          return res
            .status(403)
            .json({ message: "Only the seller can view winner details" });
        }

        // Check if auction has a winner
        if (!auction.winningBidderId) {
          console.log(`[WINNER] No winner found for auction ${auctionId}`);
          return res
            .status(404)
            .json({ message: "No winning bidder for this auction" });
        }

        // Get winner's profile
        const profile = await storage.getProfile(auction.winningBidderId);
        if (!profile) {
          console.log(
            `[WINNER] Winner profile not found for user ${auction.winningBidderId}`,
          );
          return res.status(404).json({ message: "Winner profile not found" });
        }

        // Get payment status from the payments table directly
        const payment = await storage.getPaymentByAuctionId(auctionId);

        console.log(`[WINNER] Found winner details and payment info:`, {
          auctionId,
          paymentId: payment?.id,
          paymentStatus: payment?.status,
          winningBidderId: auction.winningBidderId,
        });

        res.json({
          auction: {
            id: auction.id,
            title: auction.title,
            currentPrice: auction.currentPrice,
            status: auction.status,
            paymentStatus: payment?.status || "pending",
          },
          profile: {
            fullName: profile.fullName,
            email: profile.email,
            phoneNumber: profile.phoneNumber,
            address: profile.address,
            city: profile.city,
            state: profile.state,
            zipCode: profile.zipCode,
          },
        });
      } catch (error) {
        console.error("[WINNER] Error getting winner details:", error);
        res.status(500).json({ message: "Failed to get winner details" });
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
        const requiredFields = [
          "fullName",
          "email",
          "address",
          "city",
          "state",
          "zipCode",
        ];
        const hasAllFields = requiredFields.every((field) => {
          const value = profile[field];
          return value && typeof value === "string" && value.trim() !== "";
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
    // Admin routes for auction management
    router.get("/api/admin/auctions", requireAdmin, async (req, res) => {
      try {
        const status = req.query.status as string | undefined;
        const approved =
          req.query.approved === "true"
            ? true
            : req.query.approved === "false"
              ? false
              : undefined;

        console.log(
          `[ADMIN] Fetching auctions with status: ${status}, approved: ${approved}`,
        );

        const auctions = await storage.getAuctions({
          status,
          approved,
        });

        // Get seller profiles for each auction
        const auctionsWithSellerProfiles = await Promise.all(
          auctions.map(async (auction) => {
            const sellerProfile = await storage.getProfile(auction.sellerId);
            return { ...auction, sellerProfile };
          }),
        );

        console.log(`[ADMIN] Found ${auctions.length} auctions`);
        res.json(auctionsWithSellerProfiles);
      } catch (error) {
        console.error("[ADMIN] Error fetching auctions:", error);
        res.status(500).json({ message: "Failed to fetch auctions" });
      }
    });

    // Get detailed auction information for admins including all bids
    router.get("/api/admin/auctions/:id", requireAdmin, async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);
        console.log(`[ADMIN] Fetching detailed auction info ${auctionId}`);

        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          return res.status(404).json({ message: "Auction not found" });
        }

        // Get payment information
        const payment = await storage.getPaymentByAuctionId(auctionId);

        // Get seller profile
        const sellerProfile = await storage.getProfile(auction.sellerId);

        // Get all bids with complete bidder information
        const bids = await storage.getBidsForAuction(auctionId);
        const bidsWithProfiles = await Promise.all(
          bids.map(async (bid) => {
            const bidderProfile = await storage.getProfile(bid.bidderId);
            return {
              ...bid,
              bidderProfile: bidderProfile
                ? {
                    id: bidderProfile.userId,
                    fullName: bidderProfile.fullName,
                    email: bidderProfile.email,
                    phoneNumber: bidderProfile.phoneNumber,
                    address: bidderProfile.address,
                    city: bidderProfile.city,
                    state: bidderProfile.state,
                    zipCode: bidderProfile.zipCode,
                  }
                : null,
              timestamp: bid.timestamp,
              amount: bid.amount,
            };
          }),
        );

        // Sort bids by timestamp descending (most recent first)
        bidsWithProfiles.sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );

        const detailedAuction = {
          auction: {
            ...auction,
            sellerProfile,
          },
          payment: payment
            ? {
                status: payment.status,
                amount: payment.amount,
                createdAt: payment.createdAt,
                completedAt: payment.completedAt,
                trackingInfo: payment.trackingInfo,
              }
            : null,
          bids: bidsWithProfiles,
        };

        console.log(
          `[ADMIN] Retrieved detailed auction info with ${bidsWithProfiles.length} bids`,
        );
        res.json(detailedAuction);
      } catch (error) {
        console.error("[ADMIN] Error fetching auction details:", error);
        res.status(500).json({ message: "Failed to fetch auction details" });
      }
    });

    // Get detailed bid history for an auction
    router.get(
      "/api/admin/auctions/:id/bids",
      requireAdmin,
      async (req, res) => {
        try {
          const auctionId = parseInt(req.params.id);
          console.log(`[ADMIN] Fetching bid history for auction ${auctionId}`);

          const auction = await storage.getAuction(auctionId);
          if (!auction) {
            return res.status(404).json({ message: "Auction not found" });
          }

          // Get all bids for the auction
          const bids = await storage.getBidsForAuction(auctionId);

          // Get bidder profiles for each bid
          const bidsWithProfiles = await Promise.all(
            bids.map(async (bid) => {
              const bidderProfile = await storage.getProfile(bid.bidderId);
              return {
                ...bid,
                bidderProfile,
              };
            }),
          );

          console.log(
            `[ADMIN] Found ${bids.length} bids for auction ${auctionId}`,
          );
          res.json(bidsWithProfiles);
        } catch (error) {
          console.error("[ADMIN] Error fetching bid history:", error);
          res.status(500).json({ message: "Failed to fetch bid history" });
        }
      },
    );

    // Delete an auction and its associated bids
    router.delete("/api/admin/auctions/:id", requireAdmin, async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);
        console.log(`[ADMIN] Attempting to delete auction ${auctionId}`);

        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          return res.status(404).json({ message: "Auction not found" });
        }

        // First delete all bids associated with the auction
        await storage.deleteBidsForAuction(auctionId);

        // Then delete the auction itself
        await storage.deleteAuction(auctionId);

        console.log(`[ADMIN] Successfully deleted auction ${auctionId}`);
        res.json({ message: "Auction deleted successfully" });
      } catch (error) {
        console.error("[ADMIN] Error deleting auction:", error);
        res.status(500).json({ message: "Failed to delete auction" });
      }
    });

    // Get detailed auction status including payments and winner info
    router.get(
      "/api/admin/auctions/:id/status",
      requireAdmin,
      async (req, res) => {
        try {
          const auctionId = parseInt(req.params.id);
          console.log(
            `[ADMIN] Fetching detailed status for auction ${auctionId}`,
          );

          const auction = await storage.getAuction(auctionId);
          if (!auction) {
            return res.status(404).json({ message: "Auction not found" });
          }

          // Get associated payment information
          const payment = await storage.getPaymentByAuctionId(auctionId);

          // Get seller profile
          const sellerProfile = await storage.getProfile(auction.sellerId);

          // Get winning bidder profile if exists
          let winningBidderProfile = null;
          if (auction.winningBidderId) {
            winningBidderProfile = await storage.getProfile(
              auction.winningBidderId,
            );
          }

          const detailedStatus = {
            auction: {
              ...auction,
              sellerProfile,
            },
            payment: payment
              ? {
                  status: payment.status,
                  amount: payment.amount,
                  createdAt: payment.createdAt,
                  completedAt: payment.completedAt,
                  trackingInfo: payment.trackingInfo,
                }
              : null,
            winner: winningBidderProfile
              ? {
                  id: winningBidderProfile.userId,
                  fullName: winningBidderProfile.fullName,
                  email: winningBidderProfile.email,
                }
              : null,
          };

          console.log(
            `[ADMIN] Retrieved detailed status for auction ${auctionId}`,
          );
          res.json(detailedStatus);
        } catch (error) {
          console.error("[ADMIN] Error fetching auction status:", error);
          res.status(500).json({ message: "Failed to fetch auction status" });
        }
      },
    );

    // Add fulfillment endpoint
    router.post("/api/auctions/:id/fulfill", requireAuth, async (req, res) => {
      try {
        const auctionId = parseInt(req.params.id);

        // Log full request body for debugging
        console.log(
          `[FULFILLMENT] Processing fulfillment for auction ${auctionId}, raw body:`,
          req.body,
        );

        // Get carrier and tracking number with better fallbacks
        let carrier, trackingNumber, notes;

        if (
          req.body.trackingInfo &&
          typeof req.body.trackingInfo === "string" &&
          req.body.trackingInfo.includes(":")
        ) {
          // Format: "USPS: 1234567890"
          const parts = req.body.trackingInfo.split(":");
          carrier = parts[0]?.trim();
          trackingNumber = parts[1]?.trim();
        } else {
          // Direct fields
          carrier = req.body.carrier || req.body.shippingCarrier;
          trackingNumber = req.body.trackingNumber || req.body.tracking;
        }

        notes = req.body.notes || req.body.additionalNotes || "";

        console.log(`[FULFILLMENT] Extracted shipping data:`, {
          carrier,
          trackingNumber,
          notes,
        });

        // Validate input
        if (!carrier || !trackingNumber) {
          return res.status(400).json({
            message: "Carrier and tracking number are required",
            receivedData: req.body,
          });
        }

        // Get auction
        const auction = await storage.getAuction(auctionId);
        if (!auction) {
          return res.status(404).json({ message: "Auction not found" });
        }

        // Verify seller
        if (
          auction.sellerId !== req.user!.id &&
          req.user!.role !== "seller_admin"
        ) {
          return res.status(403).json({
            message: "Only the seller can submit fulfillment details",
          });
        }

        // Find the payment for this auction
        const payment = await storage.getPaymentByAuctionId(auctionId);
        if (!payment) {
          return res
            .status(404)
            .json({ message: "Payment record not found for this auction" });
        }

        console.log(`[FULFILLMENT] Found payment record:`, {
          paymentId: payment.id,
          status: payment.status,
        });

        try {
          // Create fulfillment record
          const fulfillment = await storage.createFulfillment({
            auctionId,
            sellerId: auction.sellerId,
            buyerId: auction.winningBidderId!,
            shippingCarrier: carrier,
            trackingNumber,
            additionalNotes: notes,
            status: "shipped",
            shippingDate: new Date(),
          });

          console.log(`[FULFILLMENT] Created fulfillment record:`, fulfillment);

          // Update auction status
          await storage.updateAuction(auctionId, {
            status: "fulfilled",
            paymentStatus: "completed",
          });

          // Process payout to seller
          try {
            // For PayPal - use direct fund release
            if (payment.status === "completed_pending_shipment") {
              await PaymentService.releaseFundsToSeller(
                payment.id,
                `${carrier}: ${trackingNumber}`,
              );
              console.log(
                `[FULFILLMENT] Successfully released funds to seller`,
              );
            }
            // For other payment methods - mark as processed
            else if (
              payment.status === "completed" &&
              !payment.payoutProcessed
            ) {
              await storage.markPaymentPayoutProcessed(payment.id);
              console.log(`[FULFILLMENT] Marked payment as processed`);
            }
          } catch (payoutError) {
            console.error(
              "[FULFILLMENT] Error processing seller payout:",
              payoutError,
            );
            // Continue with fulfillment even if payout has an error
          }

          // Notify the buyer
          if (auction.winningBidderId) {
            await NotificationService.createNotification({
              userId: auction.winningBidderId,
              type: "fulfillment",
              title: "Order Shipped",
              message: `Your order "${auction.title}" has been shipped. Tracking: ${carrier} ${trackingNumber}`,
            });
            console.log(`[FULFILLMENT] Buyer notification sent`);
          }

          console.log(
            `[FULFILLMENT] Successfully processed fulfillment for auction ${auctionId}`,
          );
          res.status(200).json({ success: true, fulfillment });
        } catch (storageError) {
          console.error(
            "[FULFILLMENT] Error creating fulfillment record:",
            storageError,
          );
          return res.status(500).json({
            message: "Failed to create fulfillment record",
            error:
              storageError instanceof Error
                ? storageError.message
                : "Unknown error",
          });
        }
      } catch (error) {
        console.error("[FULFILLMENT] Error processing fulfillment:", error);
        res.status(500).json({
          message: "Failed to process fulfillment",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Update the auction approval endpoint
    router.post(
      "/api/admin/auctions/:id/approve",
      requireAdmin,
      async (req, res) => {
        try {
          const auctionId = parseInt(req.params.id);
          console.log(
            `[ADMIN APPROVE] Starting approval process for auction ${auctionId}`,
          );

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
            console.log(
              `[ADMIN APPROVE] Auction ${auctionId} is already approved`,
            );
            return res
              .status(400)
              .json({ message: "Auction is already approved" });
          }

          // Update auction to be approved and active
          const updatedAuction = await storage.updateAuction(auctionId, {
            approved: true,
            status: "active",
          });

          console.log(`[ADMIN APPROVE] Successfully approved auction:`, {
            id: updatedAuction.id,
            status: updatedAuction.status,
            approved: updatedAuction.approved,
          });

          res.json(updatedAuction);
        } catch (error) {
          console.error("[ADMIN APPROVE] Error approving auction:", error);
          res.status(500).json({
            message: "Failed to approve auction",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    router.post(
      "/api/admin/users/:id/approve",
      requireAdmin,
      async (req, res) => {
        try {
          const user = await storage.approveUser(parseInt(req.params.id));
          res.json(user);
        } catch (error) {
          res.status(500).json({ message: "Failed to approve user" });
        }
      },
    );

    // File upload endpoint
    router.post(
      "/api/upload",
      requireAuth,
      upload.array("files", 5),
      (req, res) => {
        try {
          handleFileUpload(req, res);
        } catch (error) {
          console.error(
            "[UPLOAD] Uncaught error in file upload handler:",
            error,
          );
          res.status(500).json({
            message: "An unexpected error occurred during file upload",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    // Update the get users endpoint to properly filter by approval status
    router.get("/api/admin/users", requireAdmin, async (req, res) => {
      try {
        const filters = {
          approved:
            req.query.approved === "true"
              ? true
              : req.query.approved === "false"
                ? false
                : undefined,
          role: req.query.role as string | undefined,
        };

        console.log("[ADMIN] Fetching users with filters:", filters);
        const users = await storage.getUsers(filters);

        // For pending sellers, only return those that are not approved
        if (filters.approved === false && filters.role === "seller") {
          const pendingSellers = users.filter((user) => !user.approved);
          return res.json(pendingSellers);
        }

        // For approved sellers, only return those that are approved
        if (
          filters.approved === true &&
          (filters.role === "seller" || filters.role === "seller_admin")
        ) {
          const approvedSellers = users.filter((user) => user.approved);
          return res.json(approvedSellers);
        }

        res.json(users);
      } catch (error) {
        console.error("[ADMIN] Error fetching users:", error);
        res.status(500).json({ message: "Failed to fetch users" });
      }
    });

    // Add new admin profile route
    router.get(
      "/api/admin/profiles/:userId",
      requireAdmin,
      async (req, res) => {
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
      },
    );

    // Add endpoint to get all profiles (for admin use)
    router.get("/api/admin/profiles", requireAdmin, async (req, res) => {
      try {
        console.log("[ADMIN] Fetching all profiles");

        // Get all sellers
        const sellers = await storage.getUsers({
          role: "seller",
        });
        const sellerAdmins = await storage.getUsers({
          role: "seller_admin",
        });
        const allSellers = [...sellers, ...sellerAdmins];

        // Get profiles for all sellers
        const profiles = await Promise.all(
          allSellers.map(async (seller) => {
            const profile = await storage.getProfile(seller.id);
            return profile ? { ...profile, userId: seller.id } : null;
          }),
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
    router.get(
      "/api/admin/users/:userId/bids",
      requireAdmin,
      async (req, res) => {
        try {
          const userId = parseInt(req.params.userId);
          const bids = await storage.getBidsByUser(userId);
          res.json(bids);
        } catch (error) {
          console.error("Error fetching user bids:", error);
          res.status(500).json({ message: "Failed to fetch user bids" });
        }
      },
    );

    router.get(
      "/api/admin/sellers/stripe-status",
      requireAdmin,
      async (req, res) => {
        try {
          console.log("[ADMIN] Fetching Stripe status for sellers");

          const sellers = await storage.getUsers({ role: "seller" });
          const sellerAdmins = await storage.getUsers({ role: "seller_admin" });
          const allSellers = [...sellers, ...sellerAdmins];

          const statusList = await Promise.all(
            allSellers.map(async (seller) => {
              const profile = await storage.getProfile(seller.id);
              return {
                sellerId: seller.id,
                username: seller.username,
                hasStripeAccount: !!profile?.stripeAccountId,
                stripeAccountStatus: profile?.stripeAccountStatus,
                status: profile?.stripeAccountStatus || "not_started",
              };
            }),
          );

          console.log(
            `[ADMIN] Retrieved Stripe status for ${statusList.length} sellers`,
          );
          res.json(statusList);
        } catch (error) {
          console.error("Error fetching seller Stripe statuses:", error);
          res
            .status(500)
            .json({ message: "Failed to fetch seller Stripe statuses" });
        }
      },
    );

    // Fix the typo in the admin auctions endpoint
    router.get(
      "/api/admin/users/:userId/auctions",
      requireAdmin,
      async (req, res) => {
        try {
          const userId = parseInt(req.params.userId);
          const auctions = await storage.getAuctions({ sellerId: userId });
          res.json(auctions);
        } catch (error) {
          console.error("Error fetching userauctions:", error);
          res.status(500).json({ message: "Failed to fetch user auctions" });
        }
      },
    );

    // Endpoint for sellers to accept/reject below-reserve bids
    router.post(
      "/api/auctions/:id/seller-decision",
      requireAuth,
      requireApprovedSeller,
      async (req, res) => {
        try {
          const auctionId = parseInt(req.params.id);
          const { accept } = req.body;

          if (typeof accept !== "boolean") {
            return res.status(400).json({
              message: "Decision (accept) must be provided as true or false",
            });
          }

          const auction = await storage.getAuction(auctionId);
          if (!auction) {
            return res.status(404).json({ message: "Auction not found" });
          }

          // Verify the seller owns this auction
          if (!req.user || auction.sellerId !== req.user.id) {
            return res.status(403).json({
              message: "You can only make decisions for your own auctions",
            });
          }

          // Verify auction is in correct state
          if (auction.status !== "pending_seller_decision") {
            return res
              .status(400)
              .json({ message: "This auction is not pending seller decision" });
          }

          if (accept) {
            // Accept the bid - move to payment pending
            await storage.updateAuction(auctionId, {
              status: "ended",
              paymentStatus: "pending",
            });

            // Notify the winning bidder
            if (auction.winningBidderId) {
              await NotificationService.notifyBuyerBidAccepted(
                auction.winningBidderId,
                auction.title,
                auction.currentPrice,
              );
            }
          } else {
            // Reject the bid - void the auction
            await storage.updateAuction(auctionId, {
              status: "voided",
              paymentStatus: "failed",
            });

            // Notify the winning bidder
            if (auction.winningBidderId) {
              await NotificationService.notifyBuyerBidRejected(
                auction.winningBidderId,
                auction.title,
                auction.currentPrice,
              );
            }
          }

          res.json({
            message: accept
              ? "Bid accepted, buyer will be notified to complete payment"
              : "Auction voided, buyer will be notified",
            auction: await storage.getAuction(auctionId),
          });
        } catch (error) {
          console.error("[AUCTION] Error handling seller decision:", error);
          res.status(500).json({
            message: "Failed to process seller decision",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );

    // Admin profile management
    router.delete(
      "/api/admin/profiles/:userId",
      requireAdmin,
      async (req, res) => {
        try {
          await storage.deleteProfile(parseInt(req.params.userId));
          res.sendStatus(200);
        } catch (error) {
          console.error("Error deleting profile:", error);
          res.status(500).json({ message: "Failed to delete profile" });
        }
      },
    );

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
        return res
          .status(200)
          .json({ success: true, message: "Auction deleted successfully" });
      } catch (error) {
        console.error("[ADMIN] Error deleting auction:", error);
        return res.status(500).json({
          message: "Failed to delete auction",
          error: error instanceof Error ? error.message : String(error),
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
          hasImages: !!data.images,
        });

        // Get the existing auction to compare with
        const existingAuction = await storage.getAuction(auctionId);
        if (!existingAuction) {
          return res.status(404).json({ message: "Auction not found" });
        }

        // Initialize update data object
        const updateData: any = {
          ...data,
          images: data.images || existingAuction.images, // Preserve existing images if none provided
        };

        // Ensure we're not losing the primary image
        if (!updateData.imageUrl && updateData.images?.length > 0) {
          updateData.imageUrl = updateData.images[0];
        }

        console.log("[ADMIN AUCTION UPDATE] Processed update data:", {
          images: updateData.images,
          imageUrl: updateData.imageUrl,
        });

        const updatedAuction = await storage.updateAuction(
          auctionId,
          updateData,
        );
        console.log("[ADMIN AUCTION UPDATE] Successfully updated auction:", {
          id: updatedAuction.id,
          imageCount: updatedAuction.images?.length || 0,
        });

        res.json(updatedAuction);
      } catch (error) {
        console.error("[ADMIN AUCTION UPDATE] Error:", error);
        res.status(500).json({
          message: "Failed to update auction",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Admin endpoint for managing auction photos
    router.post(
      "/api/admin/auctions/:id/photos",
      requireAdmin,
      upload.array("images", 5),
      async (req, res) => {
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
          const baseUrl = `${req.protocol}://${req.get("host")}`;
          const imageUrls = uploadedFiles.map(
            (file) => `${baseUrl}/uploads/${file.filename}`,
          );

          // Get existing images and append new ones
          const existingImages = Array.isArray(auction.images)
            ? auction.images
            : [];
          const updatedImages = [...existingImages, ...imageUrls];

          // Update auction with new images
          const updatedAuction = await storage.updateAuction(auctionId, {
            images: updatedImages,
            imageUrl: updatedImages[0] || auction.imageUrl, // Set first image as primary if available
          });

          res.status(200).json({
            message: "Photos added successfully",
            auction: updatedAuction,
          });
        } catch (error) {
          console.error("Error adding auction photos:", error);
          res.status(500).json({ message: "Failed to add photos to auction" });
        }
      },
    );

    // Admin endpoint for deleting a specific auction photo
    router.delete(
      "/api/admin/auctions/:id/photos/:photoIndex",
      requireAdmin,
      async (req, res) => {
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
            imageUrl: updatedImages.length > 0 ? updatedImages[0] : "", // Update primary image if needed
          });

          res.status(200).json({
            message: "Photo deleted successfully",
            auction: updatedAuction,
          });
        } catch (error) {
          console.error("Error deleting auction photo:", error);
          res.status(500).json({ message: "Failed to delete auction photo" });
        }
      },
    );

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

    // Create buyer request with admin notifications
    router.post("/api/buyer-requests", requireAuth, async (req, res) => {
      try {
        console.log("[BUYER REQUEST] Creating new request:", {
          userId: req.user?.id,
          title: req.body.title,
        });

        const validatedData = insertBuyerRequestSchema.parse(req.body);
        const request = await storage.createBuyerRequest({
          ...validatedData,
          buyerId: req.user!.id,
          status: "open",
        });

        // Notify all admin users
        const adminUsers = await storage.getUsersByRole([
          "admin",
          "seller_admin",
        ]);

        await Promise.all(
          adminUsers.map((admin) =>
            NotificationService.createNotification({
              userId: admin.id,
              type: "admin",
              title: "New Buyer Request",
              message: `A new buyer request has been submitted: "${request.title}"`,
              reference: `buyer-request-${request.id}`,
            }),
          ),
        );

        console.log("[BUYER REQUEST] Created successfully:", {
          requestId: request.id,
          notifiedAdmins: adminUsers.length,
        });

        res.status(201).json(request);
      } catch (error) {
        console.error("[BUYER REQUEST] Error creating request:", error);
        if (error instanceof ZodError) {
          return res.status(400).json({
            message: "Invalid request data",
            errors: error.errors,
          });
        }
        res.status(500).json({ message: "Failed to create buyer request" });
      }
    });

    router.get("/api/buyer-requests", async (req, res) => {
      try {
        const filters = {
          status: (req.query.status as string) || "open",
        };

        console.log("[BUYER REQUESTS] Fetching with filters:", filters);
        const requests = await storage.getBuyerRequests(filters);
        console.log(`[BUYER REQUESTS] Found ${requests.length} requests`);

        // Get buyer profiles for each request
        const requestsWithProfiles = await Promise.all(
          requests.map(async (request) => {
            const buyerProfile = await storage.getProfile(request.buyerId);
            console.log(
              `[BUYER REQUESTS] Found profile for buyer ${request.buyerId}:`,
              buyerProfile ? "yes" : "no",
            );
            return { ...request, buyerProfile };
          }),
        );

        console.log(
          `[BUYER REQUESTS] Returning ${requestsWithProfiles.length} requests with profiles`,
        );
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
          console.log(
            `[BUYER REQUEST] Fetching profile for buyer ${request.buyerId}`,
          );
          buyerProfile = await storage.getProfile(request.buyerId);
        }

        console.log(`[BUYER REQUEST] Returning request with profile:`, {
          requestId,
          hasProfile: !!buyerProfile,
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
        const updatedRequest = await storage.updateBuyerRequest(
          requestId,
          data,
        );
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

    router.post(
      "/api/auctions/:id/pay",
      requireAuth,
      requireProfile,
      async (req, res) => {
        console.log("[PAYMENT] Starting payment request:", {
          auctionId: req.params.id,
          userId: req.user?.id,
          body: req.body,
          timestamp: new Date().toISOString(),
          paypalConfig: {
            isConfigured:
              !!process.env.PAYPAL_CLIENT_ID &&
              !!process.env.PAYPAL_CLIENT_SECRET,
            environment: process.env.PAYPAL_ENV,
            sandbox: process.env.PAYPAL_ENV === "sandbox",
          },
        });
        try {
          // Log authentication state
          console.log("[PAYMENT] Payment request authentication:", {
            isAuthenticated: req.isAuthenticated(),
            userId: req.user?.id,
            timestamp: new Date().toISOString(),
          });

          if (!req.user) {
            console.log(
              "[PAYMENT] Unauthorized payment attempt - no user in session",
            );
            return res.status(401).json({
              message: "Unauthorized - Please log in again",
              code: "AUTH_REQUIRED",
            });
          }

          const auctionId = parseInt(req.params.id);
          const { includeInsurance = false } = req.body;

          console.log(
            `[PAYMENT] Creating payment session for auction ${auctionId}, buyer ${req.user.id}, insurance: ${includeInsurance}`,
          );

          const auction = await storage.getAuction(auctionId);
          if (!auction) {
            console.log(`[PAYMENT] Auction not found: ${auctionId}`);
            return res.status(404).json({ message: "Auction not found" });
          }

          // Verify this user won the auction
          if (auction.winningBidderId !== req.user.id) {
            console.log(
              `[PAYMENT] Unauthorized payment - user ${req.user.id} is not the winner of auction ${auctionId}`,
            );
            return res.status(403).json({
              message: "Only the winning bidder can pay",
              code: "NOT_WINNER",
            });
          }

          // Get the base URL from the request
          const baseUrl = `${req.protocol}://${req.get("host")}`;
          console.log(`[PAYMENT] Using base URL: ${baseUrl}`);

          // Create Stripe Checkout session
          const { sessionId, url, payment } =
            await PaymentService.createCheckoutSession(
              auctionId,
              req.user.id,
              includeInsurance,
              baseUrl,
            );

          console.log(
            `[PAYMENT] Successfully created checkout session ${sessionId} with URL: ${url}`,
          );

          res.json({
            sessionId,
            url,
            payment,
            success: true,
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
            } else if (error.message.includes("PayPal setup")) {
              errorMessage = "Payment system configuration error";
              errorCode = "PAYPAL_CONFIG_ERROR";
            }
          }

          res.status(500).json({
            message: errorMessage,
            details: error instanceof Error ? error.message : "Unknown error",
            code: errorCode,
          });
        }
      },
    );

    // Endpoint to retrieve a PayPal order status
    router.get("/api/payment/:orderId", requireAuth, async (req, res) => {
      try {
        const { orderId } = req.params;
        // Get order status from PaymentService
        const order = await PaymentService.getOrderStatus(orderId);
        // Return order info to client
        res.json(order);
      } catch (error) {
        console.error("Error retrieving payment order:", error);
        res.status(500).json({ message: "Failed to retrieve payment status" });
      }
    });

    // PayPal webhook handler
    router.post("/api/webhooks/paypal", async (req, res) => {
      try {
        console.log("[WEBHOOK] Received PayPal webhook event");
        const event = req.body;

        console.log("[WEBHOOK] Event type:", event.event_type);
        switch (event.event_type) {
          case "CHECKOUT.ORDER.COMPLETED": {
            console.log("Processing completed checkout:", event.resource.id);
            await PaymentService.handlePaymentSuccess(event.resource.id);
            break;
          }
          case "CHECKOUT.ORDER.FAILED": {
            console.log("Processing failed checkout:", event.resource.id);
            await PaymentService.handlePaymentFailure(event.resource.id);
            break;
          }
          default:
            console.log(`[WEBHOOK] Unhandled event type: ${event.event_type}`);
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
        if (
          req.user!.id !== auction.winningBidderId &&
          req.user!.id !== auction.sellerId
        ) {
          return res
            .status(403)
            .json({ message: "Unauthorized to view payment status" });
        }
        res.json({
          status: auction.paymentStatus,
          dueDate: auction.paymentDueDate,
        });
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
        const notifications = await storage.getNotificationsByUserId(
          req.user.id,
        );
        res.json(notifications);
      } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ message: "Failed to fetch notifications" });
      }
    });

    router.post(
      "/api/notifications/:id/read",
      requireAuth,
      async (req, res) => {
        try {
          const notification = await storage.markNotificationAsRead(
            parseInt(req.params.id),
          );
          res.json(notification);
        } catch (error) {
          console.error("Error marking notification as read:", error);
          res
            .status(500)
            .json({ message: "Failed to mark notification as read" });
        }
      },
    );

    router.post(
      "/api/notifications/mark-all-read",
      requireAuth,
      async (req, res) => {
        try {
          if (!req.user) {
            return res.status(401).json({ message: "Unauthorized" });
          }
          const notifications = await storage.getNotificationsByUserId(
            req.user.id,
          );
          await Promise.all(
            notifications.map((notification) =>
              storage.markNotificationAsRead(notification.id),
            ),
          );
          res.json({ success: true });
        } catch (error) {
          console.error("Error marking all notifications as read:", error);
          res
            .status(500)
            .json({ message: "Failed to mark all notifications as read" });
        }
      },
    );

    // Add notification count endpoint
    router.get(
      "/api/notifications/unread-count",
      requireAuth,
      async (req, res) => {
        try {
          if (!req.user) {
            return res.status(401).json({ message: "Unauthorized" });
          }
          const count = await storage.getUnreadNotificationsCount(req.user.id);
          res.json({ count });
        } catch (error) {
          console.error("Error getting unread notifications count:", error);
          res
            .status(500)
            .json({ message: "Failed to get unread notifications count" });
        }
      },
    );

    // Add seller approval endpoint
    router.post(
      "/api/admin/sellers/:id/approve",
      requireAdmin,
      async (req, res) => {
        try {
          const sellerId = parseInt(req.params.id);
          console.log(`[ADMIN] Approving seller with ID ${sellerId}`);

          // Find the user associated with this seller ID
          const users = await storage.getUsers();
          const sellerUser = users.find((user) => user.id === sellerId);

          if (!sellerUser) {
            return res.status(404).json({ message: "Seller not found" });
          }

          // Update the user's approved status
          await storage.updateUser(sellerId, { approved: true });

          // Send notification to the user
          await NotificationService.createNotification(sellerId, {
            type: "account",
            title: "Account Approved",
            message:
              "Your seller account has been approved! You can now create auctions.",
          });

          console.log(`[ADMIN] Successfully approved seller ${sellerId}`);
          res.json({ success: true });
        } catch (error) {
          console.error("Error approving seller:", error);
          res.status(500).json({ message: "Failed to approve seller" });
        }
      },
    );

    // Add this new route after the existing /api/sellers/status route
    router.get("/api/sellers/active", async (req, res) => {
      try {
        // Get all approved sellers
        const sellers = await storage.getUsers({
          role: "seller",
          approved: true,
        });
        // Get profiles and recent auctions for each seller
        const sellersWithDetails = await Promise.all(
          sellers.map(async (seller) => {
            const profile = await storage.getProfile(seller.id);
            const auctions = await storage.getAuctions({
              sellerId: seller.id,
              approved: true,
            });
            return {
              ...seller,
              profile,
              auctions: auctions.slice(0, 3), // Only return the 3 most recent auctions
            };
          }),
        );
        // Filter out sellers without profiles or active approved auctions
        const activeSellers = sellersWithDetails.filter(
          (seller) =>
            seller.profile &&
            seller.auctions.some(
              (auction) =>
                auction.status === "active" && auction.approved === true,
            ),
        );
        res.json(activeSellers);
      } catch (error) {
        console.error("Error fetching active sellers:", error);
        res.status(500).json({ message: "Failed to fetch active sellers" });
      }
    });

    router.get("/api/analytics/auction-bids", async (req, res) => {
      try {
        // Get allauctions with their bids
        const auctions = await storage.getAuctions({});
        const auctionBids = await Promise.all(
          auctions.map(async (auction) => {
            const bids = await storage.getBidsForAuction(auction.id);
            return {
              auctionId: auction.id,
              totalBids: bids.length,
            };
          }),
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
        const completedAuctions = auctions.filter(
          (a) => a.status === "ended" && a.winningBidderId,
        );
        // Calculate seller performance
        const sellerStats = new Map();
        completedAuctions.forEach((auction) => {
          if (!sellerStats.has(auction.sellerId)) {
            sellerStats.set(auction.sellerId, { total: 0, auctionsWon: 0 });
          }
          const stats = sellerStats.get(auction.sellerId);
          stats.total += auction.currentPrice;
          stats.auctionsWon += 1;
        });
        // Calculate buyerperformance
        const buyerStats = new Map();
        completedAuctions.forEach((auction) => {
          if (!buyerStats.has(auction.winningBidderId)) {
            buyerStats.set(auction.winningBidderId, {
              total: 0,
              auctionsWon: 0,
            });
          }
          const stats = buyerStats.get(auction.winningBidderId);
          stats.total += auction.currentPrice;
          stats.auctionsWon += 1;
        });
        // Get top seller
        let topSeller = null;
        if (sellerStats.size > 0) {
          const [topSellerId, topSellerStats] = Array.from(
            sellerStats.entries(),
          ).sort((a, b) => b[1].total - a[1].total)[0];
          const sellerProfile = await storage.getProfile(topSellerId);
          topSeller = {
            userId: topSellerId,
            name: sellerProfile?.businessName || "Anonymous Seller",
            ...topSellerStats,
          };
        }
        // Get top buyer
        let topBuyer = null;
        if (buyerStats.size > 0) {
          const [topBuyerId, topBuyerStats] = Array.from(
            buyerStats.entries(),
          ).sort((a, b) => b[1].total - a[1].total)[0];
          const buyerProfile = await storage.getProfile(topBuyerId);
          topBuyer = {
            userId: topBuyerId,
            name: buyerProfile?.businessName || "Anonymous Buyer",
            ...topBuyerStats,
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
        console.log(
          "[NOTIFICATION CHECK] Running scheduled auction notification check at",
          new Date().toISOString(),
        );
        await AuctionService.checkAndNotifyEndingAuctions();
        await AuctionService.checkAndNotifyCompletedAuctions();
      } catch (error) {
        console.error("Error in auction notification check:", error);
      }
    }, NOTIFICATION_CHECK_INTERVAL);

    router.post(
      "/api/ai/price-suggestion",
      requireAuth,
      requireApprovedSeller,
      async (req, res) => {
        try {
          console.log("[AI ENDPOINT] Received price suggestion request:", {
            body: req.body,
            user: {
              id: req.user.id,
              role: req.user.role,
            },
          });

          const { species, category, quality, additionalDetails } = req.body;

          const suggestion = await AIPricingService.getPriceSuggestion(
            species,
            category,
            quality || "Standard",
            additionalDetails || "",
          );

          console.log("[AI ENDPOINT] Generated price suggestion:", suggestion);
          res.json(suggestion);
        } catch (error) {
          console.error("[AI ENDPOINT] Error getting price suggestion:", error);
          res.status(500).json({
            message:
              error instanceof Error
                ? error.message
                : "Failed to generate price suggestion",
          });
        }
      },
    );

    router.post(
      "/api/ai/description-suggestion",
      requireAuth,
      requireApprovedSeller,
      async (req, res) => {
        try {
          console.log(
            "[AI ENDPOINT] Received description suggestion request:",
            {
              body: req.body,
              user: {
                id: req.user.id,
                role: req.user.role,
              },
            },
          );

          const { title, species, category, details } = req.body;

          const suggestion = await AIPricingService.getDescriptionSuggestion(
            title || `${species} - ${category}`,
            species,
            category,
            details || "",
          );

          console.log(
            "[AI ENDPOINT] Generated description suggestion:",
            suggestion,
          );
          res.json(suggestion);
        } catch (error) {
          console.error("[AI ENDPOINT] Error generating description:", error);
          res.status(500).json({
            message:
              error instanceof Error
                ? error.message
                : "Failed to generate description",
          });
        }
      },
    );

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
        const { accountId, url } =
          await SellerPaymentService.createSellerAccount(profile);
        console.log("[Stripe Connect] Account created, ID:", accountId);
        console.log("[Stripe Connect] Redirect URL generated");

        return res.json({ accountId, url });
      } catch (error) {
        console.error("[Stripe Connect] Error:", error);
        if (error instanceof Error) {
          console.error("[Stripe Connect] Error details:", {
            name: error.name,
            message: error.message,
            stack: error.stack,
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

        const status = await SellerPaymentService.getAccountStatus(
          profile.stripeAccountId,
        );

        // Update profile with latest status from Stripe if it's changed
        if (profile.stripeAccountStatus !== status) {
          await storage.updateSellerStripeAccount(req.user.id, {
            accountId: profile.stripeAccountId,
            status,
          });
        }

        return res.json({
          status,
          accountId: profile.stripeAccountId,
        });
      } catch (error) {
        console.error("[Seller Status] Error:", error);
        return res.status(500).json({
          message: "Failed to fetch seller status",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // API endpoint for fulfillment
    router.post(
      "/api/auctions/:id/fulfill",
      requireAuth,
      requireApprovedSeller,
      async (req, res) => {
        try {
          const auctionId = parseInt(req.params.id);

          // Handle multiple possible input formats
          let carrier, trackingNumber, notes;

          if (req.body.trackingInfo) {
            // Format: "USPS: 1234567890"
            const parts = req.body.trackingInfo.split(":");
            carrier = parts[0]?.trim();
            trackingNumber = parts[1]?.trim();
            notes = req.body.notes || "";
          } else {
            // Direct fields format
            carrier = req.body.carrier;
            trackingNumber = req.body.trackingNumber;
            notes = req.body.notes || "";
          }

          console.log("[FULFILLMENT] Processing fulfillment for auction", {
            auctionId,
            requestBody: req.body,
            trackingNumber,
            carrier,
            notes,
            userId: req.user?.id,
          });

          if (!carrier || !trackingNumber) {
            return res.status(400).json({
              message: "Carrier and tracking number are required",
              receivedData: req.body,
            });
          }

          // Verify auction belongs to seller
          const auction = await storage.getAuction(auctionId);
          if (!auction) {
            return res.status(404).json({ message: "Auction not found" });
          }

          if (auction.sellerId !== req.user.id) {
            return res
              .status(403)
              .json({ message: "Not authorized to fulfill this auction" });
          }

          // Create fulfillment record
          await storage.createFulfillment({
            auctionId,
            trackingNumber,
            shippingCarrier: carrier,
            additionalNotes: notes,
            status: "shipped",
            shippingDate: new Date(),
          });

          // Update auction status
          await storage.updateAuction(auctionId, {
            status: "fulfilled",
          });

          // Find the payment for this auction
          const payment = await storage.findPaymentByAuctionId(auctionId);
          if (
            payment &&
            payment.status === "completed" &&
            !payment.payoutProcessed
          ) {
            try {
              // Now that we have tracking info, create the payout to the seller
              await SellerPaymentService.createPayout(
                payment.id,
                auction.sellerId,
                payment.sellerPayout,
              );

              // Mark that payout has been processed
              await storage.markPaymentPayoutProcessed(payment.id);

              console.log(
                `Successfully processed payout for auction ${auctionId} to seller ${auction.sellerId}`,
              );
            } catch (payoutError) {
              console.error("Error processing seller payout:", payoutError);
              // We'll still mark the auction as fulfilled, but log the payout error
            }
          }

          // Notify the buyer
          if (auction.winningBidderId) {
            try {
              await NotificationService.notifyFulfillment(
                auction.winningBidderId,
                auction.title,
                trackingNumber,
                carrier,
              );
              console.log(
                `Successfully notified buyer ${auction.winningBidderId} about fulfillment`,
              );
            } catch (notifyError) {
              console.error("Error notifying buyer:", notifyError);
              // Continue with fulfillment even if notification fails
            }
          }

          return res.json({ success: true });
        } catch (error) {
          console.error("Error fulfilling auction:", error);
          res.status(500).json({
            message: "Failed to fulfill auction",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    // Add new endpoint for getting seller Stripe status
    router.get(
      "/api/admin/sellers/stripe-status",
      requireAdmin,
      async (req, res) => {
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
                    status: "not_started",
                  };
                }

                // Return the status from profile
                return {
                  sellerId: seller.id,
                  status: profile?.stripeAccountStatus || "not_started",
                };
              } catch (error) {
                console.error(
                  `[ADMIN] Error getting Stripe status for seller ${seller.id}:`,
                  error,
                );
                return {
                  sellerId: seller.id,
                  status: "error",
                };
              }
            }),
          );

          res.json(sellerStatuses);
        } catch (error) {
          console.error("[ADMIN] Error fetching seller Stripe status:", error);
          res.status(500).json({ message: "Failed to fetch seller status" });
        }
      },
    );

    // Add new endpoint for deleting users
    router.delete(
      "/api/admin/users/:userId",
      requireAdmin,
      async (req, res) => {
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
      },
    );

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
          approved: true,
        });

        res.json({
          profile,
          activeAuctions: auctions.length,
        });
      } catch (error) {
        console.error("[SELLER] Error fetching seller profile:", error);
        res.status(500).json({ message: "Failed to fetch seller profile" });
      }
    });

    router.get("/api/analytics/market-stats", async (req, res) => {
      try {
        const timeFrame = (req.query.timeFrame as string) || "month";
        const category = req.query.category as string;
        const species = req.query.species as string;

        console.log(
          "[ANALYTICS] Starting market stats calculation with params:",
          {
            timeFrame,
            category,
            species,
            timestamp: new Date().toISOString(),
          },
        );

        // Get all auctions based on filters
        const auctions = await storage.getAuctions({
          category: category === "all" ? undefined : category,
          species: species === "all" ? undefined : species,
          approved: true,
        });

        console.log("[ANALYTICS] Initial auction query results:", {
          totalAuctions: auctions.length,
          categories: [...new Set(auctions.map((a) => a.category))],
          species: [...new Set(auctions.map((a) => a.species))],
        });

        // Filter and transform auction data for the price trend
        const now = new Date();
        const cutoffDate = new Date();
        switch (timeFrame) {
          case "week":
            cutoffDate.setDate(cutoffDate.getDate() - 7);
            break;
          case "year":
            cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
            break;
          default: // month
            cutoffDate.setMonth(cutoffDate.getMonth() - 1);
        }

        // Include both active and ended auctions that have prices
        const validAuctions = auctions.filter((auction) => {
          const auctionEndDate = new Date(auction.endDate);
          const hasValidPrice =
            auction.currentPrice > 0 || auction.startPrice > 0;
          const isAfterCutoff = auctionEndDate >= cutoffDate;
          const isActive = auctionEndDate >= now;

          // Log invalid auctions for debugging
          if (!hasValidPrice) {
            console.log("[ANALYTICS] Auction excluded - no valid price:", {
              id: auction.id,
              title: auction.title,
              currentPrice: auction.currentPrice,
              startPrice: auction.startPrice,
            });
          }

          return hasValidPrice && (isAfterCutoff || isActive);
        });

        console.log("[ANALYTICS] Valid auctions after filtering:", {
          total: validAuctions.length,
          timeRange: {
            start: cutoffDate.toISOString(),
            end: now.toISOString(),
          },
        });

        // Sort auctions by date
        const sortedAuctions = validAuctions.sort((a, b) => {
          const dateA = new Date(a.endDate).getTime();
          const dateB = new Date(b.endDate).getTime();
          return dateA - dateB;
        });

        // Create price data points
        const priceData = sortedAuctions.map((auction) => {
          const price =
            auction.currentPrice > 0
              ? auction.currentPrice
              : auction.startPrice;
          const auctionEndDate = new Date(auction.endDate);
          const dateForPoint = auctionEndDate > now ? now : auctionEndDate;

          return {
            date: dateForPoint.toISOString(),
            price: price,
            title: auction.title,
            medianPrice: calculateMovingAverage(
              sortedAuctions,
              dateForPoint,
              price,
            ),
          };
        });

        // Calculate market statistics
        const activeAuctions = auctions.filter(
          (auction) => new Date(auction.endDate) > now,
        ).length;

        // Get all bids for the filtered auctions
        const allBids = await Promise.all(
          validAuctions.map(async (auction) => {
            const bids = await storage.getBidsForAuction(auction.id);
            return { auctionId: auction.id, bids };
          }),
        );

        // Calculate bidder statistics
        const allBidders = new Set();
        let totalBidsCount = 0;

        allBids.forEach(({ bids }) => {
          bids.forEach((bid) => {
            allBidders.add(bid.bidderId);
            totalBidsCount++;
          });
        });

        const activeBidders = allBidders.size;
        const totalBids = totalBidsCount;

        // Calculate category statistics
        const categoryCount = validAuctions.reduce(
          (acc, auction) => {
            const category = auction.category || "Uncategorized";
            acc[category] = (acc[category] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        const popularCategories = Object.entries(categoryCount)
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count);

        // Calculate average prices by species
        const speciesPrices = validAuctions.reduce(
          (acc, auction) => {
            const price = auction.currentPrice || auction.startPrice;
            if (!acc[auction.species]) {
              acc[auction.species] = { total: 0, count: 0 };
            }
            acc[auction.species].total += price;
            acc[auction.species].count += 1;
            return acc;
          },
          {} as Record<string, { total: number; count: number }>,
        );

        const averagePrices = Object.entries(speciesPrices).map(
          ([species, data]) => ({
            species,
            averagePrice: Math.round(data.total / data.count),
          }),
        );

        // Construct response object
        const response = {
          activeBidders,
          totalBids,
          priceData,
          activeAuctions,
          species: [...new Set(auctions.map((a) => a.species))],
          averagePrices,
          popularCategories,
          topPerformers: {
            seller: null,
            buyer: null,
          },
        };

        console.log("[ANALYTICS] Response summary:", {
          dataPoints: priceData.length,
          activeBidders,
          totalBids,
          activeAuctions,
          categoriesCount: popularCategories.length,
          speciesCount: averagePrices.length,
        });

        res.json(response);
      } catch (error) {
        console.error("[ANALYTICS] Error processing market stats:", error);
        res.status(500).json({
          message: "Failed to fetch market statistics",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Helper function to calculate moving average for trend line
    function calculateMovingAverage(
      auctions: any[],
      currentDate: Date,
      currentPrice: number,
      windowDays = 7,
    ): number {
      const windowStart = new Date(currentDate);
      windowStart.setDate(windowStart.getDate() - windowDays);

      const windowPrices = auctions
        .filter((a) => {
          const auctionDate = new Date(a.endDate);
          return auctionDate >= windowStart && auctionDate <= currentDate;
        })
        .map((a) => a.currentPrice || a.startPrice);

      if (windowPrices.length === 0) return currentPrice;

      const sum = windowPrices.reduce((acc, price) => acc + price, 0);
      return Math.round(sum / windowPrices.length);
    }

    // Add active sellers endpoint
    router.get("/api/sellers/active", async (req, res) => {
      try {
        const sellers = await storage.getUsers({
          role: "seller",
          approved: true,
        });

        const sellersWithDetails = await Promise.all(
          sellers.map(async (seller) => {
            const profile = await storage.getProfile(seller.id);
            const auctions = await storage.getAuctions({
              sellerId: seller.id,
              approved: true,
            });
            return {
              ...seller,
              profile,
              auctions: auctions.slice(0, 3), // Only return the 3 most recent auctions
            };
          }),
        );

        // Filter for active sellers
        const activeSellers = sellersWithDetails.filter(
          (seller) =>
            seller.profile &&
            seller.auctions.some(
              (auction) =>
                auction.status === "active" && auction.approved === true,
            ),
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
const log = (message: string, context: string = "general") => {
  console.log(`[${context}] ${message}`);
};

router.get("/api/user", (req: Express.Request, res: Express.Response) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  res.json(req.user);
});

// Add a session checker endpoint with enhanced logging
router.get(
  "/api/session/check",
  (req: Express.Request, res: Express.Response) => {
    console.log("[SESSION] Checking session status:", {
      isAuthenticated: req.isAuthenticated(),
      sessionID: req.sessionID,
      hasCookies: !!req.headers.cookie,
      cookies: req.headers.cookie,
      user: req.user
        ? {
            id: req.user.id,
            role: req.user.role,
            username: req.user.username,
          }
        : null,
    });

    if (req.isAuthenticated()) {
      // Return full user data for authenticated sessions
      res.json({
        authenticated: true,
        user: req.user,
        sessionID: req.sessionID,
      });
    } else {
      // Check if there's a session cookie present but not valid
      const hasSessionCookie = req.headers.cookie?.includes("poultry.sid");

      res.json({
        authenticated: false,
        message: hasSessionCookie
          ? "Session cookie present but not authenticated"
          : "No active session",
        hasCookie: hasSessionCookie,
      });
    }
  },
);

// Registration endpoint
router.post("/api/register", async (req, res) => {
  try {
    const userData = req.body as InsertUser;
    console.log("[ROUTES] Registration attempt:", userData.username);

    // Use the schema directly from the imported types at the top of the file
    const validationResult = insertUserSchema.safeParse(userData);
    if (!validationResult.success) {
      console.error(
        "[ROUTES] Registration validation error:",
        validationResult.error,
      );
      return res.status(400).json({
        message: "Invalid user data",
        errors: validationResult.error.format(),
      });
    }

    // Check if username exists
    const existingUser = await storage.getUserByUsername(userData.username);
    if (existingUser) {
      console.log(
        "[ROUTES] Registration failed: Username exists",
        userData.username,
      );
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
      emailNotificationsEnabled: true,
    });

    console.log("[ROUTES] User registered successfully:", newUser.id);
    res.status(201).json({
      message: "User registered successfully",
      userId: newUser.id,
      username: newUser.username,
      role: newUser.role,
    });
  } catch (error) {
    console.error("[ROUTES] Registration error:", error);
    res.status(500).json({
      message:
        "Registration failed: " +
        (error instanceof Error ? error.message : "Unknown error"),
    });
  }
});

// Seller PayPal connection
router.post("/api/seller/connect", requireAuth, async (req, res) => {
  try {
    const { userId } = req.user;
    const profile = await storage.getProfile(userId);
    if (!profile) {
      return res.status(404).json({ error: "User profile not found" });
    }

    // In sandbox mode, give the option to bypass PayPal integration
    if (process.env.PAYPAL_ENV !== "production" && req.query.test === "true") {
      console.log("[API] Using test mode for seller account");

      const testMerchantId = randomPaypalID();
      await storage.updateSellerPayPalAccount(userId, {
        merchantId: testMerchantId,
        status: "verified", // Auto-verify in test mode
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      return res.json({
        success: true,
        message: "Test seller account verified",
        redirectUrl: "/seller/dashboard?success=true&test=true",
      });
    }

    // Create a seller PayPal account through normal flow
    const { merchantId, url } =
      await SellerPaymentService.createSellerAccount(profile);

    res.json({ redirectUrl: url });
  } catch (error) {
    console.error("[API] Error creating seller PayPal account:", error);
    res.status(500).json({
      error: "Failed to create seller account",
      details: error instanceof Error ? error.message : "Unknown error",
      sandbox: process.env.PAYPAL_ENV !== "production",
    });
  }
});
