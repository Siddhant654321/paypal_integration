import Stripe from "stripe";
import { storage } from "./storage";
import { insertPaymentSchema, type InsertPayment } from "@shared/schema";
import { log } from "./vite";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
});

const PLATFORM_FEE_PERCENTAGE = 0.10; // 10% platform fee

export class PaymentService {
  static async createPaymentIntent(auctionId: number, buyerId: number): Promise<{
    clientSecret: string;
    payment: InsertPayment;
  }> {
    try {
      // Get auction details
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      // Calculate amounts
      const totalAmount = auction.currentPrice;
      const platformFee = Math.floor(totalAmount * PLATFORM_FEE_PERCENTAGE);
      const sellerPayout = totalAmount - platformFee;

      // Create payment record
      const paymentData: InsertPayment = {
        auctionId,
        buyerId,
        sellerId: auction.sellerId,
        amount: totalAmount,
        platformFee,
        sellerPayout,
      };

      // Create Stripe PaymentIntent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: "usd",
        metadata: {
          auctionId: auctionId.toString(),
          buyerId: buyerId.toString(),
          sellerId: auction.sellerId.toString(),
        },
      });

      // Create payment record in database
      const payment = await storage.createPayment({
        ...paymentData,
        stripePaymentIntentId: paymentIntent.id,
      });

      // Update auction status
      await storage.updateAuctionPaymentStatus(auctionId, "processing", buyerId);

      return {
        clientSecret: paymentIntent.client_secret!,
        payment,
      };
    } catch (error) {
      log(`Error creating payment intent: ${error}`, "payments");
      throw error;
    }
  }

  static async handlePaymentSuccess(paymentIntentId: string): Promise<void> {
    try {
      // Get payment details from database
      const payment = await storage.getPaymentByStripeId(paymentIntentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      // Create transfer to seller
      const transfer = await stripe.transfers.create({
        amount: payment.sellerPayout,
        currency: "usd",
        destination: payment.sellerId.toString(), // Assuming seller has Stripe account connected
        transfer_group: `auction_${payment.auctionId}`,
      });

      // Update payment record with transfer details and status
      await storage.updatePayment(payment.id, {
        status: "completed",
        stripeTransferId: transfer.id,
      });

      // Update auction payment status
      await storage.updateAuctionPaymentStatus(payment.auctionId, "completed");
    } catch (error) {
      log(`Error handling payment success: ${error}`, "payments");
      throw error;
    }
  }

  static async handlePaymentFailure(paymentIntentId: string): Promise<void> {
    try {
      const payment = await storage.getPaymentByStripeId(paymentIntentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      // Update payment status
      await storage.updatePayment(payment.id, { status: "failed" });

      // Update auction payment status
      await storage.updateAuctionPaymentStatus(payment.auctionId, "failed");
    } catch (error) {
      log(`Error handling payment failure: ${error}`, "payments");
      throw error;
    }
  }
}