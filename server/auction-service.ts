import { storage } from "./storage";
import { NotificationService } from "./notification-service";
import { EmailService } from "./email-service";

export class AuctionService {
  static async checkAndNotifyEndingAuctions(): Promise<void> {
    try {
      console.log("[AUCTION SERVICE] Checking for auctions ending soon at " + new Date().toISOString());

      // Get all active auctions
      const activeAuctions = await storage.getAuctions({
        status: "active",
        approved: true
      });

      console.log(`[AUCTION SERVICE] Found ${activeAuctions.length} active auctions to check`);

      const now = new Date();
      const oneHourInMs = 60 * 60 * 1000;

      for (const auction of activeAuctions) {
        const endDate = new Date(auction.endDate);
        const timeUntilEnd = endDate.getTime() - now.getTime();

        // If auction ends in 1 hour (with a 5-minute window for processing)
        const oneHourWindowStart = oneHourInMs - (5 * 60 * 1000);
        const oneHourWindowEnd = oneHourInMs + (5 * 60 * 1000);

        if (timeUntilEnd > oneHourWindowStart && timeUntilEnd < oneHourWindowEnd) {
          console.log(`[AUCTION SERVICE] Auction #${auction.id} (${auction.title}) ends soon in ${Math.round(timeUntilEnd / (60 * 1000))} minutes`);

          // Check if we've already sent notifications for this auction's ending
          const existingNotifications = await storage.getNotificationsByTypeAndReference(
            "auction_ending_soon", 
            auction.id.toString()
          );

          if (existingNotifications.length > 0) {
            console.log(`[AUCTION SERVICE] Skipping auction #${auction.id} - already sent ending notifications`);
            continue;
          }

          // Get all bidders for this auction
          const bids = await storage.getBidsForAuction(auction.id);
          const uniqueBidderIds = Array.from(new Set(bids.map(bid => bid.bidderId)));

          // Notify each bidder
          for (const bidderId of uniqueBidderIds) {
            await NotificationService.notifyAuctionOneHourRemaining(
              bidderId,
              auction.title,
              endDate,
              auction.id
            );
          }

          // Also notify the seller
          await NotificationService.notifyAuctionOneHourRemaining(
            auction.sellerId,
            auction.title,
            endDate,
            auction.id
          );
        }
      }
    } catch (error) {
      console.error("[AUCTION SERVICE] Error checking for ending auctions:", error);
    }
  }

  static async checkAndNotifyCompletedAuctions(): Promise<void> {
    try {
      console.log("[AUCTION SERVICE] Checking for completed auctions at " + new Date().toISOString());

      // Get all active auctions
      const activeAuctions = await storage.getAuctions({
        status: "active",
        approved: true
      });

      console.log(`[AUCTION SERVICE] Found ${activeAuctions.length} active auctions to check`);

      const now = new Date();

      for (const auction of activeAuctions) {
        const endDate = new Date(auction.endDate);

        // If auction has ended
        if (endDate <= now) {
          console.log(`[AUCTION SERVICE] Auction #${auction.id} (${auction.title}) has ended`);

          // Check if we've already sent notifications for this auction's completion
          const existingNotifications = await storage.getNotificationsByTypeAndReference(
            "auction_completed", 
            auction.id.toString()
          );

          if (existingNotifications.length > 0) {
            console.log(`[AUCTION SERVICE] Skipping auction #${auction.id} - already sent completion notifications`);
            continue;
          }

          // Get all bids for this auction
          const bids = await storage.getBidsForAuction(auction.id);

          // Determine the winning bid (if any)
          let winningBid = null;
          if (bids.length > 0) {
            // Sort by amount (desc) and timestamp (asc)
            const sortedBids = [...bids].sort((a, b) => {
              if (a.amount !== b.amount) return b.amount - a.amount;
              return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            });
            winningBid = sortedBids[0];

            console.log(`[AUCTION SERVICE] Processing auction #${auction.id} completion:`, {
              highestBid: winningBid.amount,
              reservePrice: auction.reservePrice,
              belowReserve: winningBid.amount < auction.reservePrice
            });

            // Update the auction with the winning bidder and appropriate status
            await storage.updateAuction(auction.id, {
              winningBidderId: winningBid.bidderId,
              currentPrice: winningBid.amount,
              status: winningBid.amount >= auction.reservePrice ? "ended" : "pending_seller_decision",
              paymentStatus: winningBid.amount >= auction.reservePrice ? "pending" : "failed"
            });

            // Notify seller if below reserve
            if (winningBid.amount < auction.reservePrice) {
              console.log(`[AUCTION SERVICE] Auction #${auction.id} ended below reserve, notifying seller`);
              await NotificationService.notifySellerBelowReserve(
                auction.sellerId,
                auction.title,
                winningBid.amount,
                auction.reservePrice,
                auction.id
              );
            }
          } else {
            // No bids placed, mark as ended
            await storage.updateAuction(auction.id, {
              status: "ended",
              paymentStatus: "failed"
            });
          }

          // Notify all unique bidders
          const uniqueBidderIds = Array.from(new Set(bids.map(bid => bid.bidderId)));
          for (const bidderId of uniqueBidderIds) {
            const isWinner = winningBid && bidderId === winningBid.bidderId;
            const metReserve = winningBid && winningBid.amount >= auction.reservePrice;

            await NotificationService.notifyAuctionComplete(
              bidderId,
              auction.title,
              isWinner,
              winningBid ? winningBid.amount : auction.currentPrice,
              false,
              auction.id,
              isWinner && !metReserve ? "below_reserve" : undefined
            );
          }

          // Notify the seller
          await NotificationService.notifyAuctionComplete(
            auction.sellerId,
            auction.title,
            false,
            winningBid ? winningBid.amount : auction.currentPrice,
            true,
            auction.id,
            winningBid && winningBid.amount < auction.reservePrice ? "below_reserve" : undefined
          );
        }
      }
    } catch (error) {
      console.error("[AUCTION SERVICE] Error checking for completed auctions:", error);
    }
  }
}