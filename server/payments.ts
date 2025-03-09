import Stripe from "stripe";
import { storage } from "./storage";
import { NotificationService } from "./notification-service";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
});

const PLATFORM_FEE_PERCENTAGE = 0.10; // 10% platform fee
const INSURANCE_FEE = 800; // $8.00 in cents

// Get base URL from environment or use default
const BASE_URL = process.env.CLIENT_ORIGIN || process.env.PUBLIC_URL || 'http://localhost:5000';

export class PaymentService {
  static async createCheckoutSession(
    auctionId: number,
    buyerId: number,
    includeInsurance: boolean = false
  ) {
    try {
      console.log("[PAYMENTS] Starting checkout session creation:", {
        auctionId,
        buyerId,
        includeInsurance
      });

      // Get auction details
      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      // Verify buyer is winning bidder
      if (auction.winningBidderId !== buyerId) {
        throw new Error("Only the winning bidder can make payment");
      }

      // Get seller's Stripe account
      const sellerProfile = await storage.getProfile(auction.sellerId);
      if (!sellerProfile?.stripeAccountId) {
        throw new Error("Seller has not completed their Stripe account setup");
      }

      // Calculate amounts
      const baseAmount = auction.currentPrice;
      const platformFee = Math.round(baseAmount * PLATFORM_FEE_PERCENTAGE);
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = baseAmount + platformFee + insuranceFee;
      const sellerPayout = baseAmount - platformFee;

      console.log("[PAYMENTS] Calculated payment amounts:", {
        baseAmount,
        platformFee,
        insuranceFee,
        totalAmount,
        sellerPayout
      });

      // Construct absolute URLs for success and cancel
      const successUrl = new URL(`/payment-success`, BASE_URL);
      successUrl.searchParams.append('session_id', '{CHECKOUT_SESSION_ID}');
      successUrl.searchParams.append('auction_id', auctionId.toString());

      const cancelUrl = new URL(`/auction/${auctionId}`, BASE_URL);
      cancelUrl.searchParams.append('payment_canceled', 'true');

      console.log("[PAYMENTS] Using URLs:", {
        success: successUrl.toString(),
        cancel: cancelUrl.toString()
      });

      // Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Payment for "${auction.title}"`,
                description: `Auction ID: ${auction.id}`,
                images: auction.images && auction.images.length > 0 ? [auction.images[0]] : undefined,
              },
              unit_amount: totalAmount,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: platformFee + insuranceFee,
          transfer_data: {
            destination: sellerProfile.stripeAccountId,
          },
          metadata: {
            auctionId: auction.id.toString(),
            buyerId: buyerId.toString(),
            sellerId: auction.sellerId.toString(),
          },
        },
        mode: 'payment',
        success_url: successUrl.toString(),
        cancel_url: cancelUrl.toString(),
        allow_promotion_codes: true,
      });

      console.log("[PAYMENTS] Created checkout session:", {
        sessionId: session.id,
        url: session.url
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
        stripePaymentIntentId: session.payment_intent as string,
        status: "pending" as const,
        payoutProcessed: false
      };

      const payment = await storage.insertPayment(paymentData);

      // Update auction status
      await storage.updateAuction(auctionId, {
        paymentStatus: "pending"
      });

      return {
        url: session.url,
        payment
      };

    } catch (error) {
      console.error("[PAYMENTS] Error creating checkout session:", error);
      if (error instanceof Stripe.errors.StripeError) {
        throw new Error(`Stripe error: ${error.message}`);
      }
      throw error;
    }
  }

  static async handlePaymentSuccess(paymentIntentId: string) {
    try {
      const payment = await storage.findPaymentByStripeId(paymentIntentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      console.log("[PAYMENTS] Handling successful payment:", {
        paymentId: payment.id,
        paymentIntentId
      });

      // Retrieve PaymentIntent to get charge ID
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const chargeId = paymentIntent.latest_charge as string;

      // Update payment status and charge ID
      await storage.updatePayment(payment.id, {
        status: "completed",
        stripeChargeId: chargeId
      });

      // Update auction status
      await storage.updateAuction(payment.auctionId, {
        status: "pending_fulfillment",
        paymentStatus: "completed"
      });

      // Send notification
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

      console.log("[PAYMENTS] Handling failed payment:", {
        paymentId: payment.id
      });

      // Update payment status
      await storage.updatePayment(payment.id, {
        status: "failed"
      });

      // Get auction details for reserve price check
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

      // Send notification
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