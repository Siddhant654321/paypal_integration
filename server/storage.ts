import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { db } from "./db";
import { users, auctions, bids, profiles, payments, payouts } from "@shared/schema";
import { type User, type InsertUser, type Auction, type InsertAuction, type Bid, type InsertBid, type Profile, type InsertProfile, type Payment, type InsertPayment, type Payout, type InsertPayout } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import { log } from "./vite";

const PostgresSessionStore = connectPg(session);

// Add these new methods to the IStorage interface
export interface IStorage {
  sessionStore: session.Store;

  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  approveUser(id: number): Promise<User>;
  getUsers(filters?: {
    approved?: boolean;
    role?: string;
  }): Promise<User[]>;

  // Auction operations
  createAuction(auction: InsertAuction & { sellerId: number }): Promise<Auction>;
  getAuction(id: number): Promise<Auction | undefined>;
  getAuctions(filters?: {
    species?: string;
    category?: string;
    approved?: boolean;
    sellerId?: number;
  }): Promise<Auction[]>;
  approveAuction(id: number): Promise<Auction>;

  // Bid operations
  createBid(bid: InsertBid): Promise<Bid>;
  getBidsForAuction(auctionId: number): Promise<Bid[]>;
  getBidsByUser(userId: number): Promise<Bid[]>; // Added method

  // Profile operations
  createProfile(profile: InsertProfile & { userId: number }): Promise<Profile>;
  getProfile(userId: number): Promise<Profile | undefined>;
  hasProfile(userId: number): Promise<boolean>;
  updateProfile(userId: number, profile: Partial<InsertProfile>): Promise<Profile>;

  // Admin operations
  deleteProfile(userId: number): Promise<void>;
  deleteAuction(auctionId: number): Promise<void>;
  deleteBid(bidId: number): Promise<void>;
  updateAuction(auctionId: number, data: Partial<InsertAuction>): Promise<Auction>;

  // Payment operations
  createPayment(payment: InsertPayment & { stripePaymentIntentId: string }): Promise<Payment>;
  getPayment(id: number): Promise<Payment | undefined>;
  getPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined>;
  updatePayment(id: number, data: Partial<Payment>): Promise<Payment>;
  updateAuctionPaymentStatus(auctionId: number, status: string, winningBidderId?: number): Promise<void>;

  // Payout operations
  createPayout(payout: InsertPayout & { stripeTransferId: string }): Promise<Payout>;
  getPayoutsBySeller(sellerId: number): Promise<Payout[]>;
  updatePayoutStatus(id: number, status: string): Promise<Payout>;

  // Profile operations with Stripe Connect fields
  updateProfileStripeAccount(userId: number, stripeAccountId: string, status: string): Promise<Profile>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      log(`Error getting user ${id}: ${error}`, "storage");
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user;
    } catch (error) {
      log(`Error getting user by username ${username}: ${error}`, "storage");
      throw error;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values({
          ...insertUser,
          approved: insertUser.role === "buyer", // Auto-approve buyers
        })
        .returning();
      return user;
    } catch (error) {
      log(`Error creating user: ${error}`, "storage");
      throw error;
    }
  }

  async approveUser(id: number): Promise<User> {
    try {
      const [user] = await db
        .update(users)
        .set({ approved: true })
        .where(eq(users.id, id))
        .returning();
      if (!user) throw new Error("User not found");
      return user;
    } catch (error) {
      log(`Error approving user ${id}: ${error}`, "storage");
      throw error;
    }
  }

  async createAuction(insertAuction: InsertAuction & { sellerId: number }): Promise<Auction> {
    try {
      const [auction] = await db
        .insert(auctions)
        .values({
          ...insertAuction,
          currentPrice: insertAuction.startPrice,
          approved: false,
          startDate: new Date(insertAuction.startDate),
          endDate: new Date(insertAuction.endDate),
        })
        .returning();
      return auction;
    } catch (error) {
      log(`Error creating auction: ${error}`, "storage");
      throw error;
    }
  }

  async getAuction(id: number): Promise<Auction | undefined> {
    try {
      const [auction] = await db.select().from(auctions).where(eq(auctions.id, id));
      return auction;
    } catch (error) {
      log(`Error getting auction ${id}: ${error}`, "storage");
      throw error;
    }
  }

  async getAuctions(filters?: {
    species?: string;
    category?: string;
    approved?: boolean;
    sellerId?: number;
  }): Promise<Auction[]> {
    try {
      let query = db.select().from(auctions);
      const conditions = [];

      if (filters) {
        if (filters.species) {
          conditions.push(eq(auctions.species, filters.species));
        }
        if (filters.category) {
          conditions.push(eq(auctions.category, filters.category));
        }
        if (filters.approved !== undefined) {
          conditions.push(eq(auctions.approved, filters.approved));
        }
        if (filters.sellerId !== undefined) {
          conditions.push(eq(auctions.sellerId, filters.sellerId));
        }
      }

      if (conditions.length > 0) {
        query = query.where(sql`${conditions[0]}${sql.join(conditions.slice(1), sql` AND `)}`);
      }

      const results = await query;
      log(`Retrieved ${results.length} auctions with filters: ${JSON.stringify(filters)}`, "storage");
      return results;
    } catch (error) {
      log(`Error getting auctions: ${error}`, "storage");
      throw error;
    }
  }

  async approveAuction(id: number): Promise<Auction> {
    try {
      const [auction] = await db
        .update(auctions)
        .set({ approved: true })
        .where(eq(auctions.id, id))
        .returning();
      if (!auction) throw new Error("Auction not found");
      return auction;
    } catch (error) {
      log(`Error approving auction ${id}: ${error}`, "storage");
      throw error;
    }
  }

  async createBid(insertBid: InsertBid): Promise<Bid> {
    try {
      return await db.transaction(async (tx) => {
        const [bid] = await tx
          .insert(bids)
          .values({
            ...insertBid,
            timestamp: new Date(),
          })
          .returning();

        await tx
          .update(auctions)
          .set({ currentPrice: insertBid.amount })
          .where(eq(auctions.id, insertBid.auctionId));

        return bid;
      });
    } catch (error) {
      log(`Error creating bid: ${error}`, "storage");
      throw error;
    }
  }

  async getBidsForAuction(auctionId: number): Promise<Bid[]> {
    try {
      return await db
        .select()
        .from(bids)
        .where(eq(bids.auctionId, auctionId))
        .orderBy(bids.timestamp, "desc");
    } catch (error) {
      log(`Error getting bids for auction ${auctionId}: ${error}`, "storage");
      throw error;
    }
  }

  async getBidsByUser(userId: number): Promise<Bid[]> { // Added method
    try {
      return await db
        .select()
        .from(bids)
        .where(eq(bids.bidderId, userId))
        .orderBy(bids.timestamp, "desc");
    } catch (error) {
      log(`Error getting bids for user ${userId}: ${error}`, "storage");
      throw error;
    }
  }

  async createProfile(profile: InsertProfile & { userId: number }): Promise<Profile> {
    try {
      const [createdProfile] = await db
        .insert(profiles)
        .values({
          ...profile,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Update user hasProfile flag
      await db
        .update(users)
        .set({ hasProfile: true })
        .where(eq(users.id, profile.userId));

      return createdProfile;
    } catch (error) {
      log(`Error creating profile: ${error}`, "storage");
      throw error;
    }
  }

  async getProfile(userId: number): Promise<Profile | undefined> {
    try {
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId));
      return profile;
    } catch (error) {
      log(`Error getting profile for user ${userId}: ${error}`, "storage");
      throw error;
    }
  }

  async hasProfile(userId: number): Promise<boolean> {
    try {
      const user = await this.getUser(userId);
      return user?.hasProfile ?? false;
    } catch (error) {
      log(`Error checking profile status for user ${userId}: ${error}`, "storage");
      throw error;
    }
  }

  async getUsers(filters?: {
    approved?: boolean;
    role?: string;
  }): Promise<User[]> {
    try {
      let query = db.select().from(users);
      const conditions = [];

      if (filters) {
        if (filters.approved !== undefined) {
          conditions.push(eq(users.approved, filters.approved));
        }
        if (filters.role) {
          conditions.push(eq(users.role, filters.role.toLowerCase()));
        }
      }

      if (conditions.length > 0) {
        query = query.where(sql`${conditions[0]}${sql.join(conditions.slice(1), sql` AND `)}`);
      }

      log(`Fetching users with filters: ${JSON.stringify(filters)}`, "storage");
      const results = await query;
      log(`Retrieved ${results.length} users`, "storage");
      return results;
    } catch (error) {
      log(`Error getting users: ${error}`, "storage");
      throw error;
    }
  }
  async updateProfile(userId: number, profile: Partial<InsertProfile>): Promise<Profile> {
    try {
      const [updatedProfile] = await db
        .update(profiles)
        .set({
          ...profile,
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, userId))
        .returning();

      if (!updatedProfile) {
        throw new Error("Profile not found");
      }

      return updatedProfile;
    } catch (error) {
      log(`Error updating profile for user ${userId}: ${error}`, "storage");
      throw error;
    }
  }

  async deleteProfile(userId: number): Promise<void> {
    try {
      await db
        .delete(profiles)
        .where(eq(profiles.userId, userId));

      // Update user hasProfile flag
      await db
        .update(users)
        .set({ hasProfile: false })
        .where(eq(users.id, userId));
    } catch (error) {
      log(`Error deleting profile for user ${userId}: ${error}`, "storage");
      throw error;
    }
  }

  async deleteAuction(auctionId: number): Promise<void> {
    try {
      // First delete all bids associated with this auction
      await db
        .delete(bids)
        .where(eq(bids.auctionId, auctionId));

      // Then delete the auction
      await db
        .delete(auctions)
        .where(eq(auctions.id, auctionId));
    } catch (error) {
      log(`Error deleting auction ${auctionId}: ${error}`, "storage");
      throw error;
    }
  }

  async deleteBid(bidId: number): Promise<void> {
    try {
      await db
        .delete(bids)
        .where(eq(bids.id, bidId));
    } catch (error) {
      log(`Error deleting bid ${bidId}: ${error}`, "storage");
      throw error;
    }
  }

  async updateAuction(auctionId: number, data: Partial<InsertAuction>): Promise<Auction> {
    try {
      const [updatedAuction] = await db
        .update(auctions)
        .set({
          ...data,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
        })
        .where(eq(auctions.id, auctionId))
        .returning();

      if (!updatedAuction) {
        throw new Error("Auction not found");
      }

      return updatedAuction;
    } catch (error) {
      log(`Error updating auction ${auctionId}: ${error}`, "storage");
      throw error;
    }
  }

  async createPayment(payment: InsertPayment & { stripePaymentIntentId: string }): Promise<Payment> {
    try {
      const [newPayment] = await db
        .insert(payments)
        .values({
          ...payment,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return newPayment;
    } catch (error) {
      log(`Error creating payment: ${error}`, "storage");
      throw error;
    }
  }

  async getPayment(id: number): Promise<Payment | undefined> {
    try {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.id, id));
      return payment;
    } catch (error) {
      log(`Error getting payment ${id}: ${error}`, "storage");
      throw error;
    }
  }

  async getPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined> {
    try {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.stripePaymentIntentId, stripePaymentIntentId));
      return payment;
    } catch (error) {
      log(`Error getting payment by Stripe ID ${stripePaymentIntentId}: ${error}`, "storage");
      throw error;
    }
  }

  async updatePayment(id: number, data: Partial<Payment>): Promise<Payment> {
    try {
      const [payment] = await db
        .update(payments)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, id))
        .returning();
      if (!payment) throw new Error("Payment not found");
      return payment;
    } catch (error) {
      log(`Error updating payment ${id}: ${error}`, "storage");
      throw error;
    }
  }

  async updateAuctionPaymentStatus(
    auctionId: number,
    status: string,
    winningBidderId?: number
  ): Promise<void> {
    try {
      const updateData: any = {
        paymentStatus: status,
      };

      if (winningBidderId !== undefined) {
        updateData.winningBidderId = winningBidderId;
      }

      await db
        .update(auctions)
        .set(updateData)
        .where(eq(auctions.id, auctionId));
    } catch (error) {
      log(`Error updating auction payment status ${auctionId}: ${error}`, "storage");
      throw error;
    }
  }

  async createPayout(payout: InsertPayout & { stripeTransferId: string }): Promise<Payout> {
    try {
      const [newPayout] = await db
        .insert(payouts)
        .values({
          ...payout,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return newPayout;
    } catch (error) {
      console.error("Error creating payout:", error);
      throw error;
    }
  }

  async getPayoutsBySeller(sellerId: number): Promise<Payout[]> {
    try {
      return await db
        .select()
        .from(payouts)
        .where(eq(payouts.sellerId, sellerId))
        .orderBy(desc(payouts.createdAt));
    } catch (error) {
      console.error("Error getting payouts for seller:", error);
      throw error;
    }
  }

  async updatePayoutStatus(id: number, status: string): Promise<Payout> {
    try {
      const [payout] = await db
        .update(payouts)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(payouts.id, id))
        .returning();
      if (!payout) throw new Error("Payout not found");
      return payout;
    } catch (error) {
      console.error("Error updating payout status:", error);
      throw error;
    }
  }

  async updateProfileStripeAccount(userId: number, stripeAccountId: string, status: string): Promise<Profile> {
    try {
      const [profile] = await db
        .update(profiles)
        .set({
          stripeAccountId,
          stripeAccountStatus: status,
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, userId))
        .returning();
      if (!profile) throw new Error("Profile not found");
      return profile;
    } catch (error) {
      console.error("Error updating profile Stripe account:", error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();