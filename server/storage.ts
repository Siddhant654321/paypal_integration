import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { db } from "./db";
import { users, auctions, bids, profiles, payments, payouts, fulfillments, buyerRequests, notifications } from "@shared/schema";
import { type User, type InsertUser, type Auction, type InsertAuction, type Bid, type InsertBid, type Profile, type InsertProfile, type Payment, type InsertPayment, type Payout, type InsertPayout, type Fulfillment, type InsertFulfillment, type BuyerRequest, type InsertBuyerRequest, type Notification, type InsertNotification } from "@shared/schema";
import { eq, sql, desc, and } from "drizzle-orm";
import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { log } from "./vite";

const connectPg = connectPgSimple;
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

  // Fulfillment operations
  createFulfillment(fulfillment: InsertFulfillment): Promise<Fulfillment>;
  getFulfillment(auctionId: number): Promise<Fulfillment | undefined>;
  getWinnerDetails(auctionId: number): Promise<{
    profile: Profile;
    auction: Auction;
  } | undefined>;
  updateAuctionFulfillmentStatus(auctionId: number, fulfilled: boolean): Promise<void>;

  // Buyer request operations
  createBuyerRequest(request: InsertBuyerRequest & { buyerId: number }): Promise<BuyerRequest>;
  getBuyerRequest(id: number): Promise<BuyerRequest | undefined>;
  getBuyerRequests(filters?: {
    status?: string;
    buyerId?: number;
  }): Promise<BuyerRequest[]>;
  updateBuyerRequestStatus(id: number, status: string): Promise<BuyerRequest>;
  incrementBuyerRequestViews(id: number): Promise<void>;

  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUserId(userId: number): Promise<Notification[]>;
  markNotificationAsRead(id: number): Promise<Notification>;
  deleteNotification(id: number): Promise<void>;
  getUnreadNotificationsCount(userId: number): Promise<number>;
  markAllNotificationsAsRead(userId: number): Promise<void>; //added method
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
      // Map legacy categories to new format if present
      let category = insertAuction.category;
      const categoryMap = {
        "show": "Show Quality",
        "purebred": "Purebred & Production",
        "fun": "Fun & Mixed"
      };

      if (categoryMap[category]) {
        category = categoryMap[category];
        console.log(`Mapped category from ${insertAuction.category} to ${category}`);
      }

      const [auction] = await db
        .insert(auctions)
        .values({
          ...insertAuction,
          category: category,
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

      if (filters) {
        if (filters.species) {
          query = query.where(eq(auctions.species, filters.species));
        }
        if (filters.category) {
          query = query.where(eq(auctions.category, filters.category));
        }
        if (filters.approved !== undefined) {
          query = query.where(eq(auctions.approved, filters.approved));
        }
        if (filters.sellerId !== undefined) {
          query = query.where(eq(auctions.sellerId, filters.sellerId));
        }
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
      let query = db
        .select({
          user: users,
          profile: profiles,
        })
        .from(users)
        .leftJoin(profiles, eq(users.id, profiles.userId));

      if (filters) {
        if (filters.approved !== undefined) {
          query = query.where(eq(users.approved, filters.approved));
        }
        if (filters.role) {
          query = query.where(eq(users.role, filters.role));
        }
      }

      const results = await query;
      const formattedUsers = results.map(({ user }) => user);

      log(`Retrieved ${formattedUsers.length} users with filters: ${JSON.stringify(filters)}`, "storage");
      return formattedUsers;
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
      // Create a clean update object
      const updateData: any = {};

      // Copy safe fields
      if (data.title) updateData.title = data.title;
      if (data.description) updateData.description = data.description;
      if (data.species) updateData.species = data.species;
      if (data.imageUrl) updateData.imageUrl = data.imageUrl;
      if (data.images) updateData.images = data.images;
      
      // Handle auction status fields
      if (data.status) updateData.status = data.status;
      if (data.reserveMet !== undefined) updateData.reserveMet = data.reserveMet;
      if (data.paymentStatus) updateData.paymentStatus = data.paymentStatus;
      if (data.winningBidderId !== undefined) updateData.winningBidderId = data.winningBidderId;
      if (data.paymentDueDate) updateData.paymentDueDate = new Date(data.paymentDueDate);
      if (data.updatedAt) updateData.updatedAt = new Date(data.updatedAt);
      
      // Always include updatedAt to prevent empty update errors
      if (Object.keys(updateData).length === 0) {
        updateData.updatedAt = new Date();
      }

      // Handle price fields
      // Important: directly check against undefined to handle cases where the value is 0
      if (data.startPrice !== undefined) {
        console.log(`Setting startPrice to ${data.startPrice} (${typeof data.startPrice})`);
        // Just use the value as-is - client already converted to cents
        updateData.startPrice = Number(data.startPrice);

        // Also update currentPrice if this is a starting price change
        const auction = await this.getAuction(auctionId);
        if (auction && auction.currentPrice === auction.startPrice) {
          updateData.currentPrice = Number(data.startPrice);
        }
      }

      if (data.reservePrice !== undefined) {
        console.log(`Setting reservePrice to ${data.reservePrice} (${typeof data.reservePrice})`);
        updateData.reservePrice = Number(data.reservePrice);
      }

      // Handle dates
      if (data.startDate) updateData.startDate = new Date(data.startDate);
      if (data.endDate) updateData.endDate = new Date(data.endDate);

      // Handle category with strict validation
      if (data.category) {
        // Map old category values to new ones
        const categoryMap = {
          "show": "Show Quality",
          "purebred": "Purebred & Production",
          "fun": "Fun & Mixed",
          // Already include the new values too
          "Show Quality": "Show Quality",
          "Purebred & Production": "Purebred & Production",
          "Fun & Mixed": "Fun & Mixed"
        };

        // Convert and validate category
        const mappedCategory = categoryMap[data.category];
        if (!mappedCategory) {
          throw new Error("Invalid category. Must be one of: Show Quality, Purebred & Production, Fun & Mixed");
        }

        updateData.category = mappedCategory;
        log(`Mapped category '${data.category}' to '${mappedCategory}'`, "storage");
      }

      const [updatedAuction] = await db
        .update(auctions)
        .set({
          ...updateData,
          startDate: updateData.startDate ? new Date(updateData.startDate) : undefined,
          endDate: updateData.endDate ? new Date(updateData.endDate) : undefined,
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

  async createFulfillment(fulfillment: InsertFulfillment): Promise<Fulfillment> {
    try {
      const [newFulfillment] = await db
        .insert(fulfillments)
        .values({
          ...fulfillment,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Update auction status
      await this.updateAuctionFulfillmentStatus(fulfillment.auctionId, true);

      return newFulfillment;
    } catch (error) {
      console.error("Error creating fulfillment:", error);
      throw error;
    }
  }

  async getFulfillment(auctionId: number): Promise<Fulfillment | undefined> {
    try {
      const [fulfillment] = await db
        .select()
        .from(fulfillments)
        .where(eq(fulfillments.auctionId, auctionId));
      return fulfillment;
    } catch (error) {
      console.error("Error getting fulfillment:", error);
      throw error;
    }
  }

  async getWinnerDetails(auctionId: number): Promise<{
    profile: Profile;
    auction: Auction;
  } | undefined> {
    try {
      const auction = await this.getAuction(auctionId);
      if (!auction?.winningBidderId) {
        return undefined;
      }

      const winnerProfile = await this.getProfile(auction.winningBidderId);
      if (!winnerProfile) {
        return undefined;
      }

      return {
        profile: winnerProfile,
        auction,
      };
    } catch (error) {
      console.error("Error getting winner details:", error);
      throw error;
    }
  }

  async updateAuctionFulfillmentStatus(auctionId: number, fulfilled: boolean): Promise<void> {
    try {
      await db
        .update(auctions)
        .set({
          status: fulfilled ? "fulfilled" : "pending_fulfillment",
          fulfillmentRequired: true,
        })
        .where(eq(auctions.id, auctionId));
    } catch (error) {
      console.error("Error updating auction fulfillment status:", error);
      throw error;
    }
  }

  async createBuyerRequest(request: InsertBuyerRequest & { buyerId: number }): Promise<BuyerRequest> {
    try {
      const [newRequest] = await db
        .insert(buyerRequests)
        .values({
          ...request,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return newRequest;
    } catch (error) {
      log(`Error creating buyer request: ${error}`, "storage");
      throw error;
    }
  }

  async getBuyerRequest(id: number): Promise<BuyerRequest | undefined> {
    try {
      const [request] = await db
        .select()
        .from(buyerRequests)
        .where(eq(buyerRequests.id, id));
      return request;
    } catch (error) {
      log(`Error getting buyer request ${id}: ${error}`, "storage");
      throw error;
    }
  }

  async getBuyerRequests(filters?: {
    status?: string;
    buyerId?: number;
  }): Promise<BuyerRequest[]> {
    try {
      let query = db.select().from(buyerRequests);

      if (filters) {
        if (filters.status) {
          query = query.where(eq(buyerRequests.status, filters.status));
        }
        if (filters.buyerId !== undefined) {
          query = query.where(eq(buyerRequests.buyerId, filters.buyerId));
        }
      }

      const results = await query.orderBy(desc(buyerRequests.createdAt));
      return results;
    } catch (error) {
      log(`Error getting buyer requests: ${error}`, "storage");
      throw error;
    }
  }

  async updateBuyerRequestStatus(id: number, status: string): Promise<BuyerRequest> {
    try {
      const [request] = await db
        .update(buyerRequests)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(buyerRequests.id, id))
        .returning();
      if (!request) throw new Error("Buyer request not found");
      return request;
    } catch (error) {
      log(`Error updating buyer request status ${id}: ${error}`, "storage");
      throw error;
    }
  }

  async incrementBuyerRequestViews(id: number): Promise<void> {
    try {
      await db
        .update(buyerRequests)
        .set({
          views: sql`${buyerRequests.views} + 1`,
        })
        .where(eq(buyerRequests.id, id));
    } catch (error) {
      log(`Error incrementing buyer request views ${id}: ${error}`, "storage");
      throw error;
    }
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    try {
      log(`[STORAGE] Creating notification: ${JSON.stringify(notification)}`, "notification");

      // Ensure we have all required fields
      if (!notification.userId || !notification.type || !notification.title || !notification.message) {
        throw new Error(`Missing required notification fields: ${JSON.stringify(notification)}`);
      }

      const [createdNotification] = await db
        .insert(notifications)
        .values({
          ...notification,
          read: false,
          createdAt: new Date(),
        })
        .returning();

      log(`[STORAGE] Successfully created notification: ${JSON.stringify(createdNotification)}`, "notification");
      return createdNotification;
    } catch (error) {
      log(`[STORAGE] Error creating notification: ${error}`, "notification");
      console.error('[STORAGE] Full notification error:', {
        error,
        stack: error instanceof Error ? error.stack : undefined,
        notification
      });
      throw error;
    }
  }

  async getNotificationsByUserId(userId: number): Promise<Notification[]> {
    try {
      log(`[STORAGE] Fetching notifications for user ${userId}`, "notification");

      const results = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt));

      log(`[STORAGE] Retrieved ${results.length} notifications for user ${userId}`, "notification");
      return results;
    } catch (error) {
      log(`[STORAGE] Error getting notifications for user ${userId}: ${error}`, "notification");
      throw error;
    }
  }

  async markNotificationAsRead(id: number): Promise<Notification> {
    try {
      const [notification] = await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.id, id))
        .returning();
      if (!notification) throw new Error("Notification not found");
      return notification;
    } catch (error) {
      log(`Error marking notification ${id} as read: ${error}`, "storage");
      throw error;
    }
  }

  async deleteNotification(id: number): Promise<void> {
    try {
      await db
        .delete(notifications)
        .where(eq(notifications.id, id));
    } catch (error) {
      log(`Error deleting notification ${id}: ${error}`, "storage");
      throw error;
    }
  }

  async getUnreadNotificationsCount(userId: number): Promise<number> {
    try {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.read, false)
          )
        );
      return Number(result[0]?.count || 0);
    } catch (error) {
      log(`Error getting unread notifications count for user ${userId}: ${error}`, "storage");
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId: number): Promise<void> {
    try {
      await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.userId, userId));
    } catch (error) {
      log(`Error marking all notifications as read for user ${userId}: ${error}`, "storage");
      throw error;
    }
  }

}

export const storage = new DatabaseStorage();