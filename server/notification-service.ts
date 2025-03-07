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

      // Ensure all required fields are present
      if (!notification.type || !notification.title || !notification.message) {
        throw new Error("Missing required notification fields");
      }

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
          // Check if it's appropriate to send email for this notification type
          const shouldSendEmail = user.emailAuctionNotifications && 
            (notification.type === 'auction_ending_soon' || notification.type === 'auction_completed');
            
          if (shouldSendEmail) {
            await EmailService.sendNotification(notification.type, user, {
              message: notification.message,
              auctionTitle: notification.message.split('"')[1], // Extract auction title from message
              status: notification.type === 'auction_ending_soon' ? 'ending soon' : 'ended',
              isWinner: notification.title.includes('Won') || notification.title.includes('Congratulations'),
            });
            log(`Email notification sent successfully to user ${userId}`);
          } else {
            log(`Skipping email for user ${userId} (notifications not enabled for type ${notification.type})`);
          }
        }
      } catch (emailError) {
        log(`Failed to send email notification: ${emailError}`);
        // Don't throw error here, continue with notification creation
      }
      return createdNotification;
    } catch (error) {
      log(`Error creating notification: ${error}`);
      console.error('[NOTIFICATION] Full notification error:', error);
      throw error; // Updated error handling
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

  static async notifyAuctionExtended(
    userId: number,
    auctionTitle: string,
    newEndDate: Date
  ): Promise<void> {
    try {
      log(`[EXTENSION] Sending extension notification for auction "${auctionTitle}"`, {
        userId,
        newEndDate: newEndDate.toISOString()
      });

      const notification = await this.createNotification(
        userId,
        {
          type: "auction",
          title: "Auction Extended",
          message: `The auction "${auctionTitle}" has been extended to ${newEndDate.toLocaleString()} due to last-minute bidding`,
        }
      );

      log(`[EXTENSION] Successfully created extension notification`, {
        notificationId: notification.id,
        userId,
        auctionTitle
      });

      // Check if user has email notifications enabled
      const user = await storage.getUser(userId);
      if (user?.emailNotificationsEnabled) {
        console.log(`[EXTENSION] Sending email notification to user ${userId}`);
        try {
          await EmailService.sendNotification("auction_extended", user, {
            auctionTitle,
            newEndTime: newEndDate.toLocaleString(),
          });
          console.log(`[EXTENSION] Successfully sent email notification to user ${userId}`);
        } catch (emailError) {
          console.error(`[EXTENSION] Failed to send email notification:`, emailError);
        }
      }
    } catch (error) {
      console.error(`[EXTENSION] Error in notifyAuctionExtended:`, error);
      throw error;
    }
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
    endTime: Date,
    auctionId: number
  ): Promise<void> {
    log(`Notifying user ${userId} about auction "${auctionTitle}" ending in one hour`);
    return this.createNotification(
      userId,
      {
        type: "auction_ending_soon",
        title: "Auction Ending Soon",
        message: `The auction "${auctionTitle}" will end in one hour at ${endTime.toLocaleTimeString()}`,
        reference: auctionId.toString()
      }
    );
  }

  static async notifyAuctionComplete(
    userId: number,
    auctionTitle: string,
    isWinner: boolean,
    finalPrice: number,
    isSeller: boolean = false,
    auctionId: number
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
        type: "auction_completed",
        title,
        message,
        reference: auctionId.toString()
      }
    );
  }
}