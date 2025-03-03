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

  static async notifyAuctionOneHourRemaining(
    userId: number,
    auctionTitle: string,
    endTime: Date
  ): Promise<void> {
    log(`Notifying user ${userId} about auction "${auctionTitle}" ending in one hour`);
    return this.createNotification(
      userId,
      {
        type: "auction",
        title: "Auction Ending Soon",
        message: `The auction "${auctionTitle}" will end in one hour at ${endTime.toLocaleTimeString()}`,
      }
    );
  }

  static async notifyAuctionComplete(
    userId: number,
    auctionTitle: string,
    isWinner: boolean,
    finalPrice: number,
    isSeller: boolean = false
  ): Promise<void> {
    let title: string;
    let message: string;

    if (isSeller) {
      title = "Auction Completed";
      message = `Your auction "${auctionTitle}" has ended with a final price of $${(finalPrice/100).toFixed(2)}`;
    } else if (isWinner) {
      title = "Congratulations! You Won";
      message = `You won the auction "${auctionTitle}" with a final bid of $${(finalPrice/100).toFixed(2)}`;
    } else {
      title = "Auction Ended";
      message = `The auction "${auctionTitle}" has ended. The winning bid was $${(finalPrice/100).toFixed(2)}`;
    }

    log(`Notifying user ${userId} about auction completion`, {
      auctionTitle,
      isWinner,
      isSeller,
      finalPrice
    });

    return this.createNotification(
      userId,
      {
        type: "auction",
        title,
        message,
      }
    );
  }
}
import { storage } from "./storage";

export class NotificationService {
  static async notifyNewBid(
    userId: number,
    auctionTitle: string,
    bidAmount: number
  ): Promise<void> {
    try {
      const notification = {
        userId,
        type: "new_bid",
        message: `New bid of $${(bidAmount / 100).toFixed(2)} on "${auctionTitle}"`,
        read: false,
        data: { auctionTitle, bidAmount },
      };
      
      await storage.createNotification(notification);
      console.log(`[NOTIFICATION] Created new bid notification for user ${userId}`);
    } catch (error) {
      console.error("[NOTIFICATION] Failed to create new bid notification:", error);
    }
  }

  static async notifyOutbid(
    userId: number,
    auctionTitle: string,
    newBidAmount: number
  ): Promise<void> {
    try {
      const notification = {
        userId,
        type: "outbid",
        message: `You've been outbid on "${auctionTitle}" with a new bid of $${(newBidAmount / 100).toFixed(2)}`,
        read: false,
        data: { auctionTitle, newBidAmount },
      };
      
      await storage.createNotification(notification);
      console.log(`[NOTIFICATION] Created outbid notification for user ${userId}`);
    } catch (error) {
      console.error("[NOTIFICATION] Failed to create outbid notification:", error);
    }
  }

  static async notifyAuctionEnding(
    userId: number,
    auctionTitle: string,
    minutesLeft: number
  ): Promise<void> {
    try {
      const notification = {
        userId,
        type: "auction_ending",
        message: `Auction "${auctionTitle}" is ending soon (${minutesLeft} minutes left)`,
        read: false,
        data: { auctionTitle, minutesLeft },
      };
      
      await storage.createNotification(notification);
      console.log(`[NOTIFICATION] Created auction ending notification for user ${userId}`);
    } catch (error) {
      console.error("[NOTIFICATION] Failed to create auction ending notification:", error);
    }
  }

  static async notifyAuctionWon(
    userId: number,
    auctionTitle: string,
    finalPrice: number
  ): Promise<void> {
    try {
      const notification = {
        userId,
        type: "auction_won",
        message: `Congratulations! You won the auction "${auctionTitle}" with a bid of $${(finalPrice / 100).toFixed(2)}`,
        read: false,
        data: { auctionTitle, finalPrice },
      };
      
      await storage.createNotification(notification);
      console.log(`[NOTIFICATION] Created auction won notification for user ${userId}`);
    } catch (error) {
      console.error("[NOTIFICATION] Failed to create auction won notification:", error);
    }
  }

  static async notifyAuctionEnded(
    userId: number,
    auctionTitle: string,
    soldPrice: number | null
  ): Promise<void> {
    try {
      let message = `Your auction "${auctionTitle}" has ended`;
      if (soldPrice) {
        message += ` and sold for $${(soldPrice / 100).toFixed(2)}`;
      } else {
        message += " without any bids";
      }
      
      const notification = {
        userId,
        type: "auction_ended",
        message,
        read: false,
        data: { auctionTitle, soldPrice },
      };
      
      await storage.createNotification(notification);
      console.log(`[NOTIFICATION] Created auction ended notification for user ${userId}`);
    } catch (error) {
      console.error("[NOTIFICATION] Failed to create auction ended notification:", error);
    }
  }

  static async notifyFulfillment(
    userId: number,
    auctionTitle: string,
    trackingNumber: string,
    carrier: string
  ): Promise<void> {
    try {
      const notification = {
        userId,
        type: "fulfillment",
        message: `Your item "${auctionTitle}" has been shipped! Tracking: ${trackingNumber} (${carrier})`,
        read: false,
        data: { auctionTitle, trackingNumber, carrier },
      };
      
      await storage.createNotification(notification);
      console.log(`[NOTIFICATION] Created fulfillment notification for user ${userId}`);
    } catch (error) {
      console.error("[NOTIFICATION] Failed to create fulfillment notification:", error);
    }
  }
}
