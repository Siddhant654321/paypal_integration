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
const INSURANCE_FEE = 800; // $8.00 in cents

export class PaymentService {
  static async createPaymentIntent(
    auctionId: number,
    buyerId: number,
    includeInsurance: boolean = false
  ): Promise<{
    clientSecret: string;
    payment: InsertPayment;
  }> {
    try {
      log(`Creating payment intent for auction ${auctionId}`, "payments");

      // Get auction details
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      log(`Auction current price: ${auction.currentPrice}`, "payments");

      // Calculate amounts (amounts are already in cents)
      const baseAmount = auction.currentPrice;
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = baseAmount + insuranceFee;
      const platformFee = Math.floor(baseAmount * PLATFORM_FEE_PERCENTAGE);
      const sellerPayout = baseAmount - platformFee;

      log(`Payment calculation: Total=${totalAmount}, PlatformFee=${platformFee}, SellerPayout=${sellerPayout}, InsuranceFee=${insuranceFee}`, "payments");

      // Create payment record
      const paymentData: InsertPayment = {
        auctionId,
        buyerId,
        sellerId: auction.sellerId,
        amount: totalAmount,
        platformFee,
        sellerPayout,
        insuranceFee,
      };

      // Create Stripe PaymentIntent with automatic payment methods
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          auctionId: auctionId.toString(),
          buyerId: buyerId.toString(),
          sellerId: auction.sellerId.toString(),
          includeInsurance: includeInsurance.toString(),
        },
      });

      log(`Created Stripe PaymentIntent: ${paymentIntent.id}`, "payments");

      // Create payment record in database
      const payment = await storage.createPayment({
        ...paymentData,
        stripePaymentIntentId: paymentIntent.id,
      });

      // Update auction status
      await storage.updateAuctionPaymentStatus(auctionId, "processing");

      return {
        clientSecret: paymentIntent.client_secret!,
        payment: paymentData,
      };
    } catch (error) {
      log(`Error creating payment intent: ${error}`, "payments");
      throw error;
    }
  }

  static async handlePaymentSuccess(paymentIntentId: string): Promise<void> {
    try {
      const payment = await storage.getPaymentByStripeId(paymentIntentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      // Update payment record with status
      await storage.updatePayment(payment.id, {
        status: "completed",
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