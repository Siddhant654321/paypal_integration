import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
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
  emailDailyDigest: boolean("email_daily_digest").notNull().default(true),
  // Seller specific fields
  businessName: text("business_name"),
  breedSpecialty: text("breed_specialty"),
  npipNumber: text("npip_number"),
  // PayPal fields
  paypalMerchantId: text("paypal_merchant_id"),
  paypalAccountStatus: text("paypal_account_status", {
    enum: ["pending", "verified", "not_started"]
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Update insert schema for profiles
export const insertProfileSchema = createInsertSchema(profiles)
  .omit({
    id: true,
    paypalMerchantId: true,
    paypalAccountStatus: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    fullName: z.string().min(2, "Full name is required"),
    email: z.string().email("Invalid email format"),
    phoneNumber: z.string().min(10, "Valid phone number is required"),
    address: z.string().min(5, "Valid address is required"),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),
    zipCode: z.string().min(5, "Valid ZIP code is required"),
    bio: z.string().optional(),
    isPublicBio: z.boolean().default(true),
    profilePicture: z.string().optional(),
    businessName: z.string().optional(),
    breedSpecialty: z.string().optional(),
    npipNumber: z.string().optional(),
    emailBidNotifications: z.boolean().default(true),
    emailAuctionNotifications: z.boolean().default(true),
    emailPaymentNotifications: z.boolean().default(true),
    emailAdminNotifications: z.boolean().default(true),
    emailDailyDigest: z.boolean().default(true),
  });

// Update user decisions enum
const sellerDecisionEnum = z.enum(["accept", "void"]);

// Notifications schema
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  type: text('type', {
    enum: ['bid', 'auction', 'payment', 'fulfillment', 'admin']
  }).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  read: boolean('read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  data: text('data'),
  reference: text("reference"), // Reference to the entity this notification is about (e.g., auction ID)
});

// Create insert schema for notifications
export const insertNotificationSchema = createInsertSchema(notifications)
  .omit({
    id: true,
    read: true,
    createdAt: true,
  });

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
type SellerDecision = z.infer<typeof sellerDecisionEnum>;

export const auctions = pgTable("auctions", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  species: text("species").notNull(),
  category: text("category").notNull(),
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
    enum: ["pending", "completed_pending_shipment", "completed", "failed"],
  }).notNull().default("pending"),
  paymentDueDate: timestamp("payment_due_date"),
  winningBidderId: integer("winning_bidder_id"),
  sellerDecision: text("seller_decision", {
    enum: ["accept", "void"],
  }),
  reserveMet: boolean("reserve_met").notNull().default(false),
  fulfillmentRequired: boolean("fulfillment_required").notNull().default(false),
  views: integer("views").notNull().default(0)  // Added views column
});

export const bids = pgTable("bids", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull(),
  bidderId: integer("bidder_id").notNull(),
  amount: integer("amount").notNull(),
  timestamp: timestamp("timestamp").notNull(),
});

// Payment related schemas
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull().references(() => auctions.id),
  buyerId: integer("buyer_id").notNull().references(() => users.id),
  sellerId: integer("seller_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(), // in cents
  platformFee: integer("platform_fee").notNull(), // in cents
  sellerPayout: integer("seller_payout").notNull(), // in cents
  insuranceFee: integer("insurance_fee").notNull(), // in cents
  paypalOrderId: varchar("paypal_order_id", { length: 256 }),
  status: varchar("status", {
    enum: ["pending", "completed_pending_shipment", "completed", "failed"]
  }).notNull(),
  trackingInfo: text("tracking_info"),
  payoutProcessed: boolean("payout_processed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Update payment status type
export type PaymentStatus = "pending" | "completed_pending_shipment" | "completed" | "failed";

// Update the insert payment schema
export const insertPaymentSchema = createInsertSchema(payments)
  .omit({
    id: true,
    paypalOrderId: true,
    status: true,
    trackingInfo: true,
    createdAt: true,
    updatedAt: true,
    completedAt: true,
  })
  .extend({
    payoutProcessed: z.boolean().default(false).optional()
  });


// Add seller payout schemas
export const sellerPayouts = pgTable("seller_payouts", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull().references(() => users.id),
  paymentId: integer("payment_id").notNull().references(() => payments.id),
  amount: integer("amount").notNull(),
  paypalPayoutId: text("paypal_payout_id"),
  status: text("status", {
    enum: ["pending", "processing", "completed", "failed"]
  }).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const buyerRequests = pgTable("buyer_requests", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull(),
  title: text("title").notNull(),
  species: text("species").notNull(),
  category: text("category").notNull(),
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
    species: z.string().refine(
      (val) => ["bantam", "standard", "waterfowl", "quail", "other"].includes(val),
      "Invalid species"
    ),
    category: z.string().refine(
      (val) => ["Show Quality", "Purebred & Production", "Fun & Mixed"].includes(val),
      "Invalid category"
    ),
    description: z.string().min(20, "Description must be at least 20 characters"),
  });

// Add types for buyer requests
export type BuyerRequest = typeof buyerRequests.$inferSelect;
export type InsertBuyerRequest = z.infer<typeof insertBuyerRequestSchema>;

export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true,
    role: true,
    email: true,
  })
  .extend({
    email: z.string().email("Invalid email format"),
    role: z.enum(["buyer", "seller"]), // Restrict roles to only buyer and seller for registration
  });

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

// Add insert schema for auctions
export const insertAuctionSchema = createInsertSchema(auctions)
  .omit({
    id: true,
    approved: true,
    currentPrice: true,
    status: true,
    paymentStatus: true,
    paymentDueDate: true,
    winningBidderId: true,
    sellerDecision: true,
    reserveMet: true,
    fulfillmentRequired: true,
  })
  .extend({
    startPrice: z.number().min(1, "Starting price must be at least $1"),
    reservePrice: z.number().min(0, "Reserve price cannot be negative"),
    species: z.string().refine(
      (val) => ["bantam", "standard", "waterfowl", "quail", "other"].includes(val),
      "Invalid species"
    ),
    category: z.string().refine(
      (val) => ["Show Quality", "Purebred & Production", "Fun & Mixed"].includes(val),
      "Invalid category"
    ),
    startDate: z.string().transform(str => new Date(str)),
    endDate: z.string().transform(str => new Date(str)),
    images: z.array(z.string()).optional(),
  });

// Add insert schema for bids
export const insertBidSchema = createInsertSchema(bids)
  .omit({
    id: true,
    timestamp: true,
  })
  .extend({
    amount: z.number().min(1, "Bid amount must be positive"),
  });

export const insertSellerPayoutSchema = createInsertSchema(sellerPayouts)
  .omit({
    id: true,
    paypalPayoutId: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  });

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
export type SellerPayout = typeof sellerPayouts.$inferSelect;
export type InsertSellerPayout = z.infer<typeof insertSellerPayoutSchema>;
export type Fulfillment = typeof fulfillments.$inferSelect;
export type InsertFulfillment = z.infer<typeof insertFulfillmentSchema>;