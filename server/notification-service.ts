import { storage } from "./storage";
import { type InsertNotification } from "@shared/schema";
import { EmailService } from "./email-service";

const log = (message: string, data?: any, context: string = 'notification') => {
  console.log(`[${context}] ${message}`, data ? data : '');
};

export class NotificationService {
  static async createNotification(
    userId: number,
    notification: Omit<InsertNotification, "userId"> & { reference?: string }
  ): Promise<InsertNotification> {
    try {
      log(`Creating notification for user ${userId}`, notification);

      // Check user exists
      const user = await storage.getUser(userId);
      if (!user) {
        log(`Warning: Attempting to create notification for non-existent user ${userId}`);
      } else {
        log(`Creating notification for user ${userId} (${user.username})`);
      }

      // Extract reference field before sending to storage
      const { reference, ...notificationData } = notification;

      const createdNotification = await storage.createNotification({
        ...notificationData,
        userId,
        read: false,
        createdAt: new Date(),
        reference: reference || null,
      });

      log(`Successfully created notification (ID: ${createdNotification.id}):`, {
        userId,
        title: createdNotification.title,
        type: createdNotification.type,
        reference: createdNotification.reference
      });

      // Also send email notification if applicable
      try {
        const user = await storage.getUser(userId);
        if (user && user.emailNotificationsEnabled) {
          // Send email based on notification type
          await EmailService.sendNotification(notification.type, user, {
            message: notification.message,
            auctionTitle: notification.message.split('"')[1], // Extract auction title from message
            status: notification.type === 'auction_ending_soon' ? 'ending soon' : 'ended',
            isWinner: notification.title.includes('Won') || notification.title.includes('Congratulations'),
          });
          log(`Email notification sent successfully to user ${userId}`);
        }
      } catch (emailError) {
        log(`Failed to send email notification: ${emailError}`);
        // Don't throw error here, continue with notification creation
      }
      return createdNotification;
    } catch (error) {
      log(`Error creating notification: ${error}`);
      console.error('[NOTIFICATION] Full notification error:', error);
      throw error;
    }
  }

  static async notifyNewBid(
    sellerId: number,
    auctionTitle: string,
    bidAmount: number,
    auctionId: number
  ): Promise<void> {
    log(`Notifying seller ${sellerId} about new bid on "${auctionTitle}"`);
    return this.createNotification(
      sellerId,
      {
        type: "bid",
        title: "New Bid Received",
        message: `A new bid of $${(bidAmount/100).toFixed(2)} has been placed on your auction "${auctionTitle}"`,
        reference: auctionId.toString()
      }
    );
  }

  static async notifyOutbid(
    previousBidderId: number,
    auctionTitle: string,
    newBidAmount: number,
    auctionId: number
  ): Promise<void> {
    log(`Notifying previous bidder ${previousBidderId} about being outbid on "${auctionTitle}"`);
    return this.createNotification(
      previousBidderId,
      {
        type: "bid",
        title: "You've Been Outbid",
        message: `Someone has placed a higher bid of $${(newBidAmount/100).toFixed(2)} on "${auctionTitle}"`,
        reference: auctionId.toString()
      }
    );
  }

  static async notifyAuctionEnding(
    bidderId: number,
    auctionTitle: string,
    currentPrice: number,
    auctionId: number
  ): Promise<void> {
    return this.createNotification(
      bidderId,
      {
        type: "auction_ending_soon",
        title: "Auction Ending Soon",
        message: `The auction "${auctionTitle}" will end in 12 hours. Current bid: $${(currentPrice/100).toFixed(2)}`,
        reference: auctionId.toString()
      }
    );
  }

  static async notifyAuctionEnd(
    userId: number,
    auctionTitle: string,
    isWinner: boolean,
    isSeller: boolean,
    finalPrice: number,
    auctionId: number
  ): Promise<void> {
    let title, message;

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

    return this.createNotification(
      userId,
      {
        type: "auction_completed",
        title,
        message,
        reference: auctionId.toString()
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

  static async sendDailyAuctionUpdates() {
    try {
      const newAuctions = await storage.getNewAuctions(); // Implement this in storage
      const optedInUsers = await storage.getUsersWithDailyUpdates(); // Implement this in storage

      for (const user of optedInUsers) {
        const userAuctions = newAuctions.filter(auction => auction.userId === user.id);
        if (userAuctions.length > 0) {
          const emailMessage = `Here are your daily auction updates:\n${userAuctions.map(auction => `Auction: ${auction.title}, ID: ${auction.id}`).join('\n')}`;
          await EmailService.sendDailyUpdate(user, emailMessage);
        }
      }
      log("Daily auction updates sent successfully");
    } catch (error) {
      log(`Error sending daily auction updates: ${error}`);
      console.error("[DAILY_UPDATE] Error:", error);
    }
  }
}