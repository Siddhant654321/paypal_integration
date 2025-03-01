import { storage } from "./storage";
import { type InsertNotification } from "@shared/schema";
import { EmailService } from "./email-service";

const log = (message: string, data?: any, context: string = 'notification') => {
  console.log(`[${context}] ${message}`, data ? data : '');
};

export class NotificationService {
  static async createNotification(
    userId: number,
    notification: Omit<InsertNotification, "userId">
  ): Promise<void> {
    try {
      log(`Creating notification for user ${userId}`, notification);

      // Ensure all required fields are present
      if (!notification.type || !notification.title || !notification.message) {
        throw new Error("Missing required notification fields");
      }

      const createdNotification = await storage.createNotification({
        ...notification,
        userId,
        read: false, // Explicitly set read status
        createdAt: new Date(),
      });

      log(`Successfully created notification:`, createdNotification);

      // Also send email notification if applicable
      try {
        const user = await storage.getUser(userId);
        if (user && user.emailNotificationsEnabled) {
          await EmailService.sendNotification(notification.type, user, {
            message: notification.message,
            auctionTitle: notification.message.split('"')[1], // Extract auction title from message
            status: 'new',
          });
          log(`Email notification sent successfully to user ${userId}`);
        }
      } catch (emailError) {
        log(`Failed to send email notification: ${emailError}`);
        // Don't throw error here, continue with notification creation
      }
    } catch (error) {
      log(`Error creating notification: ${error}`);
      console.error('[NOTIFICATION] Full notification error:', error);
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
        message: `A new bid of $${(bidAmount/100).toFixed(2)} has been placed on your auction "${auctionTitle}"`,
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
        message: `Someone has placed a higher bid of $${(newBidAmount/100).toFixed(2)} on "${auctionTitle}"`,
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

  static async notifyPayment(
    userId: number,
    amount: number,
    status: string
  ): Promise<void> {
    return this.createNotification(
      userId,
      {
        type: "payment",
        title: "Payment Update",
        message: `Payment of $${(amount/100).toFixed(2)} has been ${status}`,
      }
    );
  }
}