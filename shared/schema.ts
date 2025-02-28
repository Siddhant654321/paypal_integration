import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull(),
  role: text("role", { enum: ["buyer", "seller", "admin", "seller_admin"] }).notNull(),
  approved: boolean("approved").notNull().default(false),
  hasProfile: boolean("has_profile").notNull().default(false),
  emailNotificationsEnabled: boolean("email_notifications_enabled").notNull().default(true),
});

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phoneNumber: text("phone_number").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zipCode: text("zip_code").notNull(),
  bio: text("bio"),
  isPublicBio: boolean("is_public_bio").notNull().default(true),
  profilePicture: text("profile_picture"),
  // Notification preferences
  emailBidNotifications: boolean("email_bid_notifications").notNull().default(true),
  emailAuctionNotifications: boolean("email_auction_notifications").notNull().default(true),
  emailPaymentNotifications: boolean("email_payment_notifications").notNull().default(true),
  emailAdminNotifications: boolean("email_admin_notifications").notNull().default(true),
  // Seller specific fields
  businessName: text("business_name"),
  breedSpecialty: text("breed_specialty"),
  npipNumber: text("npip_number"),
  // Stripe Connect fields
  stripeAccountId: text("stripe_account_id"),
  stripeAccountStatus: text("stripe_account_status", {
    enum: ["pending", "verified", "rejected"]
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Update user decisions enum
const sellerDecisionEnum = z.enum(["accept", "void"]);
type SellerDecision = z.infer<typeof sellerDecisionEnum>;

export const auctions = pgTable("auctions", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  species: text("species").notNull(),
  category: text("category").notNull(),  // Remove enum constraint to allow flexibility
  imageUrl: text("image_url"),
  images: text("images").array().notNull().default([]),
  startPrice: integer("start_price").notNull(),
  reservePrice: integer("reserve_price").notNull(),
  currentPrice: integer("current_price").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  approved: boolean("approved").notNull().default(false),
  status: text("status", {
    enum: ["active", "ended", "pending_seller_decision", "voided", "pending_fulfillment", "fulfilled"],
  }).notNull().default("active"),
  paymentStatus: text("payment_status", {
    enum: ["pending", "processing", "completed", "failed"],
  }).notNull().default("pending"),
  paymentDueDate: timestamp("payment_due_date"),
  winningBidderId: integer("winning_bidder_id"),
  sellerDecision: text("seller_decision", {
    enum: ["accept", "void"],
  }),
  reserveMet: boolean("reserve_met").notNull().default(false),
  fulfillmentRequired: boolean("fulfillment_required").notNull().default(false),
});

export const bids = pgTable("bids", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull(),
  bidderId: integer("bidder_id").notNull(),
  amount: integer("amount").notNull(),
  timestamp: timestamp("timestamp").notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull(),
  buyerId: integer("buyer_id").notNull(),
  sellerId: integer("seller_id").notNull(),
  amount: integer("amount").notNull(),
  platformFee: integer("platform_fee").notNull(),
  sellerPayout: integer("seller_payout").notNull(),
  insuranceFee: integer("insurance_fee").notNull().default(0),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeTransferId: text("stripe_transfer_id"),
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed"],
  }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  paymentId: integer("payment_id").notNull(),
  amount: integer("amount").notNull(),
  stripeTransferId: text("stripe_transfer_id"),
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed"]
  }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Add new fulfillment table
export const fulfillments = pgTable("fulfillments", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull().unique(),
  shippingCarrier: text("shipping_carrier").notNull(),
  trackingNumber: text("tracking_number").notNull(),
  shippingDate: timestamp("shipping_date").notNull(),
  estimatedDeliveryDate: timestamp("estimated_delivery_date"),
  additionalNotes: text("additional_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profiles)
  .omit({
    id: true,
    userId: true,
    stripeAccountId: true,
    stripeAccountStatus: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email(),
    phoneNumber: z.string().regex(/^\+?[\d\s-()]{10,}$/, "Invalid phone number format"),
    address: z.string().min(5, "Address must be at least 5 characters"),
    city: z.string().min(2, "City must be at least 2 characters"),
    state: z.string().min(2, "State must be at least 2 characters"),
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code format"),
    bio: z.string().optional(),
    isPublicBio: z.boolean().default(true),
    profilePicture: z.string().optional(),
    businessName: z.string().optional(),
    breedSpecialty: z.string().optional(),
    npipNumber: z.string().optional(),
    // Add notification preferences to schema
    emailBidNotifications: z.boolean().default(true),
    emailAuctionNotifications: z.boolean().default(true),
    emailPaymentNotifications: z.boolean().default(true),
    emailAdminNotifications: z.boolean().default(true),
  });

// Create insert schema for auction
export const insertAuctionSchema = createInsertSchema(auctions)
  .omit({
    id: true,
    sellerId: true,
    approved: true,
    currentPrice: true,
    paymentStatus: true,
    paymentDueDate: true,
    winningBidderId: true,
    status: true,
    sellerDecision: true,
    reserveMet: true,
    fulfillmentRequired:true
  })
  .extend({
    title: z.string().min(5, "Title must be at least 5 characters"),
    description: z.string().min(20, "Description must be at least 20 characters"),
    startPrice: z
      .number()
      .min(0.01, "Start price must be at least $0.01")
      .transform((price) => Math.round(price * 100)), // Convert dollars to cents - only for NEW auctions
    reservePrice: z
      .number()
      .min(0.01, "Reserve price must be at least $0.01")
      .transform((price) => Math.round(price * 100)), // Convert dollars to cents - only for NEW auctions
    startDate: z.string().transform((str) => {
      // Make sure we have a full ISO string with time
      const date = str.includes('T') ? str : `${str}T00:00:00`;
      return new Date(date);
    }),
    endDate: z.string().transform((str) => {
      // Make sure we have a full ISO string with time
      const date = str.includes('T') ? str : `${str}T23:59:59`;
      return new Date(date);
    }),
    imageUrl: z.string().optional(),
    images: z.array(z.string()).optional().default([]),
  })
  .refine(
    (data) => data.reservePrice >= data.startPrice,
    "Reserve price must be greater than or equal to start price"
  )
  .refine(
    (data) => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      return end > start;
    },
    "End date must be after start date"
  );

export const insertBidSchema = createInsertSchema(bids).omit({
  id: true,
  timestamp: true,
});

// Update the payment schema to include insuranceFee
export const insertPaymentSchema = createInsertSchema(payments)
  .omit({
    id: true,
    stripePaymentIntentId: true,
    stripeTransferId: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  });

// Create insert schema for payouts
export const insertPayoutSchema = createInsertSchema(payouts).omit({
  id: true,
  stripeTransferId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true,
    role: true,
    email: true,
  })
  .extend({
    email: z.string().email("Invalid email format"),
  });

// Add fulfillment schema
export const insertFulfillmentSchema = createInsertSchema(fulfillments)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    shippingCarrier: z.string().min(2, "Shipping carrier is required"),
    trackingNumber: z.string().min(5, "Valid tracking number is required"),
    shippingDate: z.string().transform(str => new Date(str)),
    estimatedDeliveryDate: z.string().optional().transform(str => str ? new Date(str) : undefined),
    additionalNotes: z.string().optional(),
  });


export const buyerRequests = pgTable("buyer_requests", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull(),
  title: text("title").notNull(),
  species: text("species").notNull(),
  description: text("description").notNull(),
  status: text("status", {
    enum: ["open", "fulfilled", "closed"]
  }).notNull().default("open"),
  views: integer("views").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Add insert schema for buyer requests
export const insertBuyerRequestSchema = createInsertSchema(buyerRequests)
  .omit({
    id: true,
    buyerId: true,
    views: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    title: z.string().min(5, "Title must be at least 5 characters"),
    species: z.string().min(2, "Species must be at least 2 characters"),
    description: z.string().min(20, "Description must be at least 20 characters"),
  });

// Add types for buyer requests
export type BuyerRequest = typeof buyerRequests.$inferSelect;
export type InsertBuyerRequest = z.infer<typeof insertBuyerRequestSchema>;

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Auction = typeof auctions.$inferSelect;
export type InsertAuction = z.infer<typeof insertAuctionSchema>;
export type Bid = typeof bids.$inferSelect;
export type InsertBid = z.infer<typeof insertBidSchema>;
export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payout = typeof payouts.$inferSelect;
export type InsertPayout = z.infer<typeof insertPayoutSchema>;
export type Fulfillment = typeof fulfillments.$inferSelect;
export type InsertFulfillment = z.infer<typeof insertFulfillmentSchema>;