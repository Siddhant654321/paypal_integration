import { storage } from "./storage";
import { EmailService } from "./email-service";
import { type InsertNotification, type User } from "@shared/schema";
import { log } from "./vite";

export class NotificationService {
  static async createNotificationAndSendEmail(
    userId: number,
    notification: Omit<InsertNotification, "userId">,
    emailData: {
      type: "bid" | "auction" | "payment" | "fulfillment" | "admin";
      data: any;
    }
  ): Promise<void> {
    try {
      // Get the user for email sending
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Create in-app notification
      await storage.createNotification({
        ...notification,
        userId,
      });

      // Send email notification
      await EmailService.sendNotification(
        emailData.type,
        user,
        emailData.data
      );
    } catch (error) {
      log(`Error creating notification and sending email: ${error}`, "notification");
      throw error;
    }
  }

  // Convenience methods for different notification types
  static async notifyBid(
    userId: number,
    auctionTitle: string,
    bidAmount: number,
    type: 'new_bid' | 'outbid'
  ): Promise<void> {
    const title = type === 'new_bid' ? "New Bid Received" : "You've Been Outbid";
    const message = type === 'new_bid' 
      ? `A new bid of $${bidAmount} has been placed on your auction "${auctionTitle}"`
      : `Someone has placed a higher bid of $${bidAmount} on "${auctionTitle}"`;

    return this.createNotificationAndSendEmail(
      userId,
      {
        type: "bid",
        title,
        message,
      },
      {
        type: "bid",
        data: {
          auctionTitle,
          bidAmount,
        },
      }
    );
  }

  static async notifyAuctionEnd(
    userId: number,
    auctionTitle: string,
    status: string
  ): Promise<void> {
    return this.createNotificationAndSendEmail(
      userId,
      {
        type: "auction",
        title: "Auction Status Update",
        message: `Your auction "${auctionTitle}" has ${status}`,
      },
      {
        type: "auction",
        data: {
          auctionTitle,
          status,
        },
      }
    );
  }

  static async notifyPayment(
    userId: number,
    amount: number,
    status: string
  ): Promise<void> {
    return this.createNotificationAndSendEmail(
      userId,
      {
        type: "payment",
        title: "Payment Update",
        message: `A payment of $${amount} has been ${status}`,
      },
      {
        type: "payment",
        data: {
          amount,
          status,
        },
      }
    );
  }

  static async notifyAuctionReminder(
    userId: number,
    auctionTitle: string,
    hoursRemaining: number
  ): Promise<void> {
    return this.createNotificationAndSendEmail(
      userId,
      {
        type: "auction",
        title: "Auction Ending Soon",
        message: `Your auction "${auctionTitle}" will end in ${hoursRemaining} ${hoursRemaining === 1 ? 'hour' : 'hours'}`,
      },
      {
        type: "auction",
        data: {
          auctionTitle,
          hoursRemaining,
        },
      }
    );
  }
}