import { storage } from "./storage";
import { type InsertNotification } from "@shared/schema";

const log = (message: string, context: string = 'notification') => {
  console.log(`[${context}] ${message}`);
};

export class NotificationService {
  static async createNotification(
    userId: number,
    notification: Omit<InsertNotification, "userId">
  ): Promise<void> {
    try {
      await storage.createNotification({
        ...notification,
        userId,
      });
    } catch (error) {
      log(`Error creating notification: ${error}`);
      console.error('Notification error:', error);
    }
  }

  // Basic notification methods
  static async notifyNewBid(
    sellerId: number,
    auctionTitle: string,
    bidAmount: number
  ): Promise<void> {
    return this.createNotification(
      sellerId,
      {
        type: "bid",
        title: "New Bid Received",
        message: `A new bid of $${bidAmount/100} has been placed on your auction "${auctionTitle}"`,
      }
    );
  }

  static async notifyOutbid(
    previousBidderId: number,
    auctionTitle: string,
    newBidAmount: number
  ): Promise<void> {
    return this.createNotification(
      previousBidderId,
      {
        type: "bid",
        title: "You've Been Outbid",
        message: `Someone has placed a higher bid of $${newBidAmount/100} on "${auctionTitle}"`,
      }
    );
  }
}