import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["buyer", "seller", "admin", "seller_admin"] }).notNull(),
  approved: boolean("approved").notNull().default(false),
});

export const auctions = pgTable("auctions", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  species: text("species").notNull(),
  category: text("category", { enum: ["quality", "production", "fun"] }).notNull(),
  imageUrl: text("imageUrl").notNull(), // Changed from image_url to imageUrl to match the database
  images: text("images").array().notNull().default([]), // New field for multiple images
  startPrice: integer("start_price").notNull(),
  reservePrice: integer("reserve_price").notNull(),
  currentPrice: integer("current_price").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  approved: boolean("approved").notNull().default(false),
});

export const bids = pgTable("bids", {
  id: serial("id").primaryKey(),
  auctionId: integer("auction_id").notNull(),
  bidderId: integer("bidder_id").notNull(),
  amount: integer("amount").notNull(),
  timestamp: timestamp("timestamp").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
});

// Enhanced auction schema with additional validations
export const insertAuctionSchema = createInsertSchema(auctions)
  .omit({
    id: true,
    approved: true,
    currentPrice: true,
    sellerId: true,
  })
  .extend({
    title: z.string().min(5, "Title must be at least 5 characters"),
    description: z.string().min(20, "Description must be at least 20 characters"),
    startPrice: z.number().min(1, "Start price must be at least 1"),
    reservePrice: z.number().min(1, "Reserve price must be at least 1"),
    startDate: z.string().transform((str) => new Date(str)),
    endDate: z.string().transform((str) => new Date(str)),
    imageUrl: z.string(), // No default value
    images: z.array(z.string()).optional().default([]), // Make optional for validation, default to empty array
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

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Auction = typeof auctions.$inferSelect;
export type InsertAuction = z.infer<typeof insertAuctionSchema>;
export type Bid = typeof bids.$inferSelect;
export type InsertBid = z.infer<typeof insertBidSchema>;