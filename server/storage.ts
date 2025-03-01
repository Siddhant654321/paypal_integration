import { users, type User, type InsertUser, auctions, type Auction, type InsertAuction, profiles, type Profile, type InsertProfile } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

function log(message: string, context = "general") {
  console.log(`[STORAGE:${context}] ${message}`);
}

export interface IStorage {
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

      // Update user has_profile flag
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
}

export const storage = new DatabaseStorage();