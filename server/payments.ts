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
  ) {
    try {
      console.log(`[PAYMENTS] Creating checkout session for auction ${auctionId}, buyer ${buyerId}`);

      // Get auction details
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      console.log(`[PAYMENTS] Validating auction ${auctionId}:`, {
        status: auction.status,
        winningBidderId: auction.winningBidderId,
        currentPrice: auction.currentPrice,
        reservePrice: auction.reservePrice
      });

      // Verify if the buyer is the winning bidder
      if (auction.winningBidderId !== buyerId) {
        throw new Error("Only the winning bidder can make payment");
      }

      // Check auction status for payment eligibility
      if (auction.status !== "ended" && auction.status !== "pending_payment") {
        throw new Error("Auction is not ready for payment");
      }

      // Get seller's Stripe account ID
      const sellerProfile = await storage.getProfile(auction.sellerId);
      if (!sellerProfile?.stripeAccountId) {
        throw new Error("Seller has not completed Stripe onboarding");
      }

      // Calculate amounts
      const baseAmount = auction.currentPrice;
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = baseAmount + insuranceFee;
      const platformFee = Math.floor(baseAmount * PLATFORM_FEE_PERCENTAGE);
      const sellerPayout = baseAmount - platformFee;

      console.log(`[PAYMENTS] Payment details:`, {
        baseAmount,
        insuranceFee,
        totalAmount,
        platformFee,
        sellerPayout
      });

      // Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: sellerProfile.stripeAccountId,
          },
          metadata: {
            auctionId: auctionId.toString(),
            buyerId: buyerId.toString(),
            sellerId: auction.sellerId.toString(),
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
        success_url: `${baseUrl}/auction/${auctionId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/auction/${auctionId}?payment=cancelled`,
      });

      if (!session.url) {
        throw new Error("Failed to generate Stripe checkout URL");
      }

      // Insert payment record
      const paymentData = {
        auctionId,
        buyerId,
        sellerId: auction.sellerId,
        amount: totalAmount,
        platformFee,
        sellerPayout,
        insuranceFee,
        status: 'pending',
        stripePaymentIntentId: session.payment_intent as string,
      };

      // Insert the payment record
      const validatedPayment = insertPaymentSchema.parse(paymentData);
      const payment = await storage.insertPayment(validatedPayment);

      // Update auction status
      await storage.updateAuction(auctionId, {
        status: "pending_payment",
        paymentStatus: "pending"
      });

      return {
        sessionId: session.id,
        url: session.url,
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