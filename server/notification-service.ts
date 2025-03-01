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
      log(`Creating notification for user ${userId}: ${JSON.stringify(notification)}`);

      const createdNotification = await storage.createNotification({
        ...notification,
        userId,
      });

      log(`Successfully created notification: ${JSON.stringify(createdNotification)}`);
    } catch (error) {
      log(`Error creating notification: ${error}`);
      console.error('Full notification error:', error);
      // Don't throw the error to prevent bid process from failing
    }
  }

  static async notifyNewBid(
    sellerId: number,
    auctionTitle: string,
    bidAmount: number
  ): Promise<void> {
    log(`Notifying seller ${sellerId} about new bid on "${auctionTitle}"`);
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
    log(`Notifying previous bidder ${previousBidderId} about being outbid on "${auctionTitle}"`);
    return this.createNotification(
      previousBidderId,
      {
        type: "bid",
        title: "You've Been Outbid",
        message: `Someone has placed a higher bid of $${newBidAmount/100} on "${auctionTitle}"`,
      }
    );
  }

  static async notifyAuctionEnding(
    bidderId: number,
    auctionTitle: string
  ): Promise<void> {
    return this.createNotification(
      bidderId,
      {
        type: "auction",
        title: "Auction Ending Soon",
        message: `The auction "${auctionTitle}" will end in 12 hours`,
      }
    );
  }

  static async notifyAuctionEnd(
    userId: number,
    auctionTitle: string,
    isWinner: boolean
  ): Promise<void> {
    const message = isWinner 
      ? `Congratulations! You've won the auction "${auctionTitle}"`
      : `The auction "${auctionTitle}" has ended`;

    return this.createNotification(
      userId,
      {
        type: "auction",
        title: isWinner ? "Auction Won!" : "Auction Ended",
        message,
      }
    );
  }
}