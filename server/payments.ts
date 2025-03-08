import Stripe from "stripe";
import { storage } from "./storage";
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

export class PaymentService {
  static async createCheckoutSession(
    auctionId: number,
    buyerId: number,
    includeInsurance: boolean = false,
    baseUrl: string = BASE_URL
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

      console.log(`[PAYMENTS] Creating checkout session:`, {
        auctionId,
        baseAmount,
        platformFee,
        insuranceFee,
        totalAmount,
        sellerAccountId: sellerProfile.stripeAccountId
      });

      // Create the checkout session with the destination charge configuration
      // Following Stripe Connect documentation for destination charges
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${baseUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/auction/${auction.id}?payment_canceled=true`,
        payment_intent_data: {
          // Set up the transfer to the connected account
          transfer_data: {
            destination: sellerProfile.stripeAccountId,
          },
          // Application fee stays with the platform
          application_fee_amount: platformFee + insuranceFee,
        },
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: auction.title,
                description: `Auction #${auction.id}`,
                images: auction.imageUrl ? [auction.imageUrl] : undefined,
              },
              unit_amount: baseAmount,
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Platform Fee",
                description: "10% platform fee",
              },
              unit_amount: platformFee,
            },
            quantity: 1,
          },
          ...(includeInsurance ? [{
            price_data: {
              currency: "usd",
              product_data: {
                name: "Insurance Fee",
                description: "Shipping insurance coverage",
              },
              unit_amount: insuranceFee,
            },
            quantity: 1,
          }] : []),
        ],
      });

      if (!session.url) {
        throw new Error("Failed to generate checkout URL");
      }

      console.log(`[PAYMENTS] Created checkout session successfully:`, {
        sessionId: session.id,
        url: session.url,
        paymentIntentId: session.payment_intent
      });

      try {
        // Create payment record
        const payment = await storage.insertPayment({
          auctionId,
          buyerId,
          sellerId: auction.sellerId,
          amount: totalAmount,
          platformFee,
          sellerPayout: baseAmount - platformFee,
          insuranceFee,
          status: 'pending',
          stripeSessionId: session.id,
          stripePaymentIntentId: session.payment_intent as string,
        });

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
        console.error("[PAYMENTS] Error creating payment record:", error);
        
        // Still return the session URL even if the record creation fails
        // This allows the user to proceed with payment
        return {
          sessionId: session.id,
          url: session.url,
          error: "Payment record creation failed, but checkout URL was generated."
        };
      }

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

      // Update payment status
      await storage.updatePaymentStatus(payment.id, "completed");

      // Update auction status
      await storage.updateAuction(payment.auctionId, {
        status: "pending_fulfillment",
        paymentStatus: "completed"
      });

      // Notify seller
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
      await storage.updatePaymentStatus(payment.id, "failed");

      // Update auction status
      await storage.updateAuction(payment.auctionId, {
        status: auction.currentPrice < auction.reservePrice ? 
          "pending_seller_decision" : "ended",
        paymentStatus: "failed"
      });

      // Notify seller
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