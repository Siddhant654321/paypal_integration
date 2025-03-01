import { storage } from "./storage";
import { EmailService } from "./email-service";
import { type InsertNotification, type User } from "@shared/schema";
import { log } from "./vite";
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

export class NotificationService {
  private static wss: WebSocketServer;
  private static userSockets: Map<number, WebSocket[]> = new Map();

  static initialize(server: Server) {
    try {
      log("Creating WebSocket server...", "notification");
      this.wss = new WebSocketServer({ server, path: '/ws' });
      log("WebSocket server created successfully", "notification");

      this.wss.on('connection', (ws: WebSocket) => {
        log("New WebSocket connection established", "notification");
        
        ws.on('message', async (message: string) => {
          try {
            const data = JSON.parse(message);
            if (data.type === 'auth' && data.userId) {
              const userSockets = this.userSockets.get(data.userId) || [];
              userSockets.push(ws);
              this.userSockets.set(data.userId, userSockets);
              log(`User ${data.userId} authenticated on WebSocket`, "notification");
            }
          } catch (error) {
            log(`WebSocket message error: ${error}`, "notification");
          }
        });

        ws.on('close', () => {
          for (const [userId, sockets] of this.userSockets.entries()) {
            const index = sockets.indexOf(ws);
            if (index !== -1) {
              sockets.splice(index, 1);
              if (sockets.length === 0) {
                this.userSockets.delete(userId);
              }
              log(`WebSocket connection closed for user ${userId}`, "notification");
              break;
            }
          }
        });
        
        ws.on('error', (error) => {
          log(`WebSocket error: ${error}`, "notification");
        });
      });
      
      this.wss.on('error', (error) => {
        log(`WebSocket server error: ${error}`, "notification");
      });
      
    } catch (error) {
      log(`Failed to initialize WebSocket server: ${error}`, "notification");
    }
  }

  private static async sendWebSocketMessage(userId: number, notification: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      const message = JSON.stringify(notification);
      sockets.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message);
        }
      });
    }
  }

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
      const createdNotification = await storage.createNotification({
        ...notification,
        userId,
      });

      // Send websocket notification
      await this.sendWebSocketMessage(userId, createdNotification);

      // Send email notification if enabled
      if (user.emailNotificationsEnabled) {
        await EmailService.sendNotification(
          emailData.type,
          user,
          emailData.data
        );
      }
    } catch (error) {
      log(`Error creating notification and sending email: ${error}`, "notification");
      throw error;
    }
  }

  // Auction specific notifications
  static async notifyNewBid(
    sellerId: number,
    auctionTitle: string,
    bidAmount: number
  ): Promise<void> {
    return this.createNotificationAndSendEmail(
      sellerId,
      {
        type: "bid",
        title: "New Bid Received",
        message: `A new bid of $${bidAmount/100} has been placed on your auction "${auctionTitle}"`,
      },
      {
        type: "bid",
        data: {
          auctionTitle,
          bidAmount: bidAmount/100,
        },
      }
    );
  }

  static async notifyOutbid(
    previousBidderId: number,
    auctionTitle: string,
    newBidAmount: number
  ): Promise<void> {
    return this.createNotificationAndSendEmail(
      previousBidderId,
      {
        type: "bid",
        title: "You've Been Outbid",
        message: `Someone has placed a higher bid of $${newBidAmount/100} on "${auctionTitle}"`,
      },
      {
        type: "bid",
        data: {
          auctionTitle,
          bidAmount: newBidAmount/100,
        },
      }
    );
  }

  static async notifyAuctionEnding(
    bidderId: number,
    auctionTitle: string
  ): Promise<void> {
    return this.createNotificationAndSendEmail(
      bidderId,
      {
        type: "auction",
        title: "Auction Ending Soon",
        message: `The auction "${auctionTitle}" will end in 12 hours`,
      },
      {
        type: "auction",
        data: {
          auctionTitle,
          status: "ending soon",
        },
      }
    );
  }

  static async notifyAuctionEnd(
    userId: number,
    auctionTitle: string,
    status: string,
    isWinner: boolean
  ): Promise<void> {
    const message = isWinner 
      ? `Congratulations! You've won the auction "${auctionTitle}"`
      : `The auction "${auctionTitle}" has ended`;

    return this.createNotificationAndSendEmail(
      userId,
      {
        type: "auction",
        title: isWinner ? "Auction Won" : "Auction Ended",
        message,
      },
      {
        type: "auction",
        data: {
          auctionTitle,
          status: isWinner ? "won" : "ended",
        },
      }
    );
  }
  static async notifyBid(
    userId: number,
    auctionTitle: string,
    bidAmount: number
  ): Promise<void> {
    return this.createNotificationAndSendEmail(
      userId,
      {
        type: "bid",
        title: "New Bid Received",
        message: `A new bid of $${bidAmount} has been placed on your auction "${auctionTitle}"`,
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

  static async notifyAuctionEndOld(
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

  static async notifyFulfillment(
    userId: number,
    fulfillmentData: {
      auctionTitle: string;
      shippingCarrier: string;
      trackingNumber: string;
      shippingDate: string;
      estimatedDeliveryDate?: string;
    }
  ): Promise<void> {
    return this.createNotificationAndSendEmail(
      userId,
      {
        type: "fulfillment",
        title: "Shipping Update",
        message: `Your item from auction "${fulfillmentData.auctionTitle}" has been shipped`,
      },
      {
        type: "fulfillment",
        data: fulfillmentData,
      }
    );
  }

  static async notifyAdmin(
    userId: number,
    message: string
  ): Promise<void> {
    return this.createNotificationAndSendEmail(
      userId,
      {
        type: "admin",
        title: "Administrative Notice",
        message,
      },
      {
        type: "admin",
        data: {
          message,
        },
      }
    );
  }
}