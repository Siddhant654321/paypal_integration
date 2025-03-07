import { storage } from "./storage";
import { EmailService } from "./email-service";
import { sql } from "drizzle-orm";
import { db } from "./db";

export class DailyUpdateService {
  static async sendDailyUpdates() {
    try {
      console.log("[DAILY UPDATE] Starting daily auction update process");

      // Get all users who opted in for daily updates
      const users = await storage.getUsers({
        approved: true,
        hasProfile: true
      });

      // Filter users who have opted in for daily updates
      const subscribedUsers = users.filter(async user => {
        const profile = await storage.getProfile(user.id);
        return profile?.emailDailyUpdates;
      });

      if (!subscribedUsers.length) {
        console.log("[DAILY UPDATE] No users opted in for daily updates");
        return;
      }

      // Get auctions created in the last 24 hours
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const newAuctions = await storage.getAuctions({
        status: "active",
        approved: true
      });

      // Filter auctions created in the last 24 hours
      const recentAuctions = newAuctions.filter(auction => {
        const createdAt = new Date(auction.startDate);
        return createdAt > yesterday;
      });

      if (!recentAuctions.length) {
        console.log("[DAILY UPDATE] No new auctions to report");
        return;
      }

      console.log(`[DAILY UPDATE] Sending updates for ${recentAuctions.length} auctions to ${subscribedUsers.length} users`);

      // Format auctions for email
      const formattedAuctions = recentAuctions.map(auction => ({
        id: auction.id,
        title: auction.title,
        description: auction.description,
        imageUrl: auction.images[0], // Use first image as main image
        startingPrice: auction.startPrice,
        endDate: auction.endDate
      }));

      // Send emails
      await EmailService.sendDailyUpdate(subscribedUsers, formattedAuctions);

      console.log("[DAILY UPDATE] Successfully sent daily updates");
    } catch (error) {
      console.error("[DAILY UPDATE] Error sending daily updates:", error);
      throw error;
    }
  }

  // This method should be called once when the server starts
  static async scheduleDailyUpdates() {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    // Calculate time until next 9 AM
    const now = new Date();
    const next9AM = new Date(now);
    next9AM.setHours(9, 0, 0, 0);
    if (now.getHours() >= 9) {
      next9AM.setDate(next9AM.getDate() + 1);
    }

    const timeUntilNext9AM = next9AM.getTime() - now.getTime();

    // Schedule first run
    setTimeout(async () => {
      await this.sendDailyUpdates();

      // Schedule subsequent runs every 24 hours
      setInterval(async () => {
        await this.sendDailyUpdates();
      }, TWENTY_FOUR_HOURS);
    }, timeUntilNext9AM);

    console.log(`[DAILY UPDATE] Scheduled daily updates to start at ${next9AM.toLocaleString()}`);
  }
}