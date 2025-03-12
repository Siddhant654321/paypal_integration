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

// Ensure SITE_URL is properly set
const SITE_URL = process.env.SITE_URL || (process.env.REPL_SLUG 
  ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
  : 'http://localhost:5000');

// Common email styling
const emailStyles = `
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4a90e2; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #ffffff; padding: 20px; border-radius: 0 0 5px 5px; }
    .button { 
      display: inline-block; 
      padding: 10px 20px; 
      background: #4a90e2; 
      color: white; 
      text-decoration: none; 
      border-radius: 5px; 
      margin: 10px 0; 
    }
    .footer { 
      margin-top: 20px; 
      padding-top: 20px; 
      border-top: 1px solid #eee; 
      font-size: 12px; 
      color: #666; 
    }
    .auction-card {
      border: 1px solid #eee;
      padding: 15px;
      margin: 10px 0;
      border-radius: 5px;
    }
    .auction-image {
      width: 100%;
      max-width: 200px;
      height: auto;
      border-radius: 5px;
      margin: 10px 0;
    }
    .price { 
      font-size: 18px; 
      color: #2ecc71; 
      font-weight: bold; 
    }
    .highlight {
      background: #fff3cd;
      padding: 2px 5px;
      border-radius: 3px;
    }
  </style>
`;

// Email templates for different notification types
const emailTemplates = {
  bid: (data: { auctionTitle: string; bidAmount: number; auctionId: number; isOutbid?: boolean }) => ({
    subject: data.isOutbid 
      ? `You've been outbid on ${data.auctionTitle}`
      : `New Bid on ${data.auctionTitle}`,
    html: `
      ${emailStyles}
      <div class="container">
        <div class="header">
          <h1>${data.isOutbid ? 'Outbid Alert!' : 'New Bid Received'}</h1>
        </div>
        <div class="content">
          <h2>${data.isOutbid ? 'Time to Act Fast!' : 'Exciting News!'}</h2>
          ${data.isOutbid
            ? `
              <p>Someone has placed a higher bid of <span class="price">$${(data.bidAmount/100).toFixed(2)}</span> on 
                "<strong>${data.auctionTitle}</strong>".
              </p>
              <p>Don't miss out on this opportunity! Review the current status and place your next bid.</p>
              <a href="${SITE_URL}/auctions/${data.auctionId}" class="button">Place Your Bid Now</a>
            `
            : `
              <p>Great news! A new bid of <span class="price">$${(data.bidAmount/100).toFixed(2)}</span> has been placed on your auction 
                "<strong>${data.auctionTitle}</strong>".
              </p>
              <p>Keep track of your auction's progress and stay tuned for more updates.</p>
              <a href="${SITE_URL}/auctions/${data.auctionId}" class="button">View Auction Details</a>
            `
          }
        </div>
        <div class="footer">
          <p>You received this email because you opted in to auction notifications.</p>
          <p><a href="${SITE_URL}/profile/notifications">Manage your notification preferences</a></p>
        </div>
      </div>
    `,
  }),

  daily_digest: (data: { 
    newAuctions: Array<{
      id: number;
      title: string;
      startPrice: number;
      endDate: Date;
      imageUrl?: string;
      description?: string;
    }>;
    userName: string;
  }) => ({
    subject: 'Your Daily Auction Update',
    html: `
      ${emailStyles}
      <div class="container">
        <div class="header">
          <h1>Daily Auction Update</h1>
        </div>
        <div class="content">
          <h2>Hello ${data.userName}!</h2>
          <p>Here are the exciting new auctions from the last 24 hours:</p>

          ${data.newAuctions.length > 0 
            ? data.newAuctions.map(auction => `
                <div class="auction-card">
                  ${auction.imageUrl 
                    ? `<img src="${auction.imageUrl}" alt="${auction.title}" class="auction-image">` 
                    : ''
                  }
                  <h3><a href="${SITE_URL}/auctions/${auction.id}">${auction.title}</a></h3>
                  ${auction.description 
                    ? `<p>${auction.description.substring(0, 150)}${auction.description.length > 150 ? '...' : ''}</p>`
                    : ''
                  }
                  <p><span class="price">Starting at: $${(auction.startPrice/100).toFixed(2)}</span></p>
                  <p>Ends: ${new Date(auction.endDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</p>
                  <a href="${SITE_URL}/auctions/${auction.id}" class="button">View Auction</a>
                </div>
              `).join('')
            : '<p>No new auctions were added today. Check back tomorrow for new listings!</p>'
          }

          <div style="margin-top: 20px;">
            <h3>Looking for something specific?</h3>
            <p>Browse our current auctions or create a buyer request to find exactly what you're looking for.</p>
            <div style="margin-top: 15px;">
              <a href="${SITE_URL}/auctions" class="button">Browse All Auctions</a>
              <a href="${SITE_URL}/buyer-requests/new" class="button" style="margin-left: 10px;">Create Buyer Request</a>
            </div>
          </div>
        </div>
        <div class="footer">
          <p>You received this email because you opted in to daily auction updates.</p>
          <p><a href="${SITE_URL}/profile/notifications">Manage your notification preferences</a></p>
        </div>
      </div>
    `,
  }),

  admin_new_seller: (data: { sellerName: string; sellerEmail: string; sellerId: number }) => ({
    subject: 'New Seller Registration Pending Approval',
    html: `
      ${emailStyles}
      <div class="container">
        <div class="header">
          <h1>New Seller Registration</h1>
        </div>
        <div class="content">
          <h2>New Seller Review Required</h2>
          <p>A new seller has registered and is waiting for your approval:</p>

          <div class="auction-card">
            <h3>Seller Details</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Name:</strong> ${data.sellerName}</li>
              <li><strong>Email:</strong> ${data.sellerEmail}</li>
            </ul>

            <p>Please review their application and verify their credentials.</p>
            <a href="${SITE_URL}/admin/sellers/${data.sellerId}" class="button">Review Seller Application</a>
          </div>

          <div style="margin-top: 20px;">
            <p><strong>Reminder:</strong> Check for:</p>
            <ul>
              <li>Valid contact information</li>
              <li>Business credentials</li>
              <li>NPIP certification (if applicable)</li>
            </ul>
          </div>
        </div>
        <div class="footer">
          <p>You received this email because you are an administrator.</p>
        </div>
      </div>
    `,
  }),

  admin_new_auction: (data: { 
    auctionTitle: string; 
    sellerName: string;
    startPrice: number;
    category: string;
    auctionId: number;
    imageUrl?: string;
    description?: string;
  }) => ({
    subject: 'New Auction Pending Review',
    html: `
      ${emailStyles}
      <div class="container">
        <div class="header">
          <h1>New Auction Review Required</h1>
        </div>
        <div class="content">
          <h2>New Auction Listing</h2>
          <p>A new auction has been created and requires your review:</p>

          <div class="auction-card">
            ${data.imageUrl 
              ? `<img src="${data.imageUrl}" alt="${data.auctionTitle}" class="auction-image">` 
              : ''
            }
            <h3>${data.auctionTitle}</h3>
            ${data.description 
              ? `<p>${data.description.substring(0, 200)}${data.description.length > 200 ? '...' : ''}</p>`
              : ''
            }
            <ul style="list-style: none; padding: 0;">
              <li><strong>Seller:</strong> ${data.sellerName}</li>
              <li><strong>Start Price:</strong> <span class="price">$${(data.startPrice/100).toFixed(2)}</span></li>
              <li><strong>Category:</strong> ${data.category}</li>
            </ul>

            <p>Please review the listing details and ensure it meets our marketplace standards.</p>
            <a href="${SITE_URL}/admin/auctions/${data.auctionId}" class="button">Review This Auction</a>
          </div>

          <div style="margin-top: 20px;">
            <p><strong>Review Checklist:</strong></p>
            <ul>
              <li>Appropriate pricing</li>
              <li>Clear description</li>
              <li>Quality of images</li>
              <li>Accurate categorization</li>
            </ul>
          </div>
        </div>
        <div class="footer">
          <p>You received this email because you are an administrator.</p>
        </div>
      </div>
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
        auctionId: auction.id,
        imageUrl: auction.imageUrl, 
        description: auction.description 
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

  static async sendTestEmails(testEmail: string) {
    try {
      console.log("[EMAIL] Sending test emails to:", testEmail);

      // Create a test user for sending notifications
      const testUser: User = {
        id: 999,
        username: "Test User",
        email: testEmail,
        role: "seller_admin",
        approved: true,
        hasProfile: true,
        emailNotificationsEnabled: true,
        password: ""
      };

      // 1. Test Daily Digest
      await this.sendNotification('daily_digest', testUser, {
        newAuctions: [
          {
            id: 1,
            title: "Show Quality Bantam Pair",
            startPrice: 5000, 
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 
            imageUrl: "https://example.com/bantam1.jpg", 
            description: "A beautiful pair of show quality bantams, ready to win ribbons!" 
          },
          {
            id: 2,
            title: "Heritage Breed Hatching Eggs",
            startPrice: 3500, 
            endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), 
            imageUrl: "https://example.com/eggs1.jpg", 
            description: "Fresh hatching eggs from our heritage breed chickens.  Expect healthy chicks!" 
          }
        ],
        userName: "Test User"
      });
      console.log("[EMAIL] Sent test daily digest email");

      // 2. Test New Seller Notification
      await this.sendNotification('admin_new_seller', testUser, {
        sellerName: "John Smith",
        sellerEmail: "john.smith@example.com",
        sellerId: 123
      });
      console.log("[EMAIL] Sent test new seller notification");

      // 3. Test New Auction Notification
      await this.sendNotification('admin_new_auction', testUser, {
        auctionTitle: "Premium Bantam Breeding Pair",
        sellerName: "Jane Doe",
        startPrice: 7500, 
        category: "Show Quality",
        auctionId: 456,
        imageUrl: "https://example.com/bantam2.jpg", 
        description: "Exceptional breeding pair of bantams, producing prize-winning offspring!" 
      });
      console.log("[EMAIL] Sent test new auction notification");

      // 4. Test Bid Update (both new bid and outbid)
      await this.sendNotification('bid', testUser, {
        auctionTitle: "Rare Breed Chickens",
        bidAmount: 8000, 
        auctionId: 789,
        isOutbid: false
      });

      await this.sendNotification('bid', testUser, {
        auctionTitle: "Rare Breed Chickens",
        bidAmount: 8500, 
        auctionId: 789,
        isOutbid: true
      });
      console.log("[EMAIL] Sent test bid notifications");

      console.log("[EMAIL] Successfully sent all test emails");
      return true;
    } catch (error) {
      console.error("[EMAIL] Error sending test emails:", error);
      throw error;
    }
  }
}