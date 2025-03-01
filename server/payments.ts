import Stripe from "stripe";
import { storage } from "./storage";
import { insertPaymentSchema, type InsertPayment } from "@shared/schema";
import { SellerPaymentService } from "./seller-payments";
import { NotificationService } from "./notification-service";

// Verify Stripe secret key is available and in test mode
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  throw new Error("Stripe secret key must be a test mode key (starts with sk_test_)");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
});

const PLATFORM_FEE_PERCENTAGE = 0.10; // 10% platform fee
const INSURANCE_FEE = 800; // $8.00 in cents

export class PaymentService {
  static async createCheckoutSession(
    auctionId: number,
    buyerId: number,
    includeInsurance: boolean = false,
    baseUrl: string
  ): Promise<{
    sessionId: string;
    payment: InsertPayment;
  }> {
    try {
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

      // Get seller's Stripe account ID
      const sellerProfile = await storage.getProfile(auction.sellerId);
      if (!sellerProfile?.stripeAccountId) {
        throw new Error("Seller has not completed Stripe onboarding");
      }

      // Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: sellerProfile.stripeAccountId,
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
        success_url: `${baseUrl}/auction/${auctionId}?payment=success`,
        cancel_url: `${baseUrl}/auction/${auctionId}?payment=cancelled`,
      });

      // Create payment record in database
      const payment = await storage.createPayment({
        ...paymentData,
        stripePaymentIntentId: session.payment_intent as string,
        status: 'pending',
      });

      // Update auction status
      await storage.updateAuction(auctionId, {
        paymentStatus: "processing",
      });

      return {
        sessionId: session.id,
        payment: paymentData,
      };
    } catch (error) {
      console.error("Stripe session creation error:", error);
      if (error instanceof Stripe.errors.StripeError) {
        console.error("Stripe API Error:", {
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
      const payment = await storage.getPaymentByStripeId(paymentIntentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      // Update payment status
      await storage.updatePayment(payment.id, {
        status: "completed",
      });

      // Update auction payment status
      await storage.updateAuction(payment.auctionId, {
        paymentStatus: "completed",
      });

      // Notify the seller
      await NotificationService.notifyPayment(
        payment.sellerId,
        payment.amount,
        "completed"
      );

      // Create payout for seller
      await SellerPaymentService.createPayout(
        payment.id,
        payment.sellerId,
        payment.sellerPayout
      );
    } catch (error) {
      console.error("Error handling payment success:", error);
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
      await storage.updatePayment(payment.id, {
        status: "failed",
      });

      // Update auction payment status
      await storage.updateAuction(payment.auctionId, {
        paymentStatus: "failed",
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

// Placeholder for SellerPaymentService -  Replace with actual implementation
class SellerPaymentService {
  static async createPayout(paymentId: number, sellerId: number, amount: number): Promise<void> {
    console.log(`Creating payout for seller ${sellerId} for payment ${paymentId}, amount: ${amount}`);
    // Add your actual payout logic here.  This might involve another API call or database interaction.
  }
}