import nodemailer from 'nodemailer';
import { User } from '@shared/schema';

const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://poultryauction.co'
  : 'http://localhost:5000';

// Create reusable transporter object
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Email templates for different notification types
const emailTemplates = {
  bid: (data: { auctionTitle: string; bidAmount: number; isOutbid?: boolean; auctionId: number }) => ({
    subject: data.isOutbid
      ? `Time to Return: You've been outbid on ${data.auctionTitle}`
      : `Exciting News: New Bid on ${data.auctionTitle}`,
    html: data.isOutbid
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Don't Miss Out - A New Higher Bid Has Been Placed!</h2>
          <p>Someone has placed a competitive bid of $${data.bidAmount.toFixed(2)} on "${data.auctionTitle}".</p>
          <p>This is your chance to stay in the game! The auction is still active, and you could still win these exceptional birds.</p>
          <div style="margin: 20px 0;">
            <a href="${BASE_URL}/auction/${data.auctionId}"
               style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px;">
              Return to Auction
            </a>
          </div>
          <p>Remember: Quality poultry investments are worth protecting. Don't let this opportunity slip away!</p>
          <p>Good luck!</p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Great News! Your Auction is Gaining Interest</h2>
          <p>A new bid of $${data.bidAmount.toFixed(2)} has been placed on your auction "${data.auctionTitle}".</p>
          <div style="margin: 20px 0;">
            <a href="${BASE_URL}/auction/${data.auctionId}"
               style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px;">
              View Auction Details
            </a>
          </div>
          <p>Keep an eye on your auction as it progresses. We'll notify you of any further developments.</p>
        </div>
      `,
  }),

  auction_ending_soon: (data: { auctionTitle: string; auctionId: number; currentPrice: number }) => ({
    subject: `Last Call: ${data.auctionTitle} Ending Soon`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Don't Miss Out - Auction Ending Soon!</h2>
        <p>The auction for "${data.auctionTitle}" will end in just 1 hour.</p>
        <p>Current bid: $${data.currentPrice.toFixed(2)}</p>
        <div style="margin: 20px 0;">
          <a href="${BASE_URL}/auction/${data.auctionId}"
             style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px;">
            Place Your Final Bid
          </a>
        </div>
        <p>This is your last chance to secure these quality birds. Don't let this opportunity pass you by!</p>
        <p>Remember: Quality investments in poultry are worth pursuing.</p>
      </div>
    `,
  }),

  auction_completed: (data: {
    auctionTitle: string;
    auctionId: number;
    finalPrice: number;
    isWinner?: boolean;
    isSeller?: boolean;
  }) => ({
    subject: data.isWinner
      ? `Congratulations! You've Won: ${data.auctionTitle}`
      : data.isSeller
        ? `Auction Complete: ${data.auctionTitle} Has Sold`
        : `Auction Update: ${data.auctionTitle} Has Ended`,
    html: data.isWinner
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>🎊 Congratulations on Your Winning Bid! 🎊</h2>
          <p>You are the winning bidder for "${data.auctionTitle}" with a final bid of $${data.finalPrice.toFixed(2)}!</p>
          <div style="margin: 20px 0;">
            <a href="${BASE_URL}/auction/${data.auctionId}/payment"
               style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px;">
              Complete Your Purchase
            </a>
          </div>
          <p>Next Steps:</p>
          <ol>
            <li>Complete your payment to secure your purchase</li>
            <li>Await shipping information from the seller</li>
            <li>Prepare for the arrival of your new birds</li>
          </ol>
          <p>Thank you for being part of our community!</p>
        </div>
      `
      : data.isSeller
        ? `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Your Auction Has Successfully Concluded!</h2>
            <p>Your auction "${data.auctionTitle}" has ended with a final price of $${data.finalPrice.toFixed(2)}.</p>
            <div style="margin: 20px 0;">
              <a href="${BASE_URL}/auction/${data.auctionId}"
                 style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px;">
                View Auction Details
              </a>
            </div>
            <p>Next Steps:</p>
            <ol>
              <li>Await payment confirmation from the buyer</li>
              <li>Prepare the birds for shipping</li>
              <li>Update the tracking information once shipped</li>
            </ol>
            <p>Thank you for choosing our platform!</p>
          </div>
        `
        : `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Auction Update</h2>
            <p>The auction "${data.auctionTitle}" has ended with a final price of $${data.finalPrice.toFixed(2)}.</p>
            <p>While you didn't win this time, we have many more quality auctions available!</p>
            <div style="margin: 20px 0;">
              <a href="${BASE_URL}/auctions"
                 style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px;">
                Browse More Auctions
              </a>
            </div>
            <p>Keep watching for new listings that match your interests.</p>
          </div>
        `,
  }),

  daily_update: (data: {
    newAuctions: Array<{
      id: number;
      title: string;
      description: string;
      imageUrl: string;
      startingPrice: number;
      endDate: Date;
    }>;
  }) => ({
    subject: `New Poultry Auctions Available Today`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Today's New Auctions</h2>
        <p>Here are the latest additions to our auction platform:</p>
        ${data.newAuctions.map(auction => `
          <div style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 4px;">
            <img src="${auction.imageUrl}" alt="${auction.title}" style="max-width: 100%; height: auto; margin-bottom: 10px;">
            <h3>${auction.title}</h3>
            <p>${auction.description}</p>
            <p>Starting at: $${auction.startingPrice.toFixed(2)}</p>
            <p>Ends: ${auction.endDate.toLocaleDateString()}</p>
            <a href="${BASE_URL}/auction/${auction.id}"
               style="background-color: #4CAF50; color: white; padding: 8px 15px; text-decoration: none; border-radius: 4px; display: inline-block;">
              View Auction
            </a>
          </div>
        `).join('')}
        <div style="margin-top: 20px;">
          <a href="${BASE_URL}/auctions"
             style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px;">
            View All Auctions
          </a>
        </div>
        <p style="margin-top: 20px; font-size: 12px; color: #666;">
          You're receiving this email because you opted in to daily auction updates.
          <a href="${BASE_URL}/profile">Manage your email preferences</a>
        </p>
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
      // Get the email template based on notification type
      const template = emailTemplates[type](data as any);

      // Send the email using nodemailer
      await transporter.sendMail({
        from: {
          name: 'Pips \'n Chicks Auctions',
          address: process.env.SMTP_USER || 'notifications@poultryauction.co'
        },
        to: user.email,
        ...template,
      });

      console.log(`[EMAIL] Successfully sent ${type} notification to ${user.email}`);
      return true;
    } catch (error) {
      console.error('[EMAIL] Failed to send notification:', error);
      return false;
    }
  }

  static async sendDailyUpdate(users: User[], newAuctions: any[]) {
    try {
      const template = emailTemplates.daily_update({ newAuctions });

      // Send to all users who opted in for daily updates
      const emailPromises = users.map(user =>
        transporter.sendMail({
          from: {
            name: 'Pips \'n Chicks Auctions',
            address: process.env.SMTP_USER || 'notifications@poultryauction.co'
          },
          to: user.email,
          ...template,
        })
      );

      await Promise.all(emailPromises);
      console.log(`[EMAIL] Successfully sent daily updates to ${users.length} users`);
      return true;
    } catch (error) {
      console.error('[EMAIL] Failed to send daily updates:', error);
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
}