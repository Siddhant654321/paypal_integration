import { storage } from "./storage";
import { NotificationService } from "./notification-service";

export class AuctionService {
  static async checkAndNotifyEndingAuctions(): Promise<void> {
    try {
      // Get all active auctions
      const auctions = await storage.getAuctions({ status: "active" });
      const now = new Date();

      for (const auction of auctions) {
        const endTime = new Date(auction.endDate);
        const timeUntilEnd = endTime.getTime() - now.getTime();
        const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

        // Check if auction ends in approximately one hour
        if (timeUntilEnd > 0 && timeUntilEnd <= oneHour) {
          // Get all unique bidders for this auction
          const bids = await storage.getBidsForAuction(auction.id);
          const uniqueBidders = [...new Set(bids.map(bid => bid.bidderId))];

          // Notify seller
          await NotificationService.notifyAuctionOneHourRemaining(
            auction.sellerId,
            auction.title,
            endTime
          );

          // Notify all bidders
          for (const bidderId of uniqueBidders) {
            await NotificationService.notifyAuctionOneHourRemaining(
              bidderId,
              auction.title,
              endTime
            );
          }
        }
      }
    } catch (error) {
      console.error("Error checking ending auctions:", error);
    }
  }

  static async checkAndNotifyCompletedAuctions(): Promise<void> {
    try {
      // Get auctions that have just ended but haven't been processed
      const auctions = await storage.getAuctions({ status: "active" });
      const now = new Date();

      for (const auction of auctions) {
        const endTime = new Date(auction.endDate);
        
        if (endTime <= now) {
          // Get all bids for this auction
          const bids = await storage.getBidsForAuction(auction.id);
          const uniqueBidders = [...new Set(bids.map(bid => bid.bidderId))];
          
          // Get the winning bid (highest amount)
          const winningBid = bids.reduce((highest, current) => 
            current.amount > highest.amount ? current : highest
          , bids[0]);

          // Mark auction as completed
          await storage.updateAuction(auction.id, { 
            status: "completed",
            winningBidderId: winningBid?.bidderId
          });

          // Notify seller
          await NotificationService.notifyAuctionComplete(
            auction.sellerId,
            auction.title,
            false,
            winningBid?.amount || auction.startPrice,
            true
          );

          // Notify all bidders
          for (const bidderId of uniqueBidders) {
            await NotificationService.notifyAuctionComplete(
              bidderId,
              auction.title,
              bidderId === winningBid?.bidderId,
              winningBid?.amount || auction.startPrice
            );
          }
        }
      }
    } catch (error) {
      console.error("Error processing completed auctions:", error);
    }
  }
}
