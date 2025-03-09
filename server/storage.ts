import { users, type User, type InsertUser, auctions, type Auction, type InsertAuction, profiles, type Profile, type InsertProfile, bids, type Bid, type InsertBid, buyerRequests, type BuyerRequest, type InsertBuyerRequest, notifications, type Notification, type InsertNotification, payments, type Payment, type InsertPayment, PaymentStatus, sellerPayouts, type SellerPayout, type InsertSellerPayout } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";
import { Store } from "express-session";
import connectPg from "connect-pg-simple";
import session from "express-session";
import pg from 'pg';
import { comparePasswords } from './utils/password';

function log(message: string, context = "general") {
  console.log(`[STORAGE:${context}] ${message}`);
}

export interface IStorage {
  sessionStore: Store;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;
  hasProfile(userId: number): Promise<boolean>;
  getProfile(userId: number): Promise<Profile | undefined>;
  createProfile(insertProfile: InsertProfile): Promise<Profile>;
  updateProfile(userId: number, profile: Partial<InsertProfile>): Promise<Profile>;
  createAuction(insertAuction: InsertAuction & { sellerId: number }): Promise<Auction>;
  getAuction(id: number): Promise<Auction | undefined>;
  getAuctions(filters?: {
    sellerId?: number;
    approved?: boolean;
    species?: string;
    category?: string;
    status?: string;
  }): Promise<Auction[]>;
  getUsers(filters?: {
    approved?: boolean;
    role?: string;
    lastLoginAfter?: Date;
  }): Promise<User[]>;
  deleteUser(userId: number): Promise<void>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUserId(userId: number): Promise<Notification[]>;
  getLastNotification(): Promise<Notification | undefined>;
  markNotificationAsRead(notificationId: number): Promise<Notification>;
  markAllNotificationsAsRead(userId: number): Promise<void>;
  getUnreadNotificationsCount(userId: number): Promise<number>;
  updateUser(userId: number, updates: Partial<User>): Promise<User>;
  authenticateUser(username: string, password: string): Promise<User | undefined>;
  insertPayment(paymentData: InsertPayment): Promise<Payment>;
  findPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined>;
  updatePaymentStatus(paymentId: number, status: PaymentStatus): Promise<Payment>;
  createSellerPayout(sellerId: number, data: InsertSellerPayout): Promise<SellerPayout>;
  getPaymentsByAuctionId(auctionId: number): Promise<Payment[]>;
  getUserByEmail(email: string): Promise<User | undefined>; 
  deleteBid(bidId: number): Promise<void>;
  deleteBidsForAuction(auctionId: number): Promise<void>;
  updatePayment(paymentId: number, updates: Partial<Payment>): Promise<Payment>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: Store;

  constructor() {
    const PostgresStore = connectPg(session);

    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });

    this.sessionStore = new PostgresStore({
      pool,
      createTableIfMissing: true,
      tableName: 'session'
    });

    log("Session store initialized");
  }

  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, id));
      return user;
    } catch (error) {
      log(`Error getting user ${id}: ${error}`);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));
      return user;
    } catch (error) {
      log(`Error getting user by username ${username}: ${error}`);
      throw error;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values(insertUser)
        .returning();
      return user;
    } catch (error) {
      log(`Error creating user: ${error}`);
      throw error;
    }
  }

  async hasProfile(userId: number): Promise<boolean> {
    try {
      const profile = await this.getProfile(userId);
      return !!profile;
    } catch (error) {
      log(`Error checking profile for user ${userId}: ${error}`);
      return false;
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
      log(`Error getting profile for user ${userId}: ${error}`);
      throw error;
    }
  }

  async createProfile(insertProfile: InsertProfile): Promise<Profile> {
    try {
      const [profile] = await db
        .insert(profiles)
        .values(insertProfile)
        .returning();
      return profile;
    } catch (error) {
      log(`Error creating profile: ${error}`);
      throw error;
    }
  }

  async updateProfile(userId: number, profile: Partial<InsertProfile>): Promise<Profile> {
    try {
      const [updatedProfile] = await db
        .update(profiles)
        .set(profile)
        .where(eq(profiles.userId, userId))
        .returning();
      return updatedProfile;
    } catch (error) {
      log(`Error updating profile: ${error}`);
      throw error;
    }
  }

  async updateSellerStripeAccount(userId: number, data: { accountId: string; status: string }): Promise<Profile> {
    try {
      log(`Updating Stripe account for user ${userId} with account ID ${data.accountId}`);
      const [updatedProfile] = await db
        .update(profiles)
        .set({
          stripeAccountId: data.accountId,
          stripeAccountStatus: data.status
        })
        .where(eq(profiles.userId, userId))
        .returning();

      log(`Successfully updated Stripe account. New status: ${data.status}`);
      return updatedProfile;
    } catch (error) {
      log(`Error updating seller Stripe account: ${error}`);
      throw error;
    }
  }

  async findProfileByStripeAccountId(stripeAccountId: string): Promise<Profile | undefined> {
    try {
      log(`Finding profile by Stripe account ID: ${stripeAccountId}`, "stripe");
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.stripeAccountId, stripeAccountId));
      return profile;
    } catch (error) {
      log(`Error finding profile by Stripe account ID ${stripeAccountId}: ${error}`, "stripe");
      return undefined;
    }
  }

  async createAuction(insertAuction: InsertAuction & { sellerId: number }): Promise<Auction> {
    try {
      const auctionData = {
        ...insertAuction,
        startPrice: Number(insertAuction.startPrice),
        reservePrice: Number(insertAuction.reservePrice),
        currentPrice: Number(insertAuction.startPrice),
        status: "pending_review",
        approved: false,
      };

      const [auction] = await db
        .insert(auctions)
        .values(auctionData)
        .returning();

      return auction;
    } catch (error) {
      log(`Error creating auction: ${error}`);
      throw error;
    }
  }

  async getAuction(id: number): Promise<Auction | undefined> {
    try {
      const [auction] = await db
        .select()
        .from(auctions)
        .where(eq(auctions.id, id));
      return auction;
    } catch (error) {
      log(`Error getting auction ${id}: ${error}`);
      throw error;
    }
  }

  async getAuctions(filters?: {
    sellerId?: number;
    approved?: boolean;
    species?: string;
    category?: string;
    status?: string;
  }): Promise<Auction[]> {
    try {
      log("Getting auctions with filters:", filters);
      let query = db.select().from(auctions);

      if (filters) {
        if (filters.sellerId !== undefined) {
          query = query.where(eq(auctions.sellerId, filters.sellerId));
        }
        if (filters.approved !== undefined) {
          query = query.where(eq(auctions.approved, filters.approved));
        }
        if (filters.species) {
          query = query.where(eq(auctions.species, filters.species));
        }
        if (filters.category) {
          query = query.where(eq(auctions.category, filters.category));
        }
        if (filters.status) {
          query = query.where(eq(auctions.status, filters.status));
        }
      }

      const results = await query;
      log(`Retrieved ${results.length} auctions`);
      return results;
    } catch (error) {
      log(`Error getting auctions: ${error}`);
      throw error;
    }
  }

  async getBidsForAuction(auctionId: number): Promise<Bid[]> {
    try {
      log(`Getting bids for auction ${auctionId}`);
      const results = await db
        .select()
        .from(bids)
        .where(eq(bids.auctionId, auctionId))
        .orderBy(desc(bids.timestamp));

      log(`Found ${results.length} bids for auction ${auctionId}`);
      return results;
    } catch (error) {
      log(`Error getting bids for auction ${auctionId}: ${error}`);
      throw error;
    }
  }

  async getBidsByUser(userId: number): Promise<Bid[]> {
    try {
      log(`Getting bids for user ${userId}`);
      const results = await db
        .select()
        .from(bids)
        .where(eq(bids.bidderId, userId))
        .orderBy(desc(bids.timestamp));

      log(`Found ${results.length} bids for user ${userId}`);
      return results;
    } catch (error) {
      log(`Error getting bids for user ${userId}: ${error}`);
      throw error;
    }
  }

  async createBid(bidData: InsertBid): Promise<Bid> {
    try {
      log(`Creating bid for auction ${bidData.auctionId}`);

      // Start a transaction to ensure bid creation and auction price update are atomic
      const result = await db.transaction(async (tx) => {
        // Insert the bid
        const [bid] = await tx
          .insert(bids)
          .values({
            ...bidData,
            timestamp: new Date(),
          })
          .returning();

        // Update the auction's current price
        await tx
          .update(auctions)
          .set({ currentPrice: bidData.amount })
          .where(eq(auctions.id, bidData.auctionId));

        return bid;
      });

      log(`Successfully created bid ${result.id} for amount ${result.amount}`);
      return result;
    } catch (error) {
      log(`Error creating bid: ${error}`);
      throw error;
    }
  }

  async getUsers(filters?: {
    approved?: boolean;
    role?: string;
    lastLoginAfter?: Date;
  }): Promise<User[]> {
    try {
      log(`Getting users with filters: ${JSON.stringify(filters)}`);
      let query = db.select().from(users);

      if (filters) {
        // Add filter conditions
        if (filters.approved !== undefined) {
          query = query.where(eq(users.approved, filters.approved));
        }
        if (filters.role) {
          query = query.where(eq(users.role, filters.role));
        }
      }

      const results = await query;

      log(`Found ${results.length} users matching filters`);

      return results;
    } catch (error) {
      log(`Error getting users: ${error}`);
      throw error;
    }
  }

  async deleteBid(bidId: number): Promise<void> {
    try {
      log(`Deleting bid ${bidId}`);
      await db.delete(bids).where(eq(bids.id, bidId)).execute();
    } catch (error) {
      log(`Error deleting bid ${bidId}: ${error}`);
      throw error;
    }
  }
  async approveAuction(auctionId: number): Promise<Auction> {
    try {
      // First check if the auction exists
      const existingAuction = await this.getAuction(auctionId);
      if (!existingAuction) {
        throw new Error(`Auction ${auctionId} not found`);
      }

      // If already approved, return the existing auction
      if (existingAuction.approved) {
        return existingAuction;
      }

      log(`Approving auction ${auctionId} - changing status from ${existingAuction.status} to active`);

      // Update the auction status in a transaction
      const [updatedAuction] = await db.transaction(async (tx) => {
        return await tx
          .update(auctions)
          .set({
            approved: true,
            status: "active"
          })
          .where(eq(auctions.id, auctionId))
          .returning();
      });

      if (!updatedAuction) {
        throw new Error(`Failed to update auction ${auctionId}`);
      }

      log(`Successfully approved auction ${auctionId}, new status: ${updatedAuction.status}`);
      return updatedAuction;
    } catch (error) {
      log(`Error approving auction ${auctionId}: ${error}`);
      throw error;
    }
  }

  async updateAuction(auctionId: number, data: Partial<Auction>): Promise<Auction> {
    try {
      const currentAuction = await this.getAuction(auctionId);
      if (!currentAuction) {
        throw new Error(`Auction with id ${auctionId} not found`);
      }

      const formattedData = { ...data };

      // Log incoming data for debugging
      log(`Received update data for auction ${auctionId}:`, {
        startDate: formattedData.startDate,
        endDate: formattedData.endDate
      });

      // Handle date formatting
      if (formattedData.startDate) {
        try {
          // Handle ISO string format from the form
          const startDate = new Date(formattedData.startDate);
          if (isNaN(startDate.getTime())) {
            throw new Error(`Invalid start date: ${formattedData.startDate}`);
          }
          formattedData.startDate = startDate;
          log(`Formatted start date: ${startDate.toISOString()}`);
        } catch (err) {
          log(`Error formatting start date: ${err}`);
          throw new Error(`Invalid start date format: ${formattedData.startDate}`);
        }
      }

      if (formattedData.endDate) {
        try {
          // Handle ISO string format from the form
          const endDate = new Date(formattedData.endDate);
          if (isNaN(endDate.getTime())) {
            throw new Error(`Invalid end date: ${formattedData.endDate}`);
          }
          formattedData.endDate = endDate;
          log(`Formatted end date: ${endDate.toISOString()}`);
        } catch (err) {
          log(`Error formatting end date: ${err}`);
          throw new Error(`Invalid end date format: ${formattedData.endDate}`);
        }
      }

      // Handle price updates
      if (formattedData.startPrice !== undefined) {
        formattedData.startPrice = Number(formattedData.startPrice);
        if (currentAuction.currentPrice === currentAuction.startPrice) {
          formattedData.currentPrice = formattedData.startPrice;
        }
      }

      if (formattedData.reservePrice !== undefined) {
        formattedData.reservePrice = Number(formattedData.reservePrice);
      }

      if (formattedData.currentPrice !== undefined) {
        formattedData.currentPrice = Number(formattedData.currentPrice);
      }

      // Handle images array
      if (formattedData.images) {
        if (!Array.isArray(formattedData.images)) {
          formattedData.images = [formattedData.images];
        }
        if (!formattedData.imageUrl && formattedData.images.length > 0) {
          formattedData.imageUrl = formattedData.images[0];
        }
      }

      // Log the final formatted data
      log(`Final formatted data for auction ${auctionId}:`, formattedData);

      const [updatedAuction] = await db
        .update(auctions)
        .set(formattedData)
        .where(eq(auctions.id, auctionId))
        .returning();

      if (!updatedAuction) {
        throw new Error("Failed to update auction in database");
      }

      log(`Successfully updated auction ${auctionId}`);
      return updatedAuction;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`Error updating auction ${auctionId}: ${errorMessage}`);
      throw error;
    }
  }

  async deleteAuction(auctionId: number): Promise<void> {
    try {
      await db
        .delete(auctions)
        .where(eq(auctions.id, auctionId));
    } catch (error) {
      log(`Error deleting auction ${auctionId}: ${error}`);
      throw error;
    }
  }

  async getNotificationsByUserId(userId: number): Promise<Notification[]> {
    try {
      log(`Getting notifications for user ${userId}`);
      const results = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt));

      log(`Found ${results.length} notifications for user ${userId}`);
      return results;
    } catch (error) {
      log(`Error getting notifications for user ${userId}: ${error}`);
      throw error;
    }
  }

  async getNotificationsByTypeAndReference(type: string, reference: string): Promise<Notification[]> {
    try {
      log(`Getting notifications of type ${type} with reference ${reference}`);
      const results = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.type, type),
            eq(notifications.reference, reference)
          )
        );

      log(`Found ${results.length} notifications of type ${type} with reference ${reference}`);
      return results;
    } catch (error) {
      log(`Error getting notifications by type and reference: ${error}`);
      throw error;
    }
  }

  async getLastNotification(): Promise<Notification | undefined> {
    try {
      const [notification] = await db
        .select()
        .from(notifications)
        .orderBy(desc(notifications.createdAt))
        .limit(1);
      return notification;
    } catch (error) {
      log(`Error getting last notification: ${error}`);
      throw error;
    }
  }

  async markNotificationAsRead(notificationId: number): Promise<Notification> {
    try {
      log(`Marking notification ${notificationId} as read`);
      const [notification] = await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.id, notificationId))
        .returning();
      return notification;
    } catch (error) {
      log(`Error marking notification ${notificationId} as read: ${error}`);
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId: number): Promise<void> {
    try {
      log(`Marking all notifications as read for user ${userId}`);
      await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.userId, userId));
    } catch (error) {
      log(`Error marking all notifications as read for user ${userId}: ${error}`);
      throw error;
    }
  }

  async getUnreadNotificationsCount(userId: number): Promise<number> {
    try {
      const [result] = await db
        .select({ count: db.fn.count() })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.read, false)
          )
        );
      return Number(result.count) || 0;
    } catch (error) {
      log(`Error getting unread notifications count for user ${userId}: ${error}`);
      return 0;
    }
  }

  async getPaymentBySessionId(sessionId: string): Promise<any | undefined> {
    try {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.stripeSessionId, sessionId))
        .limit(1);
      
      return payment;
    } catch (error) {
      console.error(`Error getting payment by session ID ${sessionId}:`, error);
      return undefined;
    }
  }

  async updatePaymentBySessionId(sessionId: string, data: any): Promise<any> {
    try {
      const [updatedPayment] = await db
        .update(payments)
        .set(data)
        .where(eq(payments.stripeSessionId, sessionId))
        .returning();
      
      return updatedPayment;
    } catch (error) {
      console.error(`Error updating payment by session ID ${sessionId}:`, error);
      return { id: 1, sessionId, ...data };
    }
  }

  async updatePaymentByIntentId(intentId: string, data: any): Promise<any> {
    try {
      const [updatedPayment] = await db
        .update(payments)
        .set(data)
        .where(eq(payments.stripePaymentIntentId, intentId))
        .returning();
      
      return updatedPayment;
    } catch (error) {
      console.error(`Error updating payment by intent ID ${intentId}:`, error);
      return { id: 1, intentId, ...data };
    }
  }

  async insertPayment(paymentData: InsertPayment): Promise<Payment> {
    try {
      console.log(`[STORAGE] Inserting payment:`, paymentData);

      // Ensure we have the required stripe_payment_intent_id
      if (!paymentData.stripePaymentIntentId) {
        throw new Error('stripe_payment_intent_id is required');
      }

      const [payment] = await db
        .insert(payments)
        .values({
          ...paymentData,
          status: paymentData.status || 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      console.log(`[STORAGE] Successfully inserted payment:`, {
        id: payment.id,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        status: payment.status
      });

      return payment;
    } catch (error) {
      console.error(`[STORAGE] Error inserting payment:`, error);
      throw error;
    }
  }

  async findPaymentByAuctionId(auctionId: number): Promise<any> {
    try {
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.auctionId, auctionId))
        .limit(1);
      
      return payment;
    } catch (error) {
      console.error(`Error finding payment for auction ${auctionId}:`, error);
      return undefined;
    }
  }

  async markPaymentPayoutProcessed(paymentId: number): Promise<boolean> {
    try {
      await db
        .update(payments)
        .set({ payoutProcessed: true })
        .where(eq(payments.id, paymentId));
      
      return true;
    } catch (error) {
      console.error(`Error marking payment ${paymentId} as processed:`, error);
      return false;
    }
  }

  async getWinnerDetails(auctionId: number): Promise<any | undefined> {
    return undefined;
  }

  async createFulfillment(fulfillmentData: any): Promise<any> {
    return fulfillmentData;
  }

  async getFulfillment(auctionId: number): Promise<any | undefined> {
    return undefined;
  }

  async createBuyerRequest(requestData: InsertBuyerRequest & { buyerId: number }): Promise<BuyerRequest> {
    try {
      log(`Creating buyer request for user ${requestData.buyerId}`);
      const [request] = await db
        .insert(buyerRequests)
        .values({
          ...requestData,
          status: "open",
          views: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      log(`Successfully created buyer request ${request.id}`);
      return request;
    } catch (error) {
      log(`Error creating buyer request: ${error}`);
      throw error;
    }
  }

  async getBuyerRequests(filters?: { status?: string }): Promise<BuyerRequest[]> {
    try {
      log(`Getting buyer requests with filters: ${JSON.stringify(filters)}`);
      let query = db.select().from(buyerRequests);

      if (filters?.status) {
        query = query.where(eq(buyerRequests.status, filters.status));
      }

      query = query.orderBy(desc(buyerRequests.createdAt));

      const requests = await query;
      log(`Found ${requests.length} buyer requests`);
      return requests;
    } catch (error) {
      log(`Error getting buyer requests: ${error}`);
      throw error;
    }
  }

  async getBuyerRequest(id: number): Promise<BuyerRequest | undefined> {
    try {
      log(`[BUYER REQUEST] Getting buyer request ${id}`);
      const [request] = await db
        .select()
        .from(buyerRequests)
        .where(eq(buyerRequests.id, id))
        .limit(1);

      log(`[BUYER REQUEST] Found request: ${JSON.stringify(request)}`);
      return request;
    } catch (error) {
      log(`[BUYER REQUEST] Error getting buyer request ${id}: ${error}`);
      throw error;
    }
  }

  async updateBuyerRequest(id: number, data: Partial<InsertBuyerRequest>): Promise<BuyerRequest> {
    try {
      const [request] = await db
        .update(buyerRequests)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(buyerRequests.id, id))
        .returning();
      return request;
    } catch (error) {
      log(`Error updating buyer request ${id}: ${error}`);
      throw error;
    }
  }

  async deleteBuyerRequest(id: number): Promise<void> {
    try {
      await db
        .delete(buyerRequests)
        .where(eq(buyerRequests.id, id));
    } catch (error) {
      log(`Error deleting buyer request ${id}: ${error}`);
      throw error;
    }
  }

  async incrementBuyerRequestViews(id: number): Promise<void> {
    try {
      await db
        .update(buyerRequests)
        .set({
          views: db.raw('views + 1'),
          updatedAt: new Date(),
        })
        .where(eq(buyerRequests.id, id));
    } catch (error) {
      log(`Error incrementing views for buyer request ${id}: ${error}`);
      throw error;
    }
  }

  async getPayoutsBySeller(sellerId: number): Promise<any[]> {
    return [];
  }

  async approveUser(userId: number): Promise<User> {
    try {
      const [user] = await db
        .update(users)
        .set({ approved: true })
        .where(eq(users.id, userId))
        .returning();
      return user;
    } catch (error) {
      log(`Error approving user ${userId}: ${error}`);
      throw error;
    }
  }

  async deleteProfile(userId: number): Promise<void> {
    try {
      await db
        .delete(profiles)
        .where(eq(profiles.userId, userId));
    } catch (error) {
      log(`Error deleting profile for user ${userId}: ${error}`);
      throw error;
    }
  }

  async deleteUser(userId: number): Promise<void> {
    try {
      log(`Deleting user ${userId}`);

      // Delete in a transaction to ensure both operations succeed or fail together
      await db.transaction(async (tx) => {
        // First delete the profile if it exists
        await tx
          .delete(profiles)
          .where(eq(profiles.userId, userId));

        // Then delete the user
        await tx
          .delete(users)
          .where(eq(users.id, userId));
      });

      log(`Successfully deleted user ${userId} and associated profile`);
    } catch (error) {
      log(`Error deleting user ${userId}: ${error}`);
      throw error;
    }
  }

  async updateUser(userId: number, updates: Partial<User>): Promise<User> {
    log(`Updating user ${userId}`, "users");
    await db.update(users)
      .set(updates)
      .where(eq(users.id, userId));

    const updatedUser = await this.getUser(userId);
    if (!updatedUser) {
      throw new Error(`User ${userId} not found after update`);
    }
    return updatedUser;
  }
  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    try {
      log(`Creating notification`, insertNotification);
      const [notification] = await db
        .insert(notifications)
        .values({
          ...insertNotification,
          read: false,
          createdAt: new Date(),
        })
        .returning();

      log(`Successfully created notification:`, notification);
      return notification;
    } catch (error) {
      log(`Error creating notification: ${error}`);
      throw error;
    }
  }

  async authenticateUser(username: string, password: string): Promise<User | undefined> {
    try {
      log(`Attempting to authenticate user ${username}`, "auth");

      const user = await this.getUserByUsername(username);
      if (!user) {
        log(`User ${username} not found in database`, "auth");
        return undefined;
      }

      log(`Found user ${username}, validating stored password format`, "auth");
      if (!user.password || !user.password.includes('.')) {
        log(`Invalid password format for user ${username}:`, {
          hasPassword: !!user.password,
          format: user.password?.includes('.') ? 'hash.salt' : 'invalid'
        }, "auth");
        return undefined;
      }

      log(`Comparing passwords for user ${username}`, "auth");
      const isValid = await comparePasswords(password, user.password);

      if (!isValid) {
        log(`Invalid password for user ${username}`, "auth");
        return undefined;
      }

      log(`Authentication successful for user ${username}`, "auth");
      return user;
    } catch (error) {
      log(`Error during authentication for user ${username}: ${error}`, "auth");
      throw error;
    }
  }

  async insertPayment(paymentData: InsertPayment): Promise<Payment> {
    try {
      log(`Creating payment record for auction ${paymentData.auctionId}`, "payments");
      const [payment] = await db
        .insert(payments)
        .values(paymentData)
        .returning();

      log(`Payment record created: ${payment.id}`, "payments");
      return payment;
    } catch (error) {
      log(`Error creating payment: ${error}`, "payments");
      throw error;
    }
  }

  async findPaymentByStripeId(stripePaymentIntentId: string): Promise<Payment | undefined> {
    try {
      console.log(`[STORAGE] Finding payment by payment intent ID: ${stripePaymentIntentId}`);
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.stripePaymentIntentId, stripePaymentIntentId));

      console.log(`[STORAGE] Payment lookup result:`, payment);
      return payment;
    } catch (error) {
      console.error(`[STORAGE] Error finding payment by payment intent ID ${stripePaymentIntentId}:`, error);
      throw error;
    }
  }

  async updatePaymentStatus(paymentId: number, status: PaymentStatus): Promise<Payment> {
    try {
      log(`Updating payment ${paymentId} status to ${status}`, "payments");
      const [payment] = await db
        .update(payments)
        .set({ 
          status,
          updatedAt: new Date()
        })
        .where(eq(payments.id, paymentId))
        .returning();

      if (!payment) {
        throw new Error(`Payment ${paymentId} not found`);
      }

      log(`Payment ${paymentId} status updated to ${status}`, "payments");
      return payment;
    } catch (error) {
      log(`Error updating payment status: ${error}`, "payments");
      throw error;
    }
  }

  async createSellerPayout(sellerId: number, data: InsertSellerPayout): Promise<SellerPayout> {
    try {
      log(`Creating seller payout for seller ${sellerId}`, "payouts");
      const [payout] = await db
        .insert(sellerPayouts)
        .values({
          ...data,          sellerId,
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();

      log(`Seller payout created: ${payout.id}`, "payouts");
      return payout;
    } catch (error) {
      log(`Error creating seller payout: ${error}`, "payouts");
      throw error;
    }
  }

  async getPaymentsByAuctionId(auctionId: number): Promise<Payment[]> {
    try {
      log(`Getting payments for auction ${auctionId}`, "payments");
      const result = await db
        .select()
        .from(payments)
        .where(eq(payments.auctionId, auctionId))
        .orderBy(desc(payments.createdAt));

      log(`Found ${result.length} payments for auction ${auctionId}`, "payments");
      return result;
    } catch (error) {
      log(`Error getting payments for auction ${auctionId}: ${error}`, "payments");
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      return user;
    } catch (error) {
      log(`Error getting user by email ${email}: ${error}`);
      throw error;
    }
  }

  async deleteBidsForAuction(auctionId: number): Promise<void> {
    console.log(`[STORAGE] Deleting all bids for auction: ${auctionId}`);
    await db.delete(bids).where(eq(bids.auctionId, auctionId)).execute();
  }
  async updatePayment(paymentId: number, updates: Partial<Payment>): Promise<Payment> {
    try {
      console.log(`[STORAGE] Updating payment ${paymentId}:`, updates);

      const [payment] = await db
        .update(payments)
        .set({
          ...updates,
          updatedAt: new Date()
        })
        .where(eq(payments.id, paymentId))
        .returning();

      console.log(`[STORAGE] Successfully updated payment:`, {
        id: payment.id,
        status: payment.status
      });

      return payment;
    } catch (error) {
      console.error(`[STORAGE] Error updating payment ${paymentId}:`, error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();