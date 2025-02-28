import nodemailer from 'nodemailer';
import { User } from '@shared/schema';

// Initialize nodemailer transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Email templates for different notification types
const emailTemplates = {
  bid: (data: { auctionTitle: string; bidAmount: number }) => ({
    subject: `New Bid on ${data.auctionTitle}`,
    html: `
      <h2>New Bid Received</h2>
      <p>A new bid of $${data.bidAmount} has been placed on your auction "${data.auctionTitle}".</p>
      <p>Log in to your account to view the details.</p>
    `,
  }),
  auction: (data: { auctionTitle: string; status: string }) => ({
    subject: `Auction Update: ${data.auctionTitle}`,
    html: `
      <h2>Auction Status Update</h2>
      <p>Your auction "${data.auctionTitle}" has been ${data.status}.</p>
      <p>Log in to your account to view the details.</p>
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
  fulfillment: (data: { 
    auctionTitle: string; 
    shippingCarrier: string;
    trackingNumber: string;
    shippingDate: string;
    estimatedDeliveryDate?: string;
  }) => ({
    subject: `Shipping Update: ${data.auctionTitle}`,
    html: `
      <h2>Your Item Has Been Shipped!</h2>
      <p>The seller has shipped your item from auction "${data.auctionTitle}".</p>
      <p><strong>Shipping Details:</strong></p>
      <ul>
        <li>Carrier: ${data.shippingCarrier}</li>
        <li>Tracking Number: ${data.trackingNumber}</li>
        <li>Shipped On: ${new Date(data.shippingDate).toLocaleDateString()}</li>
        ${data.estimatedDeliveryDate ? 
          `<li>Estimated Delivery: ${new Date(data.estimatedDeliveryDate).toLocaleDateString()}</li>` 
          : ''}
      </ul>
      <p>Log in to your account to view more details.</p>
    `,
  }),
};

// Types for email notification data
type EmailNotificationData = {
  bid: { auctionTitle: string; bidAmount: number };
  auction: { auctionTitle: string; status: string };
  payment: { amount: number; status: string };
  admin: { message: string };
  fulfillment: {
    auctionTitle: string;
    shippingCarrier: string;
    trackingNumber: string;
    shippingDate: string;
    estimatedDeliveryDate?: string;
  };
};

export class EmailService {
  static async sendNotification<T extends keyof EmailNotificationData>(
    type: T,
    user: User,
    data: EmailNotificationData[T]
  ) {
    try {
      // Get the email template based on notification type
      const template = type === 'admin' 
        ? {
            subject: 'Administrative Notification',
            html: `<h2>Administrative Notice</h2><p>${(data as any).message}</p>`,
          }
        : emailTemplates[type](data as any);

      // Send the email
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

  // Verify email configuration
  static async verifyConnection() {
    try {
      await transporter.verify();
      return true;
    } catch (error) {
      console.error('Email service verification failed:', error);
      return false;
    }
  }
}