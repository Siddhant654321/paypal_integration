import Stripe from "stripe";
import { storage } from "./storage";
import { insertPaymentSchema } from "@shared/schema";
import { NotificationService } from "./notification-service";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const PLATFORM_FEE_PERCENTAGE = 0.10; // 10% platform fee
const INSURANCE_FEE = 800; // $8.00 in cents

// Use Replit's domain or localhost for development
const BASE_URL = process.env.REPL_SLUG 
  ? `https://${process.env.REPL_SLUG}.replit.dev`
  : 'http://localhost:5000';

console.log(`[PAYMENTS] Using base URL for payments: ${BASE_URL}`);

export class PaymentService {
  static async createCheckoutSession(
    auctionId: number,
    buyerId: number,
    includeInsurance: boolean = false,
    baseUrl: string = BASE_URL
  ): Promise<{ sessionId: string; url: string; payment: any }> {
    try {
      console.log(`[PAYMENTS] Creating checkout session for auction ${auctionId}, buyer ${buyerId}`);

      // Get auction details
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      // Calculate fees
      const amount = auction.currentPrice;
      const platformFee = Math.round(amount * PLATFORM_FEE_PERCENTAGE);
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = amount + platformFee + insuranceFee;
      const sellerPayout = amount;

      // Get seller's Stripe account ID
      const sellerProfile = await storage.getProfile(auction.sellerId);
      if (!sellerProfile?.stripeAccountId) {
        throw new Error("Seller has not completed their Stripe account setup");
      }

      // Prepare line items for checkout
      const lineItems = [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: auction.title,
              description: `Auction #${auction.id}`,
              images: auction.imageUrl ? [auction.imageUrl] : undefined,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Platform Fee",
              description: "10% fee for using the platform",
            },
            unit_amount: platformFee,
          },
          quantity: 1,
        }
      ];

      // Add insurance if selected
      if (includeInsurance) {
        lineItems.push({
          price_data: {
            currency: "usd",
            product_data: {
              name: "Insurance Fee",
              description: "Insurance for your purchase",
            },
            unit_amount: insuranceFee,
          },
          quantity: 1,
        });
      }

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: lineItems,
        success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/auctions/${auction.id}?payment_canceled=true`,
        payment_intent_data: {
          application_fee_amount: platformFee + insuranceFee,
          transfer_data: {
            destination: sellerProfile.stripeAccountId,
          },
        },
      });

      console.log(`[PAYMENTS] Created Stripe session: ${session.id} for auction ${auctionId}`);

      // Create a payment record
      const paymentData = {
        auctionId,
        buyerId,
        sellerId: auction.sellerId,
        amount: totalAmount,
        platformFee,
        sellerPayout,
        insuranceFee: insuranceFee || 0,
        status: 'pending',
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent as string,
      };

      console.log("[PAYMENTS] Creating payment record:", paymentData);

      const payment = await storage.insertPayment(paymentData);

      // Update auction status
      await storage.updateAuction(auctionId, {
        status: "pending_payment",
        paymentStatus: "pending"
      });

      return {
        sessionId: session.id,
        url: session.url || "",
        payment,
      };
    } catch (error) {
      console.error("[PAYMENTS] Error creating checkout session:", error);
      throw error;
    }
  }

  static async handlePaymentSuccess(paymentIntentId: string) {
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
        paymentStatus: "completed"
      });

      // Notify the seller
      await NotificationService.notifyPayment(
        payment.sellerId,
        payment.amount,
        "completed"
      );

    } catch (error) {
      console.error("[PAYMENTS] Error handling payment success:", error);
      throw error;
    }
  }

  static async handlePaymentFailure(paymentIntentId: string) {
    try {
      const payment = await storage.findPaymentByStripeId(paymentIntentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      // Update payment status
      await storage.updatePaymentStatus(payment.id, "failed");

      // Get auction to check reserve price
      const auction = await storage.getAuction(payment.auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      // Update auction status based on reserve price
      await storage.updateAuction(payment.auctionId, {
        status: auction.currentPrice < auction.reservePrice ? 
          "pending_seller_decision" : "ended",
        paymentStatus: "failed"
      });

      // Notify the seller
      await NotificationService.notifyPayment(
        payment.sellerId,
        payment.amount,
        "failed"
      );
    } catch (error) {
      console.error("[PAYMENTS] Error handling payment failure:", error);
      throw error;
    }
  }
}