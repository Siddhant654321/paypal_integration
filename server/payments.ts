import { storage } from "./storage";
import { Payment, PaymentStatus } from "@shared/schema";
import axios from 'axios';
import { log } from "./utils/logger";

// Check for required PayPal environment variables
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  throw new Error("Missing required PayPal credentials (CLIENT_ID or CLIENT_SECRET)");
}

const PRODUCTION_URL = 'https://api-m.paypal.com';
const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

// Use sandbox URL in development, production URL in production
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const BASE_URL = IS_PRODUCTION ? PRODUCTION_URL : SANDBOX_URL;

console.log("[PAYPAL] Initializing PayPal service:", {
  mode: IS_PRODUCTION ? 'production' : 'sandbox',
  baseUrl: BASE_URL,
  clientIdPrefix: process.env.PAYPAL_CLIENT_ID?.substring(0, 8) + '...'
});

export class PaymentService {
  static async getAccessToken(): Promise<string> {
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
      return response.data.access_token;
    } catch (error) {
      console.error("[PAYPAL] Error getting access token:", error);
      throw new Error("Failed to authenticate with PayPal");
    }
  }

  static async createOrder(auctionId: number, amount: number, buyerId: number): Promise<{ id: string; approvalUrl: string }> {
    try {
      console.log("[PAYPAL] Creating order for auction:", auctionId, "Amount:", amount);
      const accessToken = await this.getAccessToken();

      const orderData = {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: `auction_${auctionId}`,
          amount: {
            currency_code: "USD",
            value: (amount / 100).toFixed(2)
          },
          description: `Payment for auction #${auctionId}`
        }],
        application_context: {
          brand_name: "Animal Auctions",
          landing_page: "BILLING",
          user_action: "PAY_NOW",
          return_url: `${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.replit.dev` : 'http://localhost:5000'}/payment/success`,
          cancel_url: `${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.replit.dev` : 'http://localhost:5000'}/payment/cancel`
        }
      };

      const response = await axios.post(
        `${BASE_URL}/v2/checkout/orders`,
        orderData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const orderId = response.data.id;
      const links = response.data.links;
      const approvalUrl = links.find((link: any) => link.rel === "approve").href;

      // Store payment info in database
      await storage.insertPayment({
        auctionId,
        buyerId,
        amount,
        status: "pending",
        paypalOrderId: orderId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      return {
        id: orderId,
        approvalUrl
      };
    } catch (error) {
      console.error("[PAYPAL] Error creating order:", error);
      throw error;
    }
  }

  static async capturePayment(orderId: string): Promise<Payment> {
    try {
      console.log("[PAYPAL] Capturing payment for order:", orderId);
      const accessToken = await this.getAccessToken();

      // Get existing payment from database
      const existingPayment = await storage.findPaymentByPayPalId(orderId);
      if (!existingPayment) {
        throw new Error(`No payment record found for order ${orderId}`);
      }

      // Capture the authorized payment
      const response = await axios.post(
        `${BASE_URL}/v2/checkout/orders/${orderId}/capture`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Check if capture was successful
      if (response.data.status === "COMPLETED") {
        // Update payment status in database
        const updatedPayment = await storage.updatePaymentStatus(existingPayment.id, "completed");

        // Process auction completion logic
        // await auctionService.completeAuction(updatedPayment.auctionId);

        return updatedPayment;
      } else {
        throw new Error(`Payment capture failed with status: ${response.data.status}`);
      }
    } catch (error) {
      console.error("[PAYPAL] Error capturing payment:", error);
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

  static async handlePaymentSuccess(orderId: string): Promise<void> {
    try {
      const payment = await storage.findPaymentByPayPalId(orderId);
      if (!payment) {
        log(`No payment found for order ${orderId}`, "payments");
        return;
      }

      // Update payment status
      await storage.updatePaymentStatus(payment.id, "completed");

      // TODO: Additional payment success handling
      log(`Payment ${payment.id} for auction ${payment.auctionId} completed successfully`, "payments");
    } catch (error) {
      log(`Error handling payment success: ${error}`, "payments");
      throw error;
    }
  }

  static async handlePaymentFailure(orderId: string): Promise<void> {
    try {
      const payment = await storage.findPaymentByPayPalId(orderId);
      if (!payment) {
        log(`No payment found for order ${orderId}`, "payments");
        return;
      }

      // Update payment status
      await storage.updatePaymentStatus(payment.id, "failed");

      // TODO: Additional payment failure handling
      log(`Payment ${payment.id} for auction ${payment.auctionId} failed`, "payments");
    } catch (error) {
      log(`Error handling payment failure: ${error}`, "payments");
      throw error;
    }
  }
}