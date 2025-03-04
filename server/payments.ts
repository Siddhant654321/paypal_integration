import Stripe from "stripe";
import { storage } from "./storage";
import { insertPaymentSchema, type InsertPayment } from "@shared/schema";
import { SellerPaymentService } from "./seller-payments";
import { NotificationService } from "./notification-service";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia"
});

const PLATFORM_FEE_PERCENTAGE = 0.10; // 10% platform fee
const INSURANCE_FEE = 800; // $8.00 in cents

// Force production URL for all Stripe redirects
const PRODUCTION_URL = 'https://poultryauction.co';

// Prevent any environment overrides
const getStripeRedirectUrl = (path: string, params: Record<string, string> = {}) => {
  const url = new URL(path, PRODUCTION_URL);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });
  return url.toString();
};

export class PaymentService {
  static async createCheckoutSession(
    auctionId: number,
    buyerId: number,
    includeInsurance: boolean = false
  ): Promise<{
    sessionId: string;
    payment: InsertPayment;
  }> {
    try {
      console.log("[STRIPE] Creating checkout session:", {
        auctionId,
        buyerId,
        includeInsurance,
        baseUrl: PRODUCTION_URL
      });

      // Get auction details
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      // Calculate amounts
      const baseAmount = auction.currentPrice;
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = baseAmount + insuranceFee;
      const platformFee = Math.floor(baseAmount * PLATFORM_FEE_PERCENTAGE);
      const sellerPayout = baseAmount - platformFee;

      // Generate success and cancel URLs
      const successUrl = getStripeRedirectUrl(`/auction/${auctionId}`, { payment: 'success' });
      const cancelUrl = getStripeRedirectUrl(`/auction/${auctionId}`, { payment: 'cancelled' });

      console.log("[STRIPE] Creating Checkout session with URLs:", {
        successUrl,
        cancelUrl
      });

      // Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: auction.sellerStripeAccountId,
          },
        },
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: auction.title,
                description: `Auction Payment - ${auction.species}`,
              },
              unit_amount: baseAmount,
            },
            quantity: 1,
          },
          ...(includeInsurance ? [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Shipping Insurance',
                description: 'Insurance coverage for shipping',
              },
              unit_amount: INSURANCE_FEE,
            },
            quantity: 1,
          }] : []),
        ],
        metadata: {
          auctionId: auctionId.toString(),
          buyerId: buyerId.toString(),
          sellerId: auction.sellerId.toString(),
          includeInsurance: includeInsurance.toString(),
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      console.log("[STRIPE] Checkout session created:", {
        sessionId: session.id,
        successUrl: successUrl,
        cancelUrl: cancelUrl
      });

      // Create payment record
      const paymentData = {
        auctionId,
        buyerId,
        sellerId: auction.sellerId,
        amount: totalAmount,
        platformFee,
        sellerPayout,
        insuranceFee,
        stripePaymentIntentId: '',
        status: 'pending' as const,
      };

      // Update the payment with the Stripe session ID
      const payment = await storage.insertPayment({
        ...paymentData,
        stripePaymentIntentId: session.payment_intent as string,
      });

      // Mark auction as payment processing
      await storage.updateAuction(auctionId, {
        status: "pending_payment",
      });

      return {
        sessionId: session.id,
        payment,
      };

    } catch (error) {
      console.error("[STRIPE] Checkout session creation error:", error);
      if (error instanceof Stripe.errors.StripeError) {
        console.error("[STRIPE] API Error:", {
          type: error.type,
          code: error.code,
          message: error.message
        });
      }
      throw error;
    }
  }

  static async handlePaymentSuccess(paymentIntentId: string): Promise<void> {
    try {
      const payment = await storage.findPaymentByStripeId(paymentIntentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      // Update payment status
      await storage.updatePaymentStatus(payment.id, "completed");

      // Update auction status
      await storage.updateAuction(payment.auctionId, {
        status: "pending_fulfillment",
      });

      // Notify the seller
      await NotificationService.notifyPayment(
        payment.sellerId,
        payment.amount,
        "completed"
      );

      // We'll create the payout after fulfillment now, not immediately
      // The payout will be triggered in the fulfillment route when 
      // tracking information is provided
    } catch (error) {
      console.error("Error handling payment success:", error);
      throw error;
    }
  }

  static async handlePaymentFailure(paymentIntentId: string): Promise<void> {
    try {
      const payment = await storage.findPaymentByStripeId(paymentIntentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      // Update payment status
      await storage.updatePaymentStatus(payment.id, "failed");

      // Update auction status
      await storage.updateAuction(payment.auctionId, {
        status: "active",
      });

      // Notify the seller
      await NotificationService.notifyPayment(
        payment.sellerId,
        payment.amount,
        "failed"
      );
    } catch (error) {
      console.error("Error handling payment failure:", error);
      throw error;
    }
  }
}