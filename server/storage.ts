import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { db } from "./db";
import { users, auctions, bids } from "@shared/schema";
import { type User, type InsertUser, type Auction, type InsertAuction, type Bid, type InsertBid } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { log } from "./vite";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  sessionStore: session.Store;

  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  approveUser(id: number): Promise<User>;

  // Auction operations
  createAuction(auction: InsertAuction): Promise<Auction>;
  getAuction(id: number): Promise<Auction | undefined>;
  getAuctions(filters?: {
    species?: string;
    category?: string;
    approved?: boolean;
  }): Promise<Auction[]>;
  approveAuction(id: number): Promise<Auction>;

  // Bid operations
  createBid(bid: InsertBid): Promise<Bid>;
  getBidsForAuction(auctionId: number): Promise<Bid[]>;
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

  async createAuction(insertAuction: InsertAuction): Promise<Auction> {
    try {
      const [auction] = await db
        .insert(auctions)
        .values({
          ...insertAuction,
          currentPrice: insertAuction.startPrice,
          approved: false,
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
  }): Promise<Auction[]> {
    try {
      let query = db.select().from(auctions);

      if (filters) {
        if (filters.species) {
          query = query.where(sql`${auctions.species} = ${filters.species}`);
        }
        if (filters.category) {
          query = query.where(sql`${auctions.category} = ${filters.category}`);
        }
        if (filters.approved !== undefined) {
          query = query.where(sql`${auctions.approved} = ${filters.approved}`);
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
        .orderBy(bids.amount);
    } catch (error) {
      log(`Error getting bids for auction ${auctionId}: ${error}`, "storage");
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();