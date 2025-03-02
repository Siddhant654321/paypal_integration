import { pgTable, text, serial, integer, boolean, timestamp, decimal } from "drizzle-orm/pg-core";
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
  emailBidNotifications: boolean("email_bid_notifications").notNull().default(true),
  emailAuctionNotifications: boolean("email_auction_notifications").notNull().default(true),
  emailPaymentNotifications: boolean("email_payment_notifications").notNull().default(true),
  emailAdminNotifications: boolean("email_admin_notifications").notNull().default(true),
  businessName: text("business_name"),
  breedSpecialty: text("breed_specialty"),
  npipNumber: text("npip_number"),
  stripeAccountId: text("stripe_account_id"),
  stripeAccountStatus: text("stripe_account_status", {
    enum: ["pending", "verified", "not_started"]
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const sellerDecisionEnum = z.enum(["accept", "void"]);

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
});

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
  startPrice: decimal("start_price", { precision: 10, scale: 2 }).notNull(),
  reservePrice: decimal("reserve_price", { precision: 10, scale: 2 }).notNull(),
  currentPrice: decimal("current_price", { precision: 10, scale: 2 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  approved: boolean("approved").notNull().default(false),
  status: text("status", {
    enum: [
      "draft",
      "pending_review",
      "active",
      "ended",
      "pending_seller_decision",
      "payment_pending",
      "pending_fulfillment",
      "fulfilled",
      "voided"
    ],
  }).notNull().default("draft"),
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
  insuranceSelected: boolean("insurance_selected").notNull().default(false),
  adminNotes: text("admin_notes"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
});

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
    fulfillmentRequired: true,
    insuranceSelected: true,
    adminNotes: true,
    reviewedBy: true,
    reviewedAt: true,
  })
  .extend({
    title: z.string().min(5, "Title must be at least 5 characters"),
    description: z.string().min(20, "Description must be at least 20 characters"),
    startPrice: z
      .number()
      .min(0.01, "Start price must be at least $0.01")
      .transform((price) => parseFloat(price.toFixed(2))),
    reservePrice: z
      .number()
      .min(0.01, "Reserve price must be at least $0.01")
      .transform((price) => parseFloat(price.toFixed(2))),
    startDate: z.string().transform((str) => new Date(str)),
    endDate: z.string().transform((str) => new Date(str)),
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

export const bids = pgTable("bids", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull(),
  bidderId: integer("bidder_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  timestamp: timestamp("timestamp").notNull(),
});

export const insertBidSchema = createInsertSchema(bids)
  .omit({
    id: true,
    timestamp: true,
  })
  .extend({
    amount: z
      .number()
      .min(0.01, "Bid amount must be at least $0.01")
      .transform((amount) => parseFloat(amount.toFixed(2))),
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
    stripeAccountId: true,
    stripeAccountStatus: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    userId: z.number(),
    fullName: z.string().min(2, "Full name must be at least 2 characters"),
    email: z.string().email("Invalid email format"),
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
    emailBidNotifications: z.boolean().default(true),
    emailAuctionNotifications: z.boolean().default(true),
    emailPaymentNotifications: z.boolean().default(true),
    emailAdminNotifications: z.boolean().default(true),
  });

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;

export const insertPaymentSchema = createInsertSchema(payments)
  .omit({
    id: true,
    stripePaymentIntentId: true,
    stripeTransferId: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  });

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
  category: text("category").notNull(),
  description: text("description").notNull(),
  status: text("status", {
    enum: ["open", "fulfilled", "closed"]
  }).notNull().default("open"),
  views: integer("views").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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