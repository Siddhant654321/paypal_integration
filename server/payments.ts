import Stripe from "stripe";
import { storage } from "./storage";
import { NotificationService } from "./notification-service";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia"
});

const BASE_URL = process.env.CLIENT_ORIGIN || 'http://localhost:5000';
const PLATFORM_FEE_PERCENTAGE = 0.10; // 10% platform fee
const INSURANCE_FEE = 800; // $8.00 in cents

export class PaymentService {
  static async createCheckoutSession(
    auctionId: number,
    buyerId: number,
    includeInsurance: boolean = false
  ) {
    try {
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

      // Calculate fees
      const baseAmount = auction.currentPrice;
      const platformFee = Math.round(baseAmount * PLATFORM_FEE_PERCENTAGE);
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = baseAmount + platformFee + insuranceFee;

      // Create simple checkout session
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        metadata: {
          auctionId: auction.id.toString(),
          buyerId: buyerId.toString(),
          sellerId: auction.sellerId.toString(),
          platformFee: platformFee.toString(),
          insuranceFee: insuranceFee.toString(),
        },
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: totalAmount,
              product_data: {
                name: `Payment for "${auction.title}"`,
                description: `Auction ID: ${auction.id}`,
                images: auction.images && auction.images.length > 0 ? [auction.images[0]] : undefined,
              },
            },
            quantity: 1,
          }
        ],
        success_url: `${BASE_URL}/payment-success`,
        cancel_url: `${BASE_URL}/auction/${auctionId}?payment_canceled=true`,
        payment_intent_data: {
          application_fee_amount: platformFee + insuranceFee,
          transfer_data: {
            destination: sellerProfile.stripeAccountId,
          },
        },
      });

      // Update auction status only
      await storage.updateAuction(auctionId, {
        paymentStatus: "pending"
      });

      return { url: session.url };

    } catch (error) {
      console.error("[PAYMENTS] Error creating checkout session:", error);
      throw error;
    }
  }

  static async handleWebhookEvent(event: Stripe.Event) {
    try {
      console.log("[PAYMENTS] Processing webhook event:", event.type);

      switch (event.type) {
        case 'payment_intent.succeeded':
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          await PaymentService.handlePaymentSuccess(paymentIntent);
          break;

        case 'payment_intent.payment_failed':
          const failedPaymentIntent = event.data.object as Stripe.PaymentIntent;
          await PaymentService.handlePaymentFailure(failedPaymentIntent);
          break;
      }
    } catch (error) {
      console.error("[PAYMENTS] Error handling webhook event:", error);
      throw error;
    }
  }

  private static async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
    try {
      // Extract metadata
      const { auctionId, buyerId, sellerId, platformFee, insuranceFee } = paymentIntent.metadata;
      if (!auctionId || !buyerId || !sellerId) {
        throw new Error("Missing required metadata in payment intent");
      }

      // Create payment record
      await storage.insertPayment({
        auctionId: parseInt(auctionId),
        buyerId: parseInt(buyerId),
        sellerId: parseInt(sellerId),
        amount: paymentIntent.amount,
        platformFee: parseInt(platformFee || '0'),
        insuranceFee: parseInt(insuranceFee || '0'),
        sellerPayout: paymentIntent.transfer_data?.amount || 0,
        stripePaymentIntentId: paymentIntent.id,
        status: "completed",
        payoutProcessed: false
      });

      // Update auction status
      await storage.updateAuction(parseInt(auctionId), {
        status: "pending_fulfillment",
        paymentStatus: "completed"
      });

      // Send notification
      await NotificationService.notifyPayment(
        parseInt(sellerId),
        paymentIntent.amount,
        "completed"
      );

    } catch (error) {
      console.error("[PAYMENTS] Error handling payment success:", error);
      throw error;
    }
  }

  private static async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
    try {
      const { auctionId, sellerId } = paymentIntent.metadata;
      if (!auctionId || !sellerId) {
        throw new Error("Missing required metadata in payment intent");
      }

      // Update auction status only
      await storage.updateAuction(parseInt(auctionId), {
        paymentStatus: "failed"
      });

      // Send notification
      await NotificationService.notifyPayment(
        parseInt(sellerId),
        paymentIntent.amount,
        "failed"
      );

    } catch (error) {
      console.error("[PAYMENTS] Error handling payment failure:", error);
      throw error;
    }
  }
}