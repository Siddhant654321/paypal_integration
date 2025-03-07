import { storage } from "./storage";
import { NotificationService } from "./notification-service";

export class AuctionService {
  static async checkAndNotifyEndingAuctions(): Promise<void> {
    try {
      // Get all active auctions
      const auctions = await storage.getAuctions({ status: "active" });
      const now = new Date();
      console.log(`[AUCTION SERVICE] Checking for auctions ending soon at ${now.toISOString()}`);
      console.log(`[AUCTION SERVICE] Found ${auctions.length} active auctions to check`);

      for (const auction of auctions) {
        const endTime = new Date(auction.endDate);
        const timeUntilEnd = endTime.getTime() - now.getTime();
        const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds

        // Check if auction ends in approximately one hour
        if (timeUntilEnd > 0 && timeUntilEnd <= oneHour) {
          // Check if we've already sent a notification for this auction
          const existingNotifications = await storage.getNotificationsByTypeAndReference(
            "auction_ending_soon", 
            auction.id.toString()
          );
          
          if (existingNotifications.length > 0) {
            console.log(`[AUCTION SERVICE] Skipping notification for auction #${auction.id} - already sent`);
            continue; // Skip if we've already sent a notification
          }
          
          console.log(`[AUCTION SERVICE] Sending notifications for auction #${auction.id} ending soon`);
          
          // Get all unique bidders for this auction
          const bids = await storage.getBidsForAuction(auction.id);
          const uniqueBidders = [...new Set(bids.map(bid => bid.bidderId))];

          // Notify seller
          await NotificationService.notifyAuctionOneHourRemaining(
            auction.sellerId,
            auction.title,
            endTime,
            auction.id
          );

          // Notify all bidders
          for (const bidderId of uniqueBidders) {
            await NotificationService.notifyAuctionOneHourRemaining(
              bidderId,
              auction.title,
              endTime,
              auction.id
            );
          }
          
          console.log(`[AUCTION SERVICE] Successfully sent notifications for auction #${auction.id}`);
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

      console.log(`[AUCTION SERVICE] Checking for completed auctions at ${now.toISOString()}`);
      console.log(`[AUCTION SERVICE] Found ${auctions.length} active auctions to check`);

      for (const auction of auctions) {
        const endTime = new Date(auction.endDate);
        
        if (endTime <= now) {
          console.log(`[AUCTION SERVICE] Auction #${auction.id} "${auction.title}" has ended at ${endTime.toISOString()}`);
          
          // Check if we've already processed this auction
          const existingNotifications = await storage.getNotificationsByTypeAndReference(
            "auction_completed", 
            auction.id.toString()
          );
          
          if (existingNotifications.length > 0) {
            console.log(`[AUCTION SERVICE] Skipping auction #${auction.id} - already processed`);
            continue; // Skip if we've already processed this auction
          }
          
          // Get all bids for this auction
          const bids = await storage.getBidsForAuction(auction.id);
          console.log(`[AUCTION SERVICE] Auction #${auction.id} has ${bids.length} bids`);
          
          const uniqueBidders = [...new Set(bids.map(bid => bid.bidderId))];
          
          // Get the winning bid (highest amount)
          let winningBid = null;
          if (bids.length > 0) {
            winningBid = bids.reduce((highest, current) => 
              current.amount > highest.amount ? current : highest
            , bids[0]);
            console.log(`[AUCTION SERVICE] Winning bid: ${winningBid.amount} by user ${winningBid.bidderId}`);
          } else {
            console.log(`[AUCTION SERVICE] No bids for auction #${auction.id}`);
          }

          // Mark auction as ended with correct status
          const updateData = { 
            status: "ended",
            winningBidderId: winningBid?.bidderId || null
          };
          
          console.log(`[AUCTION SERVICE] Updating auction #${auction.id} with:`, updateData);
          await storage.updateAuction(auction.id, updateData);

          // Notify seller
          await NotificationService.notifyAuctionComplete(
            auction.sellerId,
            auction.title,
            false,
            winningBid?.amount || auction.startPrice,
            true,
            auction.id
          );

          // Notify all bidders
          for (const bidderId of uniqueBidders) {
            await NotificationService.notifyAuctionComplete(
              bidderId,
              auction.title,
              bidderId === winningBid?.bidderId,
              winningBid?.amount || auction.startPrice,
              false,
              auction.id
            );
          }
          
          console.log(`[AUCTION SERVICE] Successfully processed auction #${auction.id}`);
        }
      }
    } catch (error) {
      console.error("Error processing completed auctions:", error);
    }
  }
}
