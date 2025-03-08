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

export class PaymentService {
  static async createPaymentIntent(
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

      // Calculate amounts
      const baseAmount = auction.currentPrice;
      const platformFee = Math.round(baseAmount * PLATFORM_FEE_PERCENTAGE);
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = baseAmount + platformFee + insuranceFee;

      console.log("[PAYMENTS] Creating payment intent:", {
        baseAmount,
        platformFee,
        insuranceFee,
        totalAmount,
        sellerId: auction.sellerId,
        sellerStripeAccount: sellerProfile.stripeAccountId
      });

      // Create PaymentIntent with destination charge
      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: 'usd',
        application_fee_amount: platformFee + insuranceFee,
        transfer_data: {
          destination: sellerProfile.stripeAccountId,
        },
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          auctionId: auction.id.toString(),
          buyerId: buyerId.toString(),
          sellerId: auction.sellerId.toString(),
        }
      });

      // Create payment record
      const payment = await storage.insertPayment({
        auctionId,
        buyerId,
        sellerId: auction.sellerId,
        amount: totalAmount,
        platformFee,
        sellerPayout: baseAmount - platformFee,
        insuranceFee,
        stripePaymentIntentId: paymentIntent.id,
        status: 'pending'
      });

      // Update auction status
      await storage.updateAuction(auctionId, {
        paymentStatus: "pending"
      });

      return {
        clientSecret: paymentIntent.client_secret,
        payment
      };

    } catch (error) {
      console.error("[PAYMENTS] Error creating payment intent:", error);
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

      // Send single notification
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

      // Get auction for reserve price check
      const auction = await storage.getAuction(payment.auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      // Update payment status
      await storage.updatePayment(payment.id, {
        status: "failed"
      });

      // Update auction status based on reserve price
      await storage.updateAuction(payment.auctionId, {
        status: auction.currentPrice < auction.reservePrice ? 
          "pending_seller_decision" : "ended",
        paymentStatus: "failed"
      });

      // Send single notification
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

  static async createCheckoutSession(
    auctionId: number,
    buyerId: number,
    includeInsurance: boolean = false,
    baseUrl: string
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

      // Calculate amounts
      const baseAmount = auction.currentPrice;
      const platformFee = Math.round(baseAmount * PLATFORM_FEE_PERCENTAGE);
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = baseAmount + platformFee + insuranceFee;

      console.log("[PAYMENTS] Creating checkout session:", {
        baseAmount,
        platformFee,
        insuranceFee,
        totalAmount,
        sellerId: auction.sellerId,
        sellerStripeAccount: sellerProfile.stripeAccountId
      });

      // Create a Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/auctions/${auctionId}`,
        payment_intent_data: {
          transfer_data: {
            destination: sellerProfile.stripeAccountId,
          },
          application_fee_amount: platformFee + insuranceFee,
        },
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Payment for "${auction.title}"`,
                description: 'Auction payment including fees'
              },
              unit_amount: totalAmount,
            },
            quantity: 1,
          },
        ],
        metadata: {
          auctionId: auction.id.toString(),
          buyerId: buyerId.toString(),
          sellerId: auction.sellerId.toString(),
        }
      });

      // Create payment record
      const payment = await storage.insertPayment({
        auctionId,
        buyerId,
        sellerId: auction.sellerId,
        amount: totalAmount,
        platformFee,
        sellerPayout: baseAmount - platformFee,
        insuranceFee,
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent as string,
        status: 'pending'
      });

      // Update auction status
      await storage.updateAuction(auctionId, {
        paymentStatus: "pending"
      });

      return {
        sessionId: session.id,
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
}