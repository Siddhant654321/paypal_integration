import { users, type User, type InsertUser, auctions, type Auction, type InsertAuction, profiles, type Profile, type InsertProfile, bids, type Bid, notifications, type InsertNotification } from "@shared/schema";
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
  getPendingAuctions(): Promise<Auction[]>;
  approveAuction(auctionId: number, reviewerId: number): Promise<Auction>;
  updateAuction(auctionId: number, data: Partial<Auction>): Promise<Auction>;
  createBid(bid: InsertBid): Promise<Bid>;
  getBidsForAuction(auctionId: number): Promise<Bid[]>;
  getBidsByUser(userId: number): Promise<Bid[]>;
  deleteBid(bidId: number): Promise<void>;
  getUsers(filters?: { 
    approved?: boolean;
    role?: string;
    lastLoginAfter?: Date;
  }): Promise<User[]>;
  approveUser(userId: number): Promise<User>;
  deleteProfile(userId: number): Promise<void>;
  createNotification(notification: InsertNotification): Promise<any>;
  getNotificationsByUserId(userId: number): Promise<any[]>;
  getLastNotification(): Promise<any | undefined>;
  markNotificationAsRead(notificationId: number): Promise<any>;
  markAllNotificationsAsRead(userId: number): Promise<void>;
  getUnreadNotificationsCount(userId: number): Promise<number>;
  getPaymentBySessionId(sessionId: string): Promise<any | undefined>;
  updatePaymentBySessionId(sessionId: string, data: any): Promise<any>;
  updatePaymentByIntentId(intentId: string, data: any): Promise<any>;
  getWinnerDetails(auctionId: number): Promise<any | undefined>;
  createFulfillment(fulfillmentData: any): Promise<any>;
  getFulfillment(auctionId: number): Promise<any | undefined>;
  createBuyerRequest(requestData: any): Promise<any>;
  getBuyerRequests(filters?: any): Promise<any[]>;
  getBuyerRequest(id: number): Promise<any | undefined>;
  incrementBuyerRequestViews(id: number): Promise<void>;
  updateBuyerRequestStatus(id: number, status: string): Promise<any>;
  deleteBuyerRequest(id: number): Promise<void>;
  updateBuyerRequest(id: number, data: any): Promise<any>;
  getPayoutsBySeller(sellerId: number): Promise<any[]>;
  deleteAuction(auctionId: number): Promise<void>;
  updateUser(userId: number, data: Partial<User>): Promise<User>;
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
      log(`Creating profile for user ${insertProfile.userId}`);

      // First, create the profile
      const [profile] = await db
        .insert(profiles)
        .values(insertProfile)
        .returning();

      // Then, update the user's has_profile flag
      await db
        .update(users)
        .set({ hasProfile: true })
        .where(eq(users.id, insertProfile.userId));

      log(`Profile created and user updated for user ${insertProfile.userId}`);
      return profile;
    } catch (error) {
      log(`Error creating profile: ${error}`);
      throw error;
    }
  }

  async updateProfile(userId: number, profile: Partial<InsertProfile>): Promise<Profile> {
    try {
      // Get user role first
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      // Update profile
      const [updatedProfile] = await db
        .update(profiles)
        .set(profile)
        .where(eq(profiles.userId, userId))
        .returning();

      // Simple required fields check
      let requiredFields = [
        'fullName',
        'email',
        'phoneNumber',
        'address',
        'city',
        'state',
        'zipCode'
      ];

      // Add seller fields if needed
      if (user.role === "seller" || user.role === "seller_admin") {
        requiredFields = requiredFields.concat(['businessName', 'breedSpecialty', 'npipNumber']);
      }

      // Check if all required fields are filled
      const isComplete = requiredFields.every(field => {
        const value = updatedProfile[field as keyof Profile];
        return value && value.toString().trim() !== '';
      });

      // Update hasProfile flag if profile is complete
      if (isComplete && !user.hasProfile) {
        await db
          .update(users)
          .set({ hasProfile: true })
          .where(eq(users.id, userId));
        log(`Profile completed for user ${userId}`);
      }

      return updatedProfile;
    } catch (error) {
      log(`Error updating profile: ${error}`);
      throw error;
    }
  }

  async createAuction(insertAuction: InsertAuction & { sellerId: number }): Promise<Auction> {
    try {
      // Ensure dates and numeric values are properly formatted
      const formattedAuction = {
        ...insertAuction,
        startDate: new Date(insertAuction.startDate),
        endDate: new Date(insertAuction.endDate),
        startPrice: typeof insertAuction.startPrice === 'string' ? 
          parseFloat(insertAuction.startPrice) : insertAuction.startPrice,
        reservePrice: typeof insertAuction.reservePrice === 'string' ? 
          parseFloat(insertAuction.reservePrice) : insertAuction.reservePrice,
        currentPrice: typeof insertAuction.startPrice === 'string' ? 
          parseFloat(insertAuction.startPrice) : insertAuction.startPrice, // Set initial current price to start price
        status: "pending_review" // New auctions start in pending_review state
      };

      log("Creating auction with formatted data:", {
        title: formattedAuction.title,
        sellerId: formattedAuction.sellerId,
        startPrice: formattedAuction.startPrice,
        reservePrice: formattedAuction.reservePrice,
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
      log(`Retrieved ${results.length} auctions with filters:`, filters);
      return results;
    } catch (error) {
      log(`Error getting auctions: ${error}`);
      throw error;
    }
  }

  async getPendingAuctions(): Promise<Auction[]> {
    return this.getAuctions({ status: "pending_review" });
  }

  async approveAuction(auctionId: number, reviewerId: number): Promise<Auction> {
    try {
      const [auction] = await db
        .update(auctions)
        .set({ 
          approved: true,
          status: "active",
          reviewedBy: reviewerId,
          reviewedAt: new Date()
        })
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
      // First get the current auction data
      const currentAuction = await this.getAuction(auctionId);
      if (!currentAuction) {
        throw new Error(`Auction with id ${auctionId} not found`);
      }

      // Ensure dates are properly formatted
      const formattedData = { ...data };

      if (formattedData.startDate) {
        formattedData.startDate = new Date(formattedData.startDate);
      }

      if (formattedData.endDate) {
        formattedData.endDate = new Date(formattedData.endDate);
      }

      // If startPrice is updated but currentPrice is not, and there are no bids yet,
      // update currentPrice to match startPrice
      if (formattedData.startPrice !== undefined && formattedData.currentPrice === undefined) {
        if (currentAuction.currentPrice === currentAuction.startPrice) {
          formattedData.currentPrice = formattedData.startPrice;
        }
      }

      // Handle images properly
      if (formattedData.images) {
        if (!Array.isArray(formattedData.images)) {
          formattedData.images = [formattedData.images];
        }

        if (!formattedData.imageUrl && formattedData.images.length > 0) {
          formattedData.imageUrl = formattedData.images[0];
        }
      }

      log(`Updating auction ${auctionId} with formatted data:`, {
        title: formattedData.title,
        startDate: formattedData.startDate,
        endDate: formattedData.endDate,
        startPrice: formattedData.startPrice,
        reservePrice: formattedData.reservePrice,
        currentPrice: formattedData.currentPrice,
        images: Array.isArray(formattedData.images) ? `${formattedData.images.length} images` : formattedData.images
      });

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

  async createBid(bid: InsertBid): Promise<Bid> {
    try {
      log(`Creating bid for auction ${bid.auctionId}`);

      // Validate bid amount is a valid number
      const bidAmount = parseFloat(bid.amount.toString());
      if (isNaN(bidAmount)) {
        throw new Error("Invalid bid amount");
      }

      const [newBid] = await db
        .insert(bids)
        .values({
          ...bid,
          amount: bidAmount,
          timestamp: new Date()
        })
        .returning();

      // Update auction's current price
      await this.updateAuction(bid.auctionId, {
        currentPrice: bidAmount
      });

      return newBid;
    } catch (error) {
      log(`Error creating bid: ${error}`);
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
      log(`Error getting bids for auction ${auctionId}: ${error}`);
      throw error;
    }
  }

  async getBidsByUser(userId: number): Promise<Bid[]> {
    try {
      return await db
        .select()
        .from(bids)
        .where(eq(bids.bidderId, userId))
        .orderBy(bids.timestamp, "desc");
    } catch (error) {
      log(`Error getting bids for user ${userId}: ${error}`);
      throw error;
    }
  }

  async deleteBid(bidId: number): Promise<void> {
    try {
      log(`Deleting bid ${bidId}`);
      await db.delete(bids).where(eq(bids.id, bidId));
    } catch (error) {
      log(`Error deleting bid ${bidId}: ${error}`);
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

  async createNotification(notification: InsertNotification): Promise<any> {
    try {
      log(`Creating notification for user ${notification.userId}`);
      const [newNotification] = await db
        .insert(notifications)
        .values(notification)
        .returning();
      return newNotification;
    } catch (error) {
      log(`Error creating notification: ${error}`);
      throw error;
    }
  }

  async getNotificationsByUserId(userId: number): Promise<any[]> {
    try {
      return await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(notifications.createdAt, "desc");
    } catch (error) {
      log(`Error getting notifications for user ${userId}: ${error}`);
      throw error;
    }
  }

  async getLastNotification(): Promise<any | undefined> {
    return undefined;
  }

  async markNotificationAsRead(notificationId: number): Promise<any> {
    try {
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
      const unreadNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .where(eq(notifications.read, false));
      return unreadNotifications.length;
    } catch (error) {
      log(`Error getting unread notification count for user ${userId}: ${error}`);
      return 0;
    }
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
  async updateUser(userId: number, data: Partial<User>): Promise<User> {
    try {
      const [user] = await db
        .update(users)
        .set(data)
        .where(eq(users.id, userId))
        .returning();
      return user;
    } catch (error) {
      log(`Error updating user ${userId}: ${error}`);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();