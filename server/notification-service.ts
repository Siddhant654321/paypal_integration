import { storage } from "./storage";
import { type InsertNotification } from "@shared/schema";
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

const log = (message: string, context: string = 'notification') => {
  console.log(`[${context}] ${message}`);
};

export class NotificationService {
  private static wss: WebSocketServer;
  private static userSockets: Map<number, WebSocket[]> = new Map();

  static initialize(server: Server) {
    try {
      // Create WebSocket server with a unique path
      log("Creating WebSocket server...");
      this.wss = new WebSocketServer({ 
        server,
        path: '/notifications-ws'  // Changed path to avoid conflicts
      });
      log("WebSocket server created successfully");

      this.wss.on('connection', (ws: WebSocket) => {
        log("New WebSocket connection established");

        ws.on('message', async (message: string) => {
          try {
            const data = JSON.parse(message);
            if (data.type === 'auth' && data.userId) {
              const userSockets = this.userSockets.get(data.userId) || [];
              userSockets.push(ws);
              this.userSockets.set(data.userId, userSockets);
              log(`User ${data.userId} authenticated on WebSocket`);
            }
          } catch (error) {
            log(`WebSocket message error: ${error}`);
          }
        });

        ws.on('close', () => {
          Array.from(this.userSockets.entries()).forEach(([userId, sockets]) => {
            const index = sockets.indexOf(ws);
            if (index !== -1) {
              sockets.splice(index, 1);
              if (sockets.length === 0) {
                this.userSockets.delete(userId);
              }
              log(`WebSocket connection closed for user ${userId}`);
            }
          });
        });

        ws.on('error', (error) => {
          log(`WebSocket error: ${error}`);
        });
      });

    } catch (error) {
      // Log error but don't throw to prevent server crash
      log(`Failed to initialize WebSocket server: ${error}`);
      console.error('Full error:', error);
    }
  }

  static async createNotification(
    userId: number,
    notification: Omit<InsertNotification, "userId">
  ): Promise<void> {
    try {
      const createdNotification = await storage.createNotification({
        ...notification,
        userId,
      });

      // Only try to send WebSocket message if the server is initialized
      if (this.wss) {
        await this.sendWebSocketMessage(userId, createdNotification);
      }
    } catch (error) {
      log(`Error creating notification: ${error}`);
      // Log error but don't throw to maintain app functionality
      console.error('Notification error:', error);
    }
  }

  private static async sendWebSocketMessage(userId: number, notification: any) {
    try {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        const message = JSON.stringify(notification);
        sockets.forEach(socket => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(message);
          }
        });
      }
    } catch (error) {
      log(`Error sending WebSocket message: ${error}`);
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