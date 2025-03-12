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

// Email templates for different notification types
const emailTemplates = {
  bid: (data: { auctionTitle: string; bidAmount: number; isOutbid?: boolean }) => ({
    subject: data.isOutbid 
      ? `You've been outbid on ${data.auctionTitle}`
      : `New Bid on ${data.auctionTitle}`,
    html: data.isOutbid
      ? `
        <h2>You've Been Outbid!</h2>
        <p>Someone has placed a higher bid of $${data.bidAmount} on "${data.auctionTitle}".</p>
        <p>Log in now to place a new bid!</p>
      `
      : `
        <h2>New Bid Received</h2>
        <p>A new bid of $${data.bidAmount} has been placed on your auction "${data.auctionTitle}".</p>
        <p>Log in to your account to view the details.</p>
      `,
  }),
  auction: (data: { auctionTitle: string; status: string; isWinner?: boolean }) => ({
    subject: `Auction ${data.status === 'ending soon' 
      ? 'Ending Soon' 
      : data.isWinner 
        ? 'Won!' 
        : 'Ended'}: ${data.auctionTitle}`,
    html: data.status === 'ending soon'
      ? `
        <h2>Auction Ending Soon</h2>
        <p>The auction "${data.auctionTitle}" will end in 1 hour.</p>
        <p>Log in now to check the current status and place your final bids!</p>
      `
      : data.isWinner
        ? `
          <h2>Congratulations! You've Won!</h2>
          <p>You are the winning bidder for "${data.auctionTitle}"!</p>
          <p>Log in to your account to complete the payment and arrange delivery.</p>
        `
        : `
          <h2>Auction Has Ended</h2>
          <p>The auction "${data.auctionTitle}" has ended.</p>
          <p>Log in to your account to view the final results.</p>
        `,
  }),
  auction_ending_soon: (data: { auctionTitle: string }) => ({
    subject: `Auction Ending Soon: ${data.auctionTitle}`,
    html: `
      <h2>Auction Ending Soon</h2>
      <p>The auction "${data.auctionTitle}" will end in 1 hour.</p>
      <p>Log in now to check the current status and place your final bids!</p>
    `,
  }),
  auction_completed: (data: { auctionTitle: string; isWinner?: boolean }) => ({
    subject: data.isWinner 
      ? `Congratulations! You've Won: ${data.auctionTitle}` 
      : `Auction Ended: ${data.auctionTitle}`,
    html: data.isWinner
      ? `
        <h2>Congratulations! You've Won!</h2>
        <p>You are the winning bidder for "${data.auctionTitle}"!</p>
        <p>Log in to your account to complete the payment and arrange delivery.</p>
      `
      : `
        <h2>Auction Has Ended</h2>
        <p>The auction "${data.auctionTitle}" has ended.</p>
        <p>Log in to your account to view the final results.</p>
      `,
  }),
  payment: (data: { amount: number; status: string }) => ({
    subject: 'Payment Notification',
    html: `
      <h2>Payment Update</h2>
      <p>A payment of $${data.amount} has been ${data.status}.</p>
      <p>Log in to your account to view the transaction details.</p>
    `,
  }),
  admin: (data: { message: string }) => ({
    subject: 'Administrative Notification',
    html: `
      <h2>Administrative Notice</h2>
      <p>${data.message}</p>
    `,
  }),
  fulfillment: (data: { 
    auctionTitle: string; 
    trackingInfo: string;
    shippingDate: string;
  }) => ({
    subject: `Shipping Update: ${data.auctionTitle}`,
    html: `
      <h2>Your Item Has Been Shipped!</h2>
      <p>The seller has shipped your item from auction "${data.auctionTitle}".</p>
      <p><strong>Tracking Information:</strong></p>
      <p>${data.trackingInfo}</p>
      <p>Shipped On: ${new Date(data.shippingDate).toLocaleDateString()}</p>
      <p>Log in to your account to view more details.</p>
    `,
  }),
  admin_new_seller: (data: { sellerName: string; sellerEmail: string }) => ({
    subject: 'New Seller Registration Pending Approval',
    html: `
      <h2>New Seller Registration</h2>
      <p>A new seller has registered and is waiting for approval:</p>
      <ul>
        <li><strong>Name:</strong> ${data.sellerName}</li>
        <li><strong>Email:</strong> ${data.sellerEmail}</li>
      </ul>
      <p>Please log in to the admin dashboard to review and approve/reject this registration.</p>
    `,
  }),

  admin_new_auction: (data: { 
    auctionTitle: string; 
    sellerName: string;
    startPrice: number;
    category: string;
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
      <p>Please log in to the admin dashboard to review the auction details and approve/reject the listing.</p>
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
      const template = emailTemplates[type](data as any);
      await transporter.sendMail({
        from: `"Pips 'n Chicks" <${process.env.SMTP_USER}>`,
        to: user.email,
        ...template,
      });
      return true;
    } catch (error) {
      console.error('Failed to send email notification:', error);
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

  static async sendEmail(to: string, subject: string, body: string): Promise<void> {
    try {
      console.log("[EMAIL] Would send email:");
      console.log(`  To: ${to}`);
      console.log(`  Subject: ${subject}`);
      console.log(`  Body: ${body}`);
      console.log("[EMAIL] Email sending simulated (no actual email sent)");
    } catch (error) {
      console.error("[EMAIL] Error sending email:", error);
      throw error;
    }
  }

  static async sendWinningBidEmail(
    email: string, 
    auctionTitle: string, 
    bidAmount: number
  ): Promise<void> {
    const subject = `Congratulations! You won the auction for "${auctionTitle}"`;
    const body = `
      Hello,
      
      Congratulations! You have won the auction for "${auctionTitle}" with a bid of $${(bidAmount/100).toFixed(2)}.
      
      Please proceed to payment to complete your purchase.
      
      Thank you,
      Pips 'n Chicks Auctions Team
    `;
    
    await this.sendEmail(email, subject, body);
  }

  static async sendAuctionEndedEmail(
    email: string, 
    auctionTitle: string, 
    soldPrice: number | null
  ): Promise<void> {
    let subject, body;
    
    if (soldPrice) {
      subject = `Your auction "${auctionTitle}" has ended and sold!`;
      body = `
        Hello,
        
        Your auction "${auctionTitle}" has ended and sold for $${(soldPrice/100).toFixed(2)}.
        
        Thank you,
        Pips 'n Chicks Auctions Team
      `;
    } else {
      subject = `Your auction "${auctionTitle}" has ended`;
      body = `
        Hello,
        
        Your auction "${auctionTitle}" has ended without any bids.
        
        Thank you,
        Pips 'n Chicks Auctions Team
      `;
    }
    
    await this.sendEmail(email, subject, body);
  }

  static async sendTrackingInfo(
    buyerId: number,
    auctionId: number,
    trackingInfo: string
  ): Promise<void> {
    try {
      const buyer = await storage.getUser(buyerId);
      if (!buyer?.email) {
        throw new Error("Buyer email not found");
      }

      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      const emailData = {
        auctionTitle: auction.title,
        trackingInfo: trackingInfo,
        shippingDate: new Date().toISOString()
      };

      console.log("[EMAIL] Sending tracking info to buyer:", {
        buyerId,
        auctionId,
        email: buyer.email
      });

      await this.sendNotification("fulfillment", buyer, emailData);

      console.log("[EMAIL] Successfully sent tracking info email");
    } catch (error) {
      console.error("[EMAIL] Error sending tracking info:", error);
      throw error;
    }
  }

  static async notifyAdminsOfNewSeller(seller: User): Promise<void> {
    try {
      console.log("[EMAIL] Preparing to notify admins about new seller registration:", {
        sellerId: seller.id,
        username: seller.username
      });

      // Get all admin users
      const admins = await storage.getUsers({ role: "seller_admin" });

      if (!admins || admins.length === 0) {
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
        sellerEmail: sellerProfile.email
      };

      // Send notification to each admin
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

      // Get all admin users
      const admins = await storage.getUsers({ role: "seller_admin" });

      if (!admins || admins.length === 0) {
        console.log("[EMAIL] No admin users found to notify");
        return;
      }

      const emailData = {
        auctionTitle: auction.title,
        sellerName: sellerProfile?.fullName || seller.username,
        startPrice: auction.startPrice,
        category: auction.category
      };

      // Send notification to each admin
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