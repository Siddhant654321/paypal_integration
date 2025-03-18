import { storage } from "./storage";
import { NotificationService } from "./notification-service";
import axios from 'axios';
import { EmailService } from './email-service';

// Check for required PayPal environment variables
const isPayPalConfigured = process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET;
console.log("[PAYPAL] Configuration status:", {
  isConfigured: isPayPalConfigured,
  environment: process.env.NODE_ENV,
  clientIdPrefix: process.env.PAYPAL_CLIENT_ID ? process.env.PAYPAL_CLIENT_ID.substring(0, 8) + '...' : 'missing',
  sandbox: process.env.PAYPAL_ENV === 'sandbox'
});

// Flag to indicate if PayPal functionality should be available
const PAYPAL_ENABLED = isPayPalConfigured || process.env.NODE_ENV !== 'production';

// PayPal API Configuration
const PRODUCTION_URL = 'https://api-m.paypal.com';
const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

// Only use sandbox when explicitly configured, or in non-production
const IS_SANDBOX = process.env.NODE_ENV !== 'production' || 
                  (process.env.PAYPAL_ENV === 'sandbox' || process.env.VITE_PAYPAL_ENV === 'sandbox');
const BASE_URL = IS_SANDBOX ? SANDBOX_URL : PRODUCTION_URL;

console.log("[PAYPAL] Initializing PayPal service:", {
  mode: IS_SANDBOX ? 'sandbox' : 'production',
  baseUrl: BASE_URL,
  clientIdPrefix: process.env.PAYPAL_CLIENT_ID?.substring(0, 8) + '...',
});

const PLATFORM_FEE_PERCENTAGE = 0.05; // 5% platform fee
const SELLER_FEE_PERCENTAGE = 0.03; // 3% seller fee
const INSURANCE_FEE = 800; // $8.00 in cents

export class PaymentService {
  private static async getAccessToken(): Promise<string> {
    try {
      console.log("[PAYPAL] Requesting access token...");

      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
        throw new Error("PayPal API credentials are not configured");
      }

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
      if (axios.isAxiosError(error) && error.response) {
        console.error("[PAYPAL] API Error Response:", {
          status: error.response.status,
          data: error.response.data
        });
      }
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
        includeInsurance,
        timestamp: new Date().toISOString()
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
      const sellerPayout = baseAmount - Math.round(baseAmount * SELLER_FEE_PERCENTAGE);

      // If PayPal is not configured, create a simulated checkout
      if (!PAYPAL_ENABLED) {
        console.warn("[PAYPAL] Creating simulated checkout");
        const simulatedOrderId = `SIM_${auctionId}_${Date.now()}`;

        const payment = await storage.insertPayment({
          auctionId,
          buyerId,
          sellerId: auction.sellerId,
          amount: totalAmount,
          platformFee,
          insuranceFee,
          sellerPayout,
          status: 'pending',
          paypalOrderId: simulatedOrderId
        });

        await storage.updateAuction(auctionId, {
          status: "pending_fulfillment",
          paymentStatus: "pending"
        });

        return { orderId: simulatedOrderId, payment, simulated: true };
      }

      const accessToken = await this.getAccessToken();

      // Calculate dollar amounts from cents
      const totalAmountDollars = (totalAmount / 100).toFixed(2);
      const baseAmountDollars = (baseAmount / 100).toFixed(2);
      const feeAmountDollars = ((platformFee + insuranceFee) / 100).toFixed(2);

      console.log("[PAYPAL] Payment amounts:", {
        baseAmount,
        platformFee,
        insuranceFee,
        totalAmount,
        sellerPayout,
        baseAmountDollars,
        feeAmountDollars,
        totalAmountDollars
      });

      // Create PayPal order
      const orderRequest = {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: `auction_${auctionId}`,
          description: `Payment for auction #${auctionId}`,
          custom_id: `auction_${auctionId}`,
          amount: {
            currency_code: "USD",
            value: totalAmountDollars,
            breakdown: {
              item_total: {
                currency_code: "USD",
                value: baseAmountDollars
              },
              handling: {
                currency_code: "USD",
                value: feeAmountDollars
              }
            }
          },
          items: [{
            name: auction.title,
            description: `Auction #${auction.id}`,
            quantity: "1",
            unit_amount: {
              currency_code: "USD",
              value: baseAmountDollars
            }
          }]
        }]
      };

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
      console.log("[PAYPAL] Order created:", { orderId, status: response.data.status });

      // Create payment record
      const payment = await storage.insertPayment({
        auctionId,
        buyerId,
        sellerId: auction.sellerId,
        amount: totalAmount,
        platformFee,
        insuranceFee,
        sellerPayout,
        status: 'pending',
        paypalOrderId: orderId
      });

      // Update auction status
      await storage.updateAuction(auctionId, {
        status: "pending_fulfillment",
        paymentStatus: "pending"
      });

      return { orderId, payment };
    } catch (error) {
      console.error("[PAYPAL] Error creating order:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("[PAYPAL] API Error Response:", {
          status: error.response.status,
          data: error.response.data
        });
      }
      throw new Error(error instanceof Error ? error.message : "Failed to create payment");
    }
  }

  static async handlePaymentSuccess(orderId: string) {
    try {
      console.log("[PAYPAL] Processing payment success for order:", orderId);

      // Get access token
      const accessToken = await this.getAccessToken();

      // Find payment record
      const payment = await storage.findPaymentByPayPalId(orderId);
      if (!payment) {
        throw new Error("Payment record not found");
      }

      console.log("[PAYPAL] Found payment record:", {
        paymentId: payment.id,
        status: payment.status
      });

      // Verify payment status
      if (payment.status !== 'pending') {
        throw new Error(`Invalid payment status: ${payment.status}`);
      }

      // Add initial delay before checking order status
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get and verify order status
      const orderStatus = await this.getOrderStatus(orderId);
      console.log("[PAYPAL] Current order status:", orderStatus);

      if (orderStatus.status !== 'APPROVED') {
        throw new Error("Please complete the PayPal checkout process first");
      }

      // Configure capture retry settings
      const maxRetries = 3;
      const baseDelay = 2000;
      let captureSuccess = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`[PAYPAL] Capture attempt ${attempt} of ${maxRetries}`);

          // Exponential backoff delay
          if (attempt > 1) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          // Verify order status before capture
          const currentStatus = await this.getOrderStatus(orderId);
          if (currentStatus.status !== 'APPROVED') {
            console.log(`[PAYPAL] Order not ready for capture: ${currentStatus.status}`);
            continue;
          }

          // Attempt capture
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

          if (captureResponse.data.status === 'COMPLETED') {
            captureSuccess = true;
            console.log("[PAYPAL] Capture successful:", captureResponse.data);
            break;
          }

        } catch (error: any) {
          console.error(`[PAYPAL] Capture attempt ${attempt} failed:`, error.response?.data);

          if (error.response?.data?.details?.[0]) {
            const paypalError = error.response.data.details[0];

            if (paypalError.issue === 'INSTRUMENT_DECLINED') {
              throw new Error("Payment method was declined. Please try a different payment method.");
            }

            if (paypalError.issue === 'ORDER_NOT_APPROVED') {
              throw new Error("Please complete the payment approval in PayPal.");
            }

            // For other errors on final attempt
            if (attempt === maxRetries) {
              throw new Error(paypalError.description || "Payment capture failed. Please try again.");
            }
          }
        }
      }

      if (!captureSuccess) {
        throw new Error("Failed to capture payment after multiple attempts");
      }

      // Update payment status
      await storage.updatePaymentStatus(payment.id, "completed_pending_shipment");

      // Update auction status
      await storage.updateAuction(payment.auctionId, {
        status: "pending_fulfillment",
        paymentStatus: "completed_pending_shipment"
      });

      // Notify seller
      await NotificationService.createNotification({
        userId: payment.sellerId,
        type: "payment",
        title: "Payment Received",
        message: `Payment received for auction #${payment.auctionId}`
      });

      return { success: true };
    } catch (error: any) {
      console.error("[PAYPAL] Payment capture failed:", error);
      throw error;
    }
  }

  static async handlePaymentFailure(orderId: string) {
    try {
      console.log("[PAYPAL] Processing payment failure for order:", orderId);

      const payment = await storage.findPaymentByPayPalId(orderId);
      if (!payment) {
        throw new Error("Payment record not found");
      }

      // Update payment status
      await storage.updatePaymentStatus(payment.id, "failed");

      // Update auction status
      await storage.updateAuction(payment.auctionId, {
        status: "pending_fulfillment",
        paymentStatus: "failed"
      });

      // Notify seller
      await NotificationService.createNotification({
        userId: payment.sellerId,
        type: "payment",
        title: "Payment Failed",
        message: `Payment failed for auction #${payment.auctionId}`
      });

      console.log("[PAYPAL] Payment failure processed");
    } catch (error: any) {
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

      return {
        id: response.data.id,
        status: response.data.status,
        payer: response.data.payer,
        amount: response.data.purchase_units[0]?.amount
      };
    } catch (error: any) {
      console.error("[PAYPAL] Error getting order status:", error);
      throw new Error("Failed to get order status");
    }
  }
  static async releaseFundsToSeller(paymentId: number, trackingInfo: string) {
    try {
      console.log("[PAYPAL] Initiating fund release for payment:", paymentId);

      const payment = await storage.getPayment(paymentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      console.log("[PAYPAL] Found payment record:", {
        paymentId,
        status: payment.status,
        amount: payment.amount,
        sellerId: payment.sellerId
      });

      if (payment.status !== "completed_pending_shipment") {
        throw new Error(`Invalid payment status for fund release: ${payment.status}`);
      }

      // Get seller's PayPal info
      const sellerProfile = await storage.getProfile(payment.sellerId);

      // Calculate seller payout (90% of the final bid amount)
      const sellerPayout = Math.round(payment.amount * 0.90);

      let payoutResult;

      // Check if seller has PayPal info and PayPal is configured
      if (!sellerProfile?.paypalMerchantId || !PAYPAL_ENABLED) {
        console.warn("[PAYPAL] PayPal not fully configured, using simulated payout");

        // If in production but PayPal not configured, create a simulated payout
        payoutResult = await SellerPaymentService.createPayout(
          paymentId,
          payment.sellerId,
          sellerPayout,
          sellerProfile?.paypalMerchantId || `test-${payment.sellerId}@example.com`
        );
      } else {
        console.log("[PAYPAL] Processing payout to seller:", {
          sellerId: payment.sellerId,
          merchantId: sellerProfile.paypalMerchantId.substring(0, 4) + '...',
          amount: sellerPayout,
          originalAmount: payment.amount
        });

        // Process payout to seller using PayPal
        payoutResult = await SellerPaymentService.createPayout(
          paymentId,
          payment.sellerId,
          sellerPayout,
          sellerProfile.paypalMerchantId
        );
      }

      if (!payoutResult || (!payoutResult.batch_header?.payout_batch_id && !payoutResult.simulated)) {
        throw new Error("Failed to create payout");
      }

      // Update payment and tracking info
      console.log("[PAYPAL] Payout successful, updating payment status to completed");
      await storage.updatePayment(paymentId, {
        status: "completed",
        trackingInfo,
        completedAt: new Date()
      });

      // Update auction status
      console.log("[PAYPAL] Updating auction status to fulfilled");
      await storage.updateAuction(payment.auctionId, {
        status: "fulfilled",
        paymentStatus: "completed",
        trackingInfo
      });

      // Send tracking info to buyer
      await NotificationService.createNotification({
        userId: payment.buyerId,
        type: "fulfillment",
        title: "Order Shipped",
        message: `Your order has been shipped. Tracking information: ${trackingInfo}`
      });

      // Send notification to seller about payment
      await NotificationService.createNotification({
        userId: payment.sellerId,
        type: "payment",
        title: "Funds Released",
        message: `Your funds of $${(sellerPayout / 100).toFixed(2)} have been released for auction #${payment.auctionId}`
      });

      return { success: true };
    } catch (error) {
      console.error("[PAYPAL] Error releasing funds:", error);
      throw error;
    }
  }
  static async getPaymentStatus(auctionId: number): Promise<string> {
    try {
      console.log("[PAYPAL] Getting payment status for auction:", auctionId);

      // Get the payment record
      const payment = await storage.getPaymentByAuctionId(auctionId);
      if (!payment) {
        return "pending";
      }

      console.log("[PAYPAL] Found payment record:", {
        paymentId: payment.id,
        status: payment.status,
        orderId: payment.paypalOrderId
      });

      // If payment has PayPal order ID, verify its status
      if (payment.paypalOrderId) {
        const orderStatus = await this.getOrderStatus(payment.paypalOrderId);
        console.log("[PAYPAL] Order status from PayPal:", orderStatus);
      }

      // Get the auction to check both statuses
      const auction = await storage.getAuction(auctionId);
      console.log("[PAYPAL] Current status in tables:", {
        paymentTableStatus: payment.status,
        auctionTableStatus: auction?.paymentStatus
      });

      // Return the payment table status as it's more accurate
      return payment.status;
    } catch (error) {
      console.error("[PAYPAL] Error getting payment status:", error);
      throw new Error("Failed to get payment status");
    }
  }
}

class SellerPaymentService {
  static async createPayout(paymentId: number, sellerId: number, amount: number, receiverEmail: string) {
    try {
      // Check if PayPal is configured
      if (!PAYPAL_ENABLED) {
        console.warn("[PAYPAL] Cannot create payout: PayPal is not configured");

        // Record a simulated payout in development/testing mode
        if (process.env.NODE_ENV === 'production') {
          console.log("[PAYPAL] In production without PayPal: Recording simulated payout");

          await storage.createSellerPayOut({
            sellerId,
            paymentId,
            amount,
            paypalPayoutId: `SIMULATED_${paymentId}_${Date.now()}`,
            status: 'SIMULATED',
            createdAt: new Date(),
            completedAt: new Date()
          });

          return {
            batch_header: {
              payout_batch_id: `SIMULATED_${paymentId}_${Date.now()}`,
              batch_status: 'SIMULATED'
            },
            simulated: true
          };
        } else {
          throw new Error("PayPal is not configured in this environment");
        }
      }

      console.log(`[PAYPAL] Creating payout for payment ${paymentId} to seller ${sellerId}`);

      const accessToken = await PaymentService.getAccessToken();

      // Validate amount is greater than 0
      if (amount <= 0) {
        throw new Error("Payout amount must be greater than 0");
      }

      // Validate receiver email format
      if (!receiverEmail || typeof receiverEmail !== 'string' || !receiverEmail.includes('@')) {
        console.warn("[PAYPAL] Invalid receiver email format:", receiverEmail);
        throw new Error("Invalid PayPal receiver email format");
      }

      const amountInDollars = (amount / 100).toFixed(2);

      const payoutRequest = {
        sender_batch_header: {
          sender_batch_id: `payout_${paymentId}_${Date.now()}`,
          email_subject: "You have a payment from your auction sale",
          email_message: "Your auction payment has been processed and funds are now available."
        },
        items: [{
          recipient_type: "EMAIL",
          amount: {
            value: amountInDollars,
            currency: "USD"
          },
          receiver: receiverEmail,
          note: `Payment for auction ID: ${paymentId}`,
          sender_item_id: `item_${paymentId}_${Date.now()}`
        }]
      };

      console.log("[PAYPAL] Sending payout request:", {
        batchId: payoutRequest.sender_batch_header.sender_batch_id,
        recipientType: "EMAIL",
        receiverPrefix: receiverEmail.substring(0, 4) + '***@***' + receiverEmail.split('@')[1],
        amount: amountInDollars
      });

      const response = await axios.post(
        `${BASE_URL}/v1/payments/payouts`,
        payoutRequest,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `payout_${paymentId}_${Date.now()}`
          }
        }
      );

      console.log("[PAYPAL] Payout created successfully:", {
        payoutBatchId: response.data.batch_header.payout_batch_id,
        status: response.data.batch_header.batch_status
      });

      // Record the payout in our database
      await storage.createSellerPayOut({
        sellerId,
        paymentId,
        amount,
        paypalPayoutId: response.data.batch_header.payout_batch_id,
        status: response.data.batch_header.batch_status,
        createdAt: new Date(),
        completedAt: response.data.batch_header.batch_status === 'SUCCESS' ? new Date() : null
      });

      return response.data;
    } catch (error) {
      console.error("[PAYPAL] Error creating payout:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("[PAYPAL] API Error Response:", {
          status: error.response.status,
          data: error.response.data,
          name: error.response.data?.name,
          message: error.response.data?.message,
          details: error.response.data?.details
        });

        if (error.response.data?.name === 'VALIDATION_ERROR') {
          throw new Error(`PayPal validation error: ${error.response.data?.message || 'Invalid payout request'}`);
        }
      }
      throw new Error("Failed to process seller payout. Please ensure your PayPal account is properly configured.");
    }
  }
}