import { users, type User, type InsertUser, auctions, type Auction, type InsertAuction, profiles, type Profile, type InsertProfile } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { Store } from "express-session";
import connectPg from "connect-pg-simple";
import session from "express-session";
import pg from 'pg';

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
  }): Promise<Auction[]>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: Store;

  constructor() {
    const PostgresStore = connectPg(session);

    // Create a new pg Pool using the DATABASE_URL
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Initialize the session store with the pool
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

  async createAuction(insertAuction: InsertAuction & { sellerId: number }): Promise<Auction> {
    try {
      // Ensure dates are properly formatted by creating actual Date objects
      const formattedAuction = {
        ...insertAuction,
        startDate: typeof insertAuction.startDate === 'string' ? 
          new Date(insertAuction.startDate) : insertAuction.startDate,
        endDate: typeof insertAuction.endDate === 'string' ? 
          new Date(insertAuction.endDate) : insertAuction.endDate,
        currentPrice: insertAuction.startPrice, // Set initial current price to start price
        status: insertAuction.status || "pending" // Set default status to pending
      };
      
      console.log("[STORAGE] Creating auction with formatted data:", {
        title: formattedAuction.title,
        sellerId: formattedAuction.sellerId,
        startDate: formattedAuction.startDate,
        endDate: formattedAuction.endDate,
        status: formattedAuction.status
      });
      
      const [auction] = await db
        .insert(auctions)
        .values(formattedAuction)
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
      console.log(`Retrieved ${results.length} auctions with filters:`, filters);
      return results;
    } catch (error) {
      log(`Error getting auctions: ${error}`);
      throw error;
    }
  }

  // Implementation for getBidsForAuction
  async getBidsForAuction(auctionId: number): Promise<any[]> {
    try {
      // This is a placeholder implementation. 
      // Implement this with the actual bids table when available
      log(`Getting bids for auction ${auctionId}`);
      return []; // Return empty array for now
    } catch (error) {
      log(`Error getting bids for auction ${auctionId}: ${error}`);
      throw error;
    }
  }

  // Implementation for getBidsByUser
  async getBidsByUser(userId: number): Promise<any[]> {
    try {
      log(`Getting bids for user ${userId}`);
      return []; // Return empty array for now
    } catch (error) {
      log(`Error getting bids for user ${userId}: ${error}`);
      throw error;
    }
  }

  // Implementation for createBid
  async createBid(bid: any): Promise<any> {
    try {
      log(`Creating bid for auction ${bid.auctionId}`);
      return bid; // Just return the bid data for now
    } catch (error) {
      log(`Error creating bid: ${error}`);
      throw error;
    }
  }

  // Implementation for getUsers
  async getUsers(filters?: { 
    approved?: boolean;
    role?: string;
    lastLoginAfter?: Date;
  }): Promise<User[]> {
    try {
      log(`Getting users with filters: ${JSON.stringify(filters)}`);
      // Filter users based on provided criteria
      let query = db.select().from(users);
      
      if (filters) {
        if (filters.approved !== undefined) {
          query = query.where(eq(users.approved, filters.approved));
        }
        if (filters.role) {
          query = query.where(eq(users.role, filters.role));
        }
        // Note: lastLoginAfter would require a lastLogin field which is not implemented
      }
      
      return await query;
    } catch (error) {
      log(`Error getting users: ${error}`);
      throw error;
    }
  }

  // Implementation for deleteBid
  async deleteBid(bidId: number): Promise<void> {
    try {
      log(`Deleting bid ${bidId}`);
      // Implement actual deletion when bid table is available
    } catch (error) {
      log(`Error deleting bid ${bidId}: ${error}`);
      throw error;
    }
  }
  async approveAuction(auctionId: number): Promise<Auction> {
    try {
      const [auction] = await db
        .update(auctions)
        .set({ approved: true })
        .where(eq(auctions.id, auctionId))
        .returning();
      
      return auction;
    } catch (error) {
      log(`Error approving auction ${auctionId}: ${error}`);
      throw error;
    }
  }

  async updateAuction(auctionId: number, data: Partial<Auction>): Promise<Auction> {
    try {
      // Ensure dates are properly formatted
      const formattedData = { ...data };
      
      // Convert date strings to Date objects if needed
      if (formattedData.startDate && !(formattedData.startDate instanceof Date)) {
        formattedData.startDate = new Date(formattedData.startDate);
      }
      
      if (formattedData.endDate && !(formattedData.endDate instanceof Date)) {
        formattedData.endDate = new Date(formattedData.endDate);
      }
      
      log(`Updating auction ${auctionId} with formatted data:`, JSON.stringify({
        title: formattedData.title,
        startDate: formattedData.startDate,
        endDate: formattedData.endDate
      }));
      
      const [auction] = await db
        .update(auctions)
        .set(formattedData)
        .where(eq(auctions.id, auctionId))
        .returning();
      
      return auction;
    } catch (error) {
      log(`Error updating auction ${auctionId}: ${error}`);
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

  // Mock implementations for notification functions
  async getNotificationsByUserId(userId: number): Promise<any[]> {
    log(`Getting notifications for user ${userId}`);
    return []; // Return empty array for now
  }

  async getLastNotification(): Promise<any | undefined> {
    return undefined;
  }

  async markNotificationAsRead(notificationId: number): Promise<any> {
    return { id: notificationId, read: true };
  }

  async markAllNotificationsAsRead(userId: number): Promise<void> {
    // Implementation would mark all user notifications as read
  }

  async getUnreadNotificationsCount(userId: number): Promise<number> {
    return 0;
  }

  // Payment related functions
  async getPaymentBySessionId(sessionId: string): Promise<any | undefined> {
    return undefined;
  }

  async updatePaymentBySessionId(sessionId: string, data: any): Promise<any> {
    return { id: 1, sessionId, ...data };
  }

  async updatePaymentByIntentId(intentId: string, data: any): Promise<any> {
    return { id: 1, intentId, ...data };
  }

  // Fulfillment related functions
  async getWinnerDetails(auctionId: number): Promise<any | undefined> {
    return undefined;
  }

  async createFulfillment(fulfillmentData: any): Promise<any> {
    return fulfillmentData;
  }

  async getFulfillment(auctionId: number): Promise<any | undefined> {
    return undefined;
  }

  // Buyer request related functions
  async createBuyerRequest(requestData: any): Promise<any> {
    return requestData;
  }

  async getBuyerRequests(filters?: any): Promise<any[]> {
    return [];
  }

  async getBuyerRequest(id: number): Promise<any | undefined> {
    return undefined;
  }

  async incrementBuyerRequestViews(id: number): Promise<void> {
    return;
  }

  async updateBuyerRequestStatus(id: number, status: string): Promise<any> {
    return { id, status };
  }

  async deleteBuyerRequest(id: number): Promise<void> {
    return;
  }

  async updateBuyerRequest(id: number, data: any): Promise<any> {
    return { id, ...data };
  }

  // Seller payment related functions
  async getPayoutsBySeller(sellerId: number): Promise<any[]> {
    return [];
  }

  // User management
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
}

export const storage = new DatabaseStorage();