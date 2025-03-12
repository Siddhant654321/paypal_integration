import nodemailer from 'nodemailer';
import { User } from '@shared/schema';
import { storage } from './storage';

// Initialize nodemailer transport with detailed logging
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  logger: true, // Enable logging
  debug: true, // Enable debug logging
});

const SITE_URL = process.env.SITE_URL || 'http://localhost:5000';

// Email templates for different notification types
const emailTemplates = {
  bid: (data: { auctionTitle: string; bidAmount: number; auctionId: number; isOutbid?: boolean }) => ({
    subject: data.isOutbid 
      ? `You've been outbid on ${data.auctionTitle}`
      : `New Bid on ${data.auctionTitle}`,
    html: data.isOutbid
      ? `
        <h2>You've Been Outbid!</h2>
        <p>Someone has placed a higher bid of $${(data.bidAmount/100).toFixed(2)} on "${data.auctionTitle}".</p>
        <p><a href="${SITE_URL}/auctions/${data.auctionId}">Log in now to place a new bid!</a></p>
        <hr>
        <p><small>You received this email because you opted in to auction notifications. 
        <a href="${SITE_URL}/profile/notifications">Manage your notification preferences</a></small></p>
      `
      : `
        <h2>New Bid Received</h2>
        <p>A new bid of $${(data.bidAmount/100).toFixed(2)} has been placed on your auction "${data.auctionTitle}".</p>
        <p><a href="${SITE_URL}/auctions/${data.auctionId}">View auction details</a></p>
        <hr>
        <p><small>You received this email because you opted in to auction notifications. 
        <a href="${SITE_URL}/profile/notifications">Manage your notification preferences</a></small></p>
      `,
  }),

  daily_digest: (data: { 
    newAuctions: Array<{
      id: number;
      title: string;
      startPrice: number;
      endDate: Date;
    }>;
    userName: string;
  }) => ({
    subject: 'Your Daily Auction Update',
    html: `
      <h2>Hello ${data.userName}!</h2>
      <p>Here are the new auctions from the last 24 hours:</p>
      ${data.newAuctions.length > 0 
        ? `<ul>
            ${data.newAuctions.map(auction => `
              <li>
                <strong><a href="${SITE_URL}/auctions/${auction.id}">${auction.title}</a></strong><br>
                Starting at: $${(auction.startPrice/100).toFixed(2)}<br>
                Ends: ${new Date(auction.endDate).toLocaleDateString()}
              </li>
            `).join('')}
          </ul>`
        : '<p>No new auctions were added today.</p>'
      }
      <p><a href="${SITE_URL}/auctions">Browse all active auctions</a></p>
      <hr>
      <p><small>You received this email because you opted in to daily auction updates. 
      <a href="${SITE_URL}/profile/notifications">Manage your notification preferences</a></small></p>
    `,
  }),

  admin_new_seller: (data: { sellerName: string; sellerEmail: string; sellerId: number }) => ({
    subject: 'New Seller Registration Pending Approval',
    html: `
      <h2>New Seller Registration</h2>
      <p>A new seller has registered and is waiting for approval:</p>
      <ul>
        <li><strong>Name:</strong> ${data.sellerName}</li>
        <li><strong>Email:</strong> ${data.sellerEmail}</li>
      </ul>
      <p><a href="${SITE_URL}/admin/sellers/${data.sellerId}">Review this seller registration</a></p>
      <hr>
      <p><small>You received this email because you are an administrator.</small></p>
    `,
  }),

  admin_new_auction: (data: { 
    auctionTitle: string; 
    sellerName: string;
    startPrice: number;
    category: string;
    auctionId: number;
  }) => ({
    subject: 'New Auction Pending Review',
    html: `
      <h2>New Auction Listing</h2>
      <p>A new auction has been created and requires review:</p>
      <ul>
        <li><strong>Title:</strong> ${data.auctionTitle}</li>
        <li><strong>Seller:</strong> ${data.sellerName}</li>
        <li><strong>Start Price:</strong> $${(data.startPrice/100).toFixed(2)}</li>
        <li><strong>Category:</strong> ${data.category}</li>
      </ul>
      <p><a href="${SITE_URL}/admin/auctions/${data.auctionId}">Review this auction</a></p>
      <hr>
      <p><small>You received this email because you are an administrator.</small></p>
    `,
  }),
};

export class EmailService {
  static async sendNotification<T extends keyof typeof emailTemplates>(
    type: T,
    user: User,
    data: Parameters<typeof emailTemplates[T]>[0]
  ) {
    try {
      if (!user.emailNotificationsEnabled && type !== 'admin_new_seller' && type !== 'admin_new_auction') {
        console.log(`[EMAIL] Skipping notification for user ${user.id} (notifications disabled)`);
        return false;
      }

      const template = emailTemplates[type](data as any);
      await transporter.sendMail({
        from: `"Pips 'n Chicks" <${process.env.SMTP_USER}>`,
        to: user.email,
        ...template,
      });
      return true;
    } catch (error) {
      console.error('[EMAIL] Failed to send notification:', error);
      return false;
    }
  }

  static async verifyConnection() {
    try {
      await transporter.verify();
      console.log('[EMAIL] SMTP connection verified successfully');
      return true;
    } catch (error) {
      console.error('[EMAIL] SMTP connection verification failed:', error);
      return false;
    }
  }

  static async sendDailyDigest() {
    try {
      // Get users who opted in for daily digests
      const subscribedUsers = await storage.getUsers({ emailDigestEnabled: true });

      // Get auctions created in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const newAuctions = await storage.getAuctions({ 
        createdAfter: oneDayAgo,
        approved: true 
      });

      console.log(`[EMAIL] Sending daily digest to ${subscribedUsers.length} users, ${newAuctions.length} new auctions`);

      // Send digest to each subscribed user
      for (const user of subscribedUsers) {
        if (!user.email) continue;

        await this.sendNotification('daily_digest', user, {
          newAuctions,
          userName: user.username
        });
      }

      console.log('[EMAIL] Daily digest sent successfully');
    } catch (error) {
      console.error('[EMAIL] Error sending daily digest:', error);
    }
  }

  static async notifyAdminsOfNewSeller(seller: User): Promise<void> {
    try {
      console.log("[EMAIL] Preparing to notify admins about new seller registration:", {
        sellerId: seller.id,
        username: seller.username
      });

      const admins = await storage.getUsers({ role: "seller_admin" });
      if (!admins?.length) {
        console.log("[EMAIL] No admin users found to notify");
        return;
      }

      const sellerProfile = await storage.getProfile(seller.id);
      if (!sellerProfile) {
        console.log("[EMAIL] Seller profile not found");
        return;
      }

      const emailData = {
        sellerName: sellerProfile.fullName || seller.username,
        sellerEmail: sellerProfile.email,
        sellerId: seller.id
      };

      for (const admin of admins) {
        if (!admin.email) continue;
        await this.sendNotification("admin_new_seller", admin, emailData);
        console.log("[EMAIL] Sent new seller notification to admin:", admin.email);
      }

    } catch (error) {
      console.error("[EMAIL] Error sending admin notifications for new seller:", error);
    }
  }

  static async notifyAdminsOfNewAuction(auctionId: number): Promise<void> {
    try {
      console.log("[EMAIL] Preparing to notify admins about new auction:", auctionId);

      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        console.log("[EMAIL] Auction not found:", auctionId);
        return;
      }

      const seller = await storage.getUser(auction.sellerId);
      if (!seller) {
        console.log("[EMAIL] Seller not found for auction:", auctionId);
        return;
      }

      const sellerProfile = await storage.getProfile(seller.id);
      const admins = await storage.getUsers({ role: "seller_admin" });

      if (!admins?.length) {
        console.log("[EMAIL] No admin users found to notify");
        return;
      }

      const emailData = {
        auctionTitle: auction.title,
        sellerName: sellerProfile?.fullName || seller.username,
        startPrice: auction.startPrice,
        category: auction.category,
        auctionId: auction.id
      };

      for (const admin of admins) {
        if (!admin.email) continue;
        await this.sendNotification("admin_new_auction", admin, emailData);
        console.log("[EMAIL] Sent new auction notification to admin:", admin.email);
      }

    } catch (error) {
      console.error("[EMAIL] Error sending admin notifications for new auction:", error);
    }
  }
}