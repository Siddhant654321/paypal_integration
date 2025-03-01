import { users, type User, type InsertUser, auctions, type Auction, type InsertAuction, profiles, type Profile, type InsertProfile } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { Store } from "express-session";

function log(message: string, context = "general") {
  console.log(`[STORAGE:${context}] ${message}`);
}

export interface IStorage {
  sessionStore: Store;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;
  getUsers(filters?: { approved?: boolean; role?: string; lastLoginAfter?: Date }): Promise<User[]>;
  approveUser(userId: number): Promise<User>;
  hasProfile(userId: number): Promise<boolean>;
  getProfile(userId: number): Promise<Profile | undefined>;
  createProfile(insertProfile: InsertProfile & { userId: number }): Promise<Profile>;
  updateProfile(userId: number, data: Partial<Profile>): Promise<Profile>;
  deleteProfile(userId: number): Promise<void>;
  createAuction(insertAuction: InsertAuction & { sellerId: number }): Promise<Auction>;
  getAuction(id: number): Promise<Auction | undefined>;
  getAuctions(filters?: { 
    sellerId?: number;
    approved?: boolean;
    species?: string;
    category?: string;
  }): Promise<Auction[]>;
  approveAuction(auctionId: number): Promise<Auction>;
  updateAuction(auctionId: number, data: Partial<Auction>): Promise<Auction>;
  deleteAuction(auctionId: number): Promise<void>;
  getNotificationsByUserId(userId: number): Promise<any[]>;
  getLastNotification(): Promise<any | undefined>;
  markNotificationAsRead(notificationId: number): Promise<any>;
  markAllNotificationsAsRead(userId: number): Promise<void>;
  getUnreadNotificationsCount(userId: number): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // Session store - this would need to be properly implemented based on your session store
  sessionStore = {} as Store; 

  async getUser(id: number): Promise<User | undefined> {
    try {
      // Ensure id is a number
      const userId = typeof id === 'string' ? parseInt(id, 10) : id;

      log(`Getting user with ID: ${userId} (type: ${typeof userId})`);

      if (isNaN(userId)) {
        log(`Invalid user ID: ${id}`);
        return undefined;
      }

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      log(`User lookup result: ${JSON.stringify({
        id: userId,
        found: !!user,
        role: user?.role
      })}`);

      return user;
    } catch (error) {
      log(`Error getting user ${id}: ${error}`);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      log(`Looking up user by username: ${username}`);

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username));

      log(`Username lookup result: ${JSON.stringify({
        username,
        found: !!user,
        role: user?.role
      })}`);

      return user;
    } catch (error) {
      log(`Error getting user by username ${username}: ${error}`);
      throw error;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      log(`Creating new user: ${insertUser.username}`);
      const [user] = await db.insert(users).values(insertUser).returning();
      log(`User created successfully: ${user.username}`);
      return user;
    } catch (error) {
      log(`Error creating user: ${error}`);
      throw error;
    }
  }

  async getUsers(filters?: { approved?: boolean; role?: string; lastLoginAfter?: Date }): Promise<User[]> {
    try {
      let query = db.select().from(users);
      
      if (filters) {
        if (filters.approved !== undefined) {
          query = query.where(eq(users.approved, filters.approved));
        }
        if (filters.role) {
          query = query.where(eq(users.role, filters.role));
        }
        // Last login filtering would need more implementation
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

  async hasProfile(userId: number): Promise<boolean> {
    try {
      log(`Checking if user ${userId} has a profile`);
      const profile = await this.getProfile(userId);
      return !!profile;
    } catch (error) {
      log(`Error checking profile for user ${userId}: ${error}`);
      return false;
    }
  }

  async getProfile(userId: number): Promise<Profile | undefined> {
    try {
      log(`Getting profile for user ${userId}`);
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.userId, userId));

      // After fetching profile, update user's has_profile status if needed
      if (profile) {
        await db
          .update(users)
          .set({ has_profile: true })
          .where(eq(users.id, userId));
      }

      return profile;
    } catch (error) {
      log(`Error getting profile for user ${userId}: ${error}`);
      throw error;
    }
  }

  async createProfile(insertProfile: InsertProfile & { userId: number }): Promise<Profile> {
    try {
      log(`Creating profile for user ${insertProfile.userId}`);
      const [profile] = await db
        .insert(profiles)
        .values(insertProfile)
        .returning();

      // Update user's has_profile status
      await db
        .update(users)
        .set({ has_profile: true })
        .where(eq(users.id, insertProfile.userId));

      return profile;
    } catch (error) {
      log(`Error creating profile: ${error}`);
      throw error;
    }
  }

  async updateProfile(userId: number, data: Partial<Profile>): Promise<Profile> {
    try {
      log(`Updating profile for user ${userId}`);
      const [profile] = await db
        .update(profiles)
        .set(data)
        .where(eq(profiles.userId, userId))
        .returning();

      return profile;
    } catch (error) {
      log(`Error updating profile: ${error}`);
      throw error;
    }
  }

  async deleteProfile(userId: number): Promise<void> {
    try {
      log(`Deleting profile for user ${userId}`);
      await db
        .delete(profiles)
        .where(eq(profiles.userId, userId));

      // Update user's has_profile status
      await db
        .update(users)
        .set({ has_profile: false })
        .where(eq(users.id, userId));
    } catch (error) {
      log(`Error deleting profile: ${error}`);
      throw error;
    }
  }

  async createAuction(insertAuction: InsertAuction & { sellerId: number }): Promise<Auction> {
    try {
      log(`Creating auction for seller ${insertAuction.sellerId}`);

      // Verify seller exists and is authorized
      const seller = await this.getUser(insertAuction.sellerId);

      if (!seller) {
        throw new Error(`Seller with ID ${insertAuction.sellerId} not found`);
      }

      if (seller.role !== 'seller' && seller.role !== 'seller_admin') {
        throw new Error(`User ${insertAuction.sellerId} is not authorized to create auctions`);
      }

      // Insert the auction
      const [auction] = await db
        .insert(auctions)
        .values(insertAuction)
        .returning();

      log(`Auction created successfully: ${auction.id}`);
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
      }

      return await query;
    } catch (error) {
      log(`Error getting auctions: ${error}`);
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
      const [auction] = await db
        .update(auctions)
        .set(data)
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
}

export const storage = new DatabaseStorage();