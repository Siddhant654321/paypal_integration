import { storage } from "./storage";
import { NotificationService } from "./notification-service";
import { log } from "./vite";

export class AuctionReminderService {
  static async checkAndSendReminders(): Promise<void> {
    try {
      // Get all active auctions
      const activeAuctions = await storage.getAuctions({ approved: true });
      const now = new Date();

      for (const auction of activeAuctions) {
        const endDate = new Date(auction.endDate);
        const hoursRemaining = (endDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Check if auction is within reminder windows (12 hours or 1 hour)
        // Add a 5-minute buffer to avoid missing notifications
        if ((hoursRemaining <= 12.1 && hoursRemaining > 11.9) || 
            (hoursRemaining <= 1.1 && hoursRemaining > 0.9)) {
          
          // Get unique bidders for this auction
          const bids = await storage.getBidsForAuction(auction.id);
          const uniqueBidders = [...new Set(bids.map(bid => bid.bidderId))];

          // Send notification to each bidder
          for (const bidderId of uniqueBidders) {
            try {
              await NotificationService.notifyAuctionReminder(
                bidderId,
                auction.title,
                Math.round(hoursRemaining),
                auction.id
              );
              log(`Sent ${hoursRemaining}h reminder to bidder ${bidderId} for auction ${auction.id}`, "reminder");
            } catch (error) {
              log(`Failed to send reminder to bidder ${bidderId}: ${error}`, "reminder");
            }
          }
        }
      }
    } catch (error) {
      log(`Error in auction reminder service: ${error}`, "reminder");
      throw error;
    }
  }
}
