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
    status?: string;
  }): Promise<Auction[]>;
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

  async createAuction(insertAuction: InsertAuction & { sellerId: number }): Promise<Auction> {
    try {
      // Prices are already in cents from schema validation
      const auctionData = {
        ...insertAuction,
        currentPrice: insertAuction.startPrice,
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

  async getBidsForAuction(auctionId: number): Promise<any[]> {
    try {
      log(`Getting bids for auction ${auctionId}`);
      return []; 
    } catch (error) {
      log(`Error getting bids for auction ${auctionId}: ${error}`);
      throw error;
    }
  }

  async getBidsByUser(userId: number): Promise<any[]> {
    try {
      log(`Getting bids for user ${userId}`);
      return []; 
    } catch (error) {
      log(`Error getting bids for user ${userId}: ${error}`);
      throw error;
    }
  }

  async createBid(bid: any): Promise<any> {
    try {
      log(`Creating bid for auction ${bid.auctionId}`);
      return bid; 
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
        if (filters.approved !== undefined) {
          query = query.where(eq(users.approved, filters.approved));
        }
        if (filters.role) {
          query = query.where(eq(users.role, filters.role));
        }
      }
      
      return await query;
    } catch (error) {
      log(`Error getting users: ${error}`);
      throw error;
    }
  }

  async deleteBid(bidId: number): Promise<void> {
    try {
      log(`Deleting bid ${bidId}`);
    } catch (error) {
      log(`Error deleting bid ${bidId}: ${error}`);
      throw error;
    }
  }
  async approveAuction(auctionId: number): Promise<Auction> {
    try {
      const existingAuction = await this.getAuction(auctionId);
      if (!existingAuction) {
        throw new Error(`Auction ${auctionId} not found`);
      }

      // If already approved, return the existing auction
      if (existingAuction.approved) {
        return existingAuction;
      }

      // Update the auction status in a transaction
      const [updatedAuction] = await db.transaction(async (tx) => {
        return await tx
          .update(auctions)
          .set({ 
            approved: true,
            status: "active" // Ensure status is set to active when approved
          })
          .where(eq(auctions.id, auctionId))
          .returning();
      });

      if (!updatedAuction) {
        throw new Error(`Failed to update auction ${auctionId}`);
      }

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

      // Handle date conversions if needed
      if (formattedData.startDate && !(formattedData.startDate instanceof Date)) {
        formattedData.startDate = new Date(formattedData.startDate);
      }

      if (formattedData.endDate && !(formattedData.endDate instanceof Date)) {
        formattedData.endDate = new Date(formattedData.endDate);
      }

      // Keep original price values without conversion
      if (formattedData.startPrice !== undefined) {
        formattedData.startPrice = Number(formattedData.startPrice);
        // Update currentPrice only if there are no bids yet
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

      log(`Updating auction ${auctionId} with formatted data`);

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

  async getNotificationsByUserId(userId: number): Promise<any[]> {
    log(`Getting notifications for user ${userId}`);
    return []; 
  }

  async getLastNotification(): Promise<any | undefined> {
    return undefined;
  }

  async markNotificationAsRead(notificationId: number): Promise<any> {
    return { id: notificationId, read: true };
  }

  async markAllNotificationsAsRead(userId: number): Promise<void> {
  }

  async getUnreadNotificationsCount(userId: number): Promise<number> {
    return 0;
  }

  async getPaymentBySessionId(sessionId: string): Promise<any | undefined> {
    return undefined;
  }

  async updatePaymentBySessionId(sessionId: string, data: any): Promise<any> {
    return { id: 1, sessionId, ...data };
  }

  async updatePaymentByIntentId(intentId: string, data: any): Promise<any> {
    return { id: 1, intentId, ...data };
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
}

export const storage = new DatabaseStorage();