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

const PLATFORM_FEE_PERCENTAGE = 0.10; // 10% platform fee
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
    includeInsurance: boolean = false,
    baseUrl: string = process.env.REPL_SLUG ? 
      `https://${process.env.REPL_SLUG}.replit.dev` : 
      'http://localhost:5000'
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

      // Get seller's PayPal account
      const sellerProfile = await storage.getProfile(auction.sellerId);
      if (!sellerProfile?.paypalMerchantId) {
        throw new Error("Seller has not completed their PayPal account setup");
      }

      // Calculate amounts
      const baseAmount = auction.currentPrice;
      const platformFee = Math.round(baseAmount * PLATFORM_FEE_PERCENTAGE);
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = baseAmount + platformFee + insuranceFee;

      console.log("[PAYPAL] Creating checkout order:", {
        auctionId,
        baseAmount,
        platformFee,
        insuranceFee,
        totalAmount,
        merchantId: sellerProfile.paypalMerchantId
      });

      const accessToken = await this.getAccessToken();

      // Create PayPal order
      const orderRequest = {
        intent: "CAPTURE",
        purchase_units: [
          {
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
                  value: (platformFee / 100).toFixed(2)
                },
                insurance: {
                  currency_code: "USD",
                  value: (insuranceFee / 100).toFixed(2)
                }
              }
            },
            description: `Payment for auction #${auction.id}`,
            custom_id: `auction_${auction.id}`,
            payee: {
              merchant_id: sellerProfile.paypalMerchantId
            },
            items: [
              {
                name: auction.title,
                description: `Auction #${auction.id}`,
                unit_amount: {
                  currency_code: "USD",
                  value: (baseAmount / 100).toFixed(2)
                },
                quantity: "1"
              }
            ],
            payment_instruction: {
              platform_fees: [{
                amount: {
                  currency_code: "USD",
                  value: (platformFee / 100).toFixed(2)
                }
              }]
            }
          }
        ],
        application_context: {
          return_url: `${baseUrl}/payment-success`,
          cancel_url: `${baseUrl}/auction/${auction.id}?payment_canceled=true`
        }
      };

      console.log("[PAYPAL] Sending order request to PayPal");

      const response = await axios.post(
        `${BASE_URL}/v2/checkout/orders`,
        orderRequest,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const orderId = response.data.id;
      const approveUrl = response.data.links.find((link: any) => link.rel === "approve")?.href;

      if (!approveUrl) {
        throw new Error("Failed to generate checkout URL");
      }

      console.log("[PAYPAL] Successfully created order:", {
        orderId,
        approveUrl: approveUrl.substring(0, 50) + '...'
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
        url: approveUrl,
        payment,
      };
    } catch (error) {
      console.error("[PAYPAL] Error creating checkout session:", error);
      throw error;
    }
  }
  static async handlePaymentSuccess(orderId: string) {
    try {
      const payment = await storage.findPaymentByPayPalId(orderId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      const accessToken = await this.getAccessToken();

      // Capture the payment
      await axios.post(
        `${BASE_URL}/v2/checkout/orders/${orderId}/capture`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

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
      console.error("[PAYPAL] Error handling payment success:", error);
      throw error;
    }
  }

  static async handlePaymentFailure(orderId: string) {
    try {
      const payment = await storage.findPaymentByPayPalId(orderId);
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
      console.error("[PAYPAL] Error handling payment failure:", error);
      throw error;
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