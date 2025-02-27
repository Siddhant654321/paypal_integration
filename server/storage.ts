import session from "express-session";
import createMemoryStore from "memorystore";
import { User, InsertUser, Auction, InsertAuction, Bid, InsertBid } from "@shared/schema";

const MemoryStore = createMemoryStore(session);

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

export class MemStorage implements IStorage {
  sessionStore: session.Store;
  private users: Map<number, User>;
  private auctions: Map<number, Auction>;
  private bids: Map<number, Bid>;
  private currentUserId: number;
  private currentAuctionId: number;
  private currentBidId: number;

  constructor() {
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
    this.users = new Map();
    this.auctions = new Map();
    this.bids = new Map();
    this.currentUserId = 1;
    this.currentAuctionId = 1;
    this.currentBidId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { 
      ...insertUser, 
      id,
      approved: insertUser.role === "buyer", // Auto-approve buyers
    };
    this.users.set(id, user);
    return user;
  }

  async approveUser(id: number): Promise<User> {
    const user = await this.getUser(id);
    if (!user) throw new Error("User not found");
    user.approved = true;
    this.users.set(id, user);
    return user;
  }

  async createAuction(insertAuction: InsertAuction): Promise<Auction> {
    const id = this.currentAuctionId++;
    const auction: Auction = {
      ...insertAuction,
      id,
      currentPrice: insertAuction.startPrice,
      approved: false,
    };
    this.auctions.set(id, auction);
    return auction;
  }

  async getAuction(id: number): Promise<Auction | undefined> {
    return this.auctions.get(id);
  }

  async getAuctions(filters?: {
    species?: string;
    category?: string;
    approved?: boolean;
  }): Promise<Auction[]> {
    let auctions = Array.from(this.auctions.values());
    
    if (filters) {
      if (filters.species) {
        auctions = auctions.filter(a => a.species === filters.species);
      }
      if (filters.category) {
        auctions = auctions.filter(a => a.category === filters.category);
      }
      if (filters.approved !== undefined) {
        auctions = auctions.filter(a => a.approved === filters.approved);
      }
    }
    
    return auctions;
  }

  async approveAuction(id: number): Promise<Auction> {
    const auction = await this.getAuction(id);
    if (!auction) throw new Error("Auction not found");
    auction.approved = true;
    this.auctions.set(id, auction);
    return auction;
  }

  async createBid(insertBid: InsertBid): Promise<Bid> {
    const id = this.currentBidId++;
    const bid: Bid = {
      ...insertBid,
      id,
      timestamp: new Date(),
    };
    this.bids.set(id, bid);
    
    // Update auction current price
    const auction = await this.getAuction(bid.auctionId);
    if (auction) {
      auction.currentPrice = bid.amount;
      this.auctions.set(auction.id, auction);
    }
    
    return bid;
  }

  async getBidsForAuction(auctionId: number): Promise<Bid[]> {
    return Array.from(this.bids.values())
      .filter(bid => bid.auctionId === auctionId)
      .sort((a, b) => b.amount - a.amount);
  }
}

export const storage = new MemStorage();
