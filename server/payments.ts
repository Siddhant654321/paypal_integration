import { storage } from "./storage";
import { NotificationService } from "./notification-service";
import axios from 'axios';

// Check for required PayPal environment variables
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  throw new Error("Missing PayPal environment variables");
}

// PayPal API Configuration
const PRODUCTION_URL = 'https://api-m.paypal.com';
const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

// Use sandbox in development or when explicitly configured
const IS_SANDBOX = process.env.NODE_ENV !== 'production' || process.env.VITE_PAYPAL_ENV === 'sandbox';
const BASE_URL = IS_SANDBOX ? SANDBOX_URL : PRODUCTION_URL;

console.log("[PAYPAL] Initializing PayPal service:", {
  mode: IS_SANDBOX ? 'sandbox' : 'production',
  baseUrl: BASE_URL,
  clientIdPrefix: process.env.PAYPAL_CLIENT_ID.substring(0, 8) + '...',
});

const PLATFORM_FEE_PERCENTAGE = 0.05; // 5% platform fee
const INSURANCE_FEE = 800; // $8.00 in cents

export class PaymentService {
  private static async getAccessToken(): Promise<string> {
    try {
      const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
      const response = await axios.post(`${BASE_URL}/v1/oauth2/token`, 
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log("[PAYPAL] Successfully obtained access token");
      return response.data.access_token;
    } catch (error) {
      console.error("[PAYPAL] Error getting access token:", error);
      throw new Error("Failed to authenticate with PayPal");
    }
  }

  static async createCheckoutSession(
    auctionId: number,
    buyerId: number,
    includeInsurance: boolean = false
  ) {
    try {
      console.log("[PAYPAL] Creating checkout session:", {
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

      // Calculate amounts
      const baseAmount = auction.currentPrice;
      const platformFee = Math.round(baseAmount * PLATFORM_FEE_PERCENTAGE);
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = baseAmount + platformFee + insuranceFee;

      const accessToken = await this.getAccessToken();

      // Create PayPal order - convert from cents to dollars by dividing by 100
      const orderRequest = {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: `auction_${auctionId}`,
            description: `Payment for auction #${auctionId}`,
            custom_id: `auction_${auctionId}`,
            amount: {
              currency_code: "USD",
              value: (totalAmount / 100).toFixed(2),
              breakdown: {
                item_total: {
                  currency_code: "USD",
                  value: (baseAmount / 100).toFixed(2)
                },
                handling: {
                  currency_code: "USD",
                  value: ((platformFee + insuranceFee) / 100).toFixed(2)
                }
              }
            },
            items: [
              {
                name: auction.title,
                description: `Auction #${auction.id}`,
                quantity: "1",
                unit_amount: {
                  currency_code: "USD",
                  value: (baseAmount / 100).toFixed(2)
                }
              }
            ]
          }
        ]
      };

      console.log("[PAYPAL] Creating order with request:", orderRequest);

      const response = await axios.post(
        `${BASE_URL}/v2/checkout/orders`,
        orderRequest,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `order_${auctionId}_${Date.now()}`
          }
        }
      );

      const orderId = response.data.id;
      console.log("[PAYPAL] Order created successfully:", {
        orderId,
        status: response.data.status
      });

      // Create payment record
      const payment = await storage.insertPayment({
        auctionId,
        buyerId,
        sellerId: auction.sellerId, // Add the seller ID
        amount: totalAmount,
        platformFee,
        insuranceFee,
        status: 'pending',
        paypalOrderId: orderId
      });

      // Update auction status
      await storage.updateAuction(auctionId, {
        status: "pending_payment",
        paymentStatus: "pending"
      });

      return {
        orderId,
        payment
      };
    } catch (error) {
      console.error("[PAYPAL] Error creating order:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("PayPal API error:", {
          status: error.response.status,
          data: error.response.data
        });
      }
      throw new Error(error instanceof Error ? error.message : "Failed to create payment");
    }
  }

  static async handlePaymentSuccess(orderId: string) {
    try {
      console.log("[PAYPAL] Processing payment capture for order:", orderId);

      const payment = await storage.findPaymentByPayPalId(orderId);
      if (!payment) {
        throw new Error("Payment record not found");
      }

      const accessToken = await this.getAccessToken();

      // Verify order status
      const orderResponse = await axios.get(
        `${BASE_URL}/v2/checkout/orders/${orderId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log("[PAYPAL] Order status before capture:", {
        orderId,
        status: orderResponse.data.status
      });

      // Capture the payment
      const captureResponse = await axios.post(
        `${BASE_URL}/v2/checkout/orders/${orderId}/capture`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `capture_${orderId}_${Date.now()}`
          }
        }
      );

      console.log("[PAYPAL] Payment captured successfully:", {
        orderId,
        status: captureResponse.data.status,
        captureId: captureResponse.data.purchase_units[0]?.payments?.captures[0]?.id
      });

      // Update payment status
      await storage.updatePaymentStatus(payment.id, "completed");

      // Update auction status
      await storage.updateAuction(payment.auctionId, {
        status: "fulfilled",
        paymentStatus: "completed"
      });

      // Notify seller
      await NotificationService.notifyPayment(
        payment.sellerId,
        payment.amount,
        "completed"
      );

      return { success: true };
    } catch (error) {
      console.error("[PAYPAL] Error capturing payment:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("PayPal API error:", {
          status: error.response.status,
          data: error.response.data
        });
      }
      throw new Error("Failed to capture payment");
    }
  }
  static async handlePaymentFailure(orderId: string) {
    try {
      console.log("[PAYPAL] Processing failed payment for order:", orderId);

      const payment = await storage.findPaymentByPayPalId(orderId);
      if (!payment) {
        throw new Error("Payment record not found");
      }

      // Get auction for reserve price check
      const auction = await storage.getAuction(payment.auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      // Update payment status
      await storage.updatePaymentStatus(payment.id, "failed");

      // Update auction status based on reserve price
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

      console.log("[PAYPAL] Payment failure processed:", {
        orderId,
        paymentId: payment.id,
        auctionId: payment.auctionId
      });
    } catch (error) {
      console.error("[PAYPAL] Error handling payment failure:", error);
      throw new Error("Failed to process payment failure");
    }
  }
  static async getOrderStatus(orderId: string) {
    try {
      console.log("[PAYPAL] Getting order status for:", orderId);
      const accessToken = await this.getAccessToken();
      
      const response = await axios.get(
        `${BASE_URL}/v2/checkout/orders/${orderId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log("[PAYPAL] Order status response:", response.data.status);
      return {
        id: response.data.id,
        status: response.data.status,
        payer: response.data.payer,
        amount: response.data.purchase_units[0]?.amount
      };
    } catch (error) {
      console.error("[PAYPAL] Error getting order status:", error);
      throw new Error("Failed to get order status from PayPal");
    }
  }
}