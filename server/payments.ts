import { storage } from "./storage";
import { NotificationService } from "./notification-service";
import axios from 'axios';
import { EmailService } from './email-service';

// Payment Flow States
type PaymentFlowState = {
  orderId: string;
  status: string;
  timestamp: string;
  details?: any;
};

const paymentFlowLog = new Map<string, PaymentFlowState[]>();

// PayPal API Configuration
const PRODUCTION_URL = 'https://api-m.paypal.com';
const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

const IS_SANDBOX = process.env.NODE_ENV !== 'production' ||
  (process.env.PAYPAL_ENV === 'sandbox' || process.env.VITE_PAYPAL_ENV === 'sandbox');
const BASE_URL = IS_SANDBOX ? SANDBOX_URL : PRODUCTION_URL;

console.log("[PAYPAL] Payment service configuration:", {
  mode: IS_SANDBOX ? 'sandbox' : 'production',
  baseUrl: BASE_URL,
  clientIdPrefix: process.env.PAYPAL_CLIENT_ID?.substring(0, 8) + '...',
  environment: process.env.NODE_ENV,
  paypalEnv: process.env.PAYPAL_ENV
});

const PLATFORM_FEE_PERCENTAGE = 0.05;
const SELLER_FEE_PERCENTAGE = 0.03;
const INSURANCE_FEE = 800;

export class PaymentService {
  private static logPaymentFlow(orderId: string, status: string, details?: any) {
    const state: PaymentFlowState = {
      orderId,
      status,
      timestamp: new Date().toISOString(),
      details
    };

    const flowLog = paymentFlowLog.get(orderId) || [];
    flowLog.push(state);
    paymentFlowLog.set(orderId, flowLog);

    console.log(`[PAYPAL] Payment flow update for ${orderId}:`, {
      currentState: state,
      flowHistory: flowLog
    });
  }

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
        console.error("[PAYPAL] Auth Error Details:", {
          status: error.response.status,
          data: error.response.data,
          message: error.message
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
        includeInsurance
      });

      const auction = await storage.getAuction(auctionId);
      if (!auction) {
        throw new Error("Auction not found");
      }

      if (auction.winningBidderId !== buyerId) {
        throw new Error("Only the winning bidder can make payment");
      }

      const baseAmount = auction.currentPrice;
      const platformFee = Math.round(baseAmount * PLATFORM_FEE_PERCENTAGE);
      const insuranceFee = includeInsurance ? INSURANCE_FEE : 0;
      const totalAmount = baseAmount + platformFee + insuranceFee;
      const sellerPayout = baseAmount - Math.round(baseAmount * SELLER_FEE_PERCENTAGE);

      // Calculate dollar amounts
      const totalAmountDollars = (totalAmount / 100).toFixed(2);
      const baseAmountDollars = (baseAmount / 100).toFixed(2);
      const feeAmountDollars = ((platformFee + insuranceFee) / 100).toFixed(2);

      console.log("[PAYPAL] Payment amounts:", {
        baseAmount,
        platformFee,
        insuranceFee,
        totalAmount,
        sellerPayout,
        totalAmountDollars
      });

      const baseUrl = process.env.APP_URL || 'http://localhost:5001';

      const orderRequest = {
        intent: "CAPTURE",
        application_context: {
          return_url: `${baseUrl}/payment/success`,
          cancel_url: `${baseUrl}/payment/cancel`,
          brand_name: "Agriculture Marketplace",
          landing_page: "NO_PREFERENCE",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING"
        },
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

      const accessToken = await this.getAccessToken();
      console.log("[PAYPAL] Creating order with request:", orderRequest);

      const response = await axios.post(
        `${BASE_URL}/v2/checkout/orders`,
        orderRequest,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': `order_${auctionId}_${Date.now()}`,
            'Prefer': 'return=representation'
          }
        }
      );

      const orderId = response.data.id;
      this.logPaymentFlow(orderId, 'ORDER_CREATED', {
        status: response.data.status,
        links: response.data.links,
        orderRequest
      });

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

      await storage.updateAuction(auctionId, {
        status: "pending_fulfillment",
        paymentStatus: "pending"
      });

      const approvalUrl = response.data.links.find((link: any) => link.rel === "approve")?.href;

      this.logPaymentFlow(orderId, 'PAYMENT_RECORD_CREATED', { payment, approvalUrl });

      return {
        orderId,
        payment,
        approvalUrl
      };

    } catch (error) {
      console.error("[PAYPAL] Error creating order:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("[PAYPAL] API Error Details:", {
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
      this.logPaymentFlow(orderId, 'PAYMENT_SUCCESS_START');

      const accessToken = await this.getAccessToken();

      const payment = await storage.findPaymentByPayPalId(orderId);
      if (!payment) {
        throw new Error("Payment record not found");
      }

      this.logPaymentFlow(orderId, 'PAYMENT_RECORD_FOUND', { payment });

      if (payment.status !== 'pending') {
        throw new Error(`Invalid payment status: ${payment.status}`);
      }

      // Initial delay and status check
      await new Promise(resolve => setTimeout(resolve, 3000));
      const initialStatus = await this.getOrderStatus(orderId);
      this.logPaymentFlow(orderId, 'INITIAL_STATUS_CHECK', initialStatus);

      if (!['APPROVED', 'SAVED', 'COMPLETED'].includes(initialStatus.status)) {
        throw new Error("Please complete the payment process first");
      }

      // Configure capture settings
      const maxRetries = 5;
      const baseDelay = 3000;
      let captureSuccess = false;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          this.logPaymentFlow(orderId, `CAPTURE_ATTEMPT_${attempt}_START`);

          // Add delay between attempts
          if (attempt > 1) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`[PAYPAL] Waiting ${delay}ms before attempt ${attempt}`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          // Verify current order status
          const currentStatus = await this.getOrderStatus(orderId);
          this.logPaymentFlow(orderId, `CAPTURE_ATTEMPT_${attempt}_STATUS_CHECK`, currentStatus);

          if (!['APPROVED', 'SAVED', 'COMPLETED'].includes(currentStatus.status)) {
            console.log(`[PAYPAL] Order not ready for capture: ${currentStatus.status}`);
            continue;
          }

          if (currentStatus.status === 'COMPLETED') {
            console.log('[PAYPAL] Order already captured');
            captureSuccess = true;
            break;
          }

          // Attempt capture
          const captureResponse = await axios.post(
            `${BASE_URL}/v2/checkout/orders/${orderId}/capture`,
            {},
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'PayPal-Request-Id': `capture_${orderId}_${attempt}_${Date.now()}`,
                'Prefer': 'return=representation'
              }
            }
          );

          this.logPaymentFlow(orderId, `CAPTURE_ATTEMPT_${attempt}_RESPONSE`, {
            status: captureResponse.status,
            paypalStatus: captureResponse.data.status,
            data: captureResponse.data
          });

          if (captureResponse.data.status === 'COMPLETED') {
            captureSuccess = true;
            break;
          }

        } catch (error: any) {
          const errorDetails = {
            attempt,
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
          };

          this.logPaymentFlow(orderId, `CAPTURE_ATTEMPT_${attempt}_ERROR`, errorDetails);

          if (error.response?.data?.details?.[0]) {
            const paypalError = error.response.data.details[0];

            if (paypalError.issue === 'INSTRUMENT_DECLINED') {
              throw new Error("Payment method was declined. Please try a different payment method.");
            }

            if (paypalError.issue === 'ORDER_NOT_APPROVED') {
              throw new Error("Please complete the payment approval process.");
            }

            if (paypalError.issue === 'TRANSACTION_REFUSED') {
              if (attempt < maxRetries) {
                console.log('[PAYPAL] Transaction refused, will retry after delay');
                continue;
              }
              throw new Error("Transaction was refused. Please try a different payment method.");
            }

            if (attempt === maxRetries) {
              throw new Error(paypalError.description || "Payment capture failed. Please try again.");
            }
          }

          // Handle server errors with longer delay
          if (error.response?.status >= 500) {
            const serverErrorDelay = baseDelay * 2;
            console.log(`[PAYPAL] Server error, waiting ${serverErrorDelay}ms before retry`);
            await new Promise(resolve => setTimeout(resolve, serverErrorDelay));
          }
        }
      }

      if (!captureSuccess) {
        this.logPaymentFlow(orderId, 'CAPTURE_FAILED_ALL_ATTEMPTS');
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

      this.logPaymentFlow(orderId, 'PAYMENT_SUCCESS_COMPLETED');
      return { success: true };

    } catch (error: any) {
      console.error("[PAYPAL] Payment capture failed:", error);
      this.logPaymentFlow(orderId, 'PAYMENT_ERROR', {
        error: error.message,
        stack: error.stack
      });
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
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          }
        }
      );

      const status = {
        id: response.data.id,
        status: response.data.status,
        payer: response.data.payer,
        amount: response.data.purchase_units[0]?.amount
      };

      this.logPaymentFlow(orderId, 'ORDER_STATUS_CHECK', status);
      return status;

    } catch (error: any) {
      console.error("[PAYPAL] Error getting order status:", error);
      this.logPaymentFlow(orderId, 'ORDER_STATUS_ERROR', {
        error: error.message,
        response: error.response?.data
      });
      throw new Error("Failed to get order status");
    }
  }
  static async handlePaymentFailure(orderId: string) {
    try {
      console.log("[PAYPAL] Processing payment failure for order:", orderId);
      this.logPaymentFlow(orderId, 'PAYMENT_FAILURE_START');

      const payment = await storage.findPaymentByPayPalId(orderId);
      if (!payment) {
        throw new Error("Payment record not found");
      }

      this.logPaymentFlow(orderId, 'PAYMENT_RECORD_FOUND', { payment });

      // Update payment status
      await storage.updatePaymentStatus(payment.id, "failed");
      this.logPaymentFlow(orderId, 'PAYMENT_STATUS_UPDATED', { status: 'failed' });

      // Update auction status
      await storage.updateAuction(payment.auctionId, {
        status: "failed",
        paymentStatus: "failed"
      });
      this.logPaymentFlow(orderId, 'AUCTION_STATUS_UPDATED', { status: 'failed' });

      // Notify seller
      await NotificationService.createNotification({
        userId: payment.sellerId,
        type: "payment",
        title: "Payment Failed",
        message: `Payment failed for auction #${payment.auctionId}`
      });
      this.logPaymentFlow(orderId, 'NOTIFICATION_SENT', { userId: payment.sellerId, type: 'payment', title: 'Payment Failed' });

      console.log("[PAYPAL] Payment failure processed");
      this.logPaymentFlow(orderId, 'PAYMENT_FAILURE_COMPLETED');

    } catch (error: any) {
      console.error("[PAYPAL] Error handling payment failure:", error);
      this.logPaymentFlow(orderId, 'PAYMENT_FAILURE_ERROR', { error: error.message });
      throw error;
    }
  }
  static async releaseFundsToSeller(paymentId: number, trackingInfo: string) {
    try {
      console.log("[PAYPAL] Initiating fund release for payment:", paymentId);
      this.logPaymentFlow(String(paymentId), 'FUND_RELEASE_START');

      const payment = await storage.getPayment(paymentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      this.logPaymentFlow(String(paymentId), 'PAYMENT_RECORD_FOUND', { payment });

      if (payment.status !== "completed_pending_shipment") {
        throw new Error(`Invalid payment status for fund release: ${payment.status}`);
      }

      // Get seller's PayPal info
      const sellerProfile = await storage.getProfile(payment.sellerId);

      // Calculate seller payout (90% of the final bid amount)
      const sellerPayout = Math.round(payment.amount * 0.90);

      let payoutResult;

      // Check if seller has PayPal info and PayPal is configured
      if (!sellerProfile?.paypalMerchantId || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
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
      this.logPaymentFlow(String(paymentId), 'PAYMENT_STATUS_UPDATED', { status: 'completed' });

      // Update auction status
      console.log("[PAYPAL] Updating auction status to fulfilled");
      await storage.updateAuction(payment.auctionId, {
        status: "fulfilled",
        paymentStatus: "completed",
        trackingInfo
      });
      this.logPaymentFlow(String(paymentId), 'AUCTION_STATUS_UPDATED', { status: 'fulfilled' });

      // Send tracking info to buyer
      await NotificationService.createNotification({
        userId: payment.buyerId,
        type: "fulfillment",
        title: "Order Shipped",
        message: `Your order has been shipped. Tracking information: ${trackingInfo}`
      });
      this.logPaymentFlow(String(paymentId), 'NOTIFICATION_SENT', { userId: payment.buyerId, type: 'fulfillment' });

      // Send notification to seller about payment
      await NotificationService.createNotification({
        userId: payment.sellerId,
        type: "payment",
        title: "Funds Released",
        message: `Your funds of $${(sellerPayout / 100).toFixed(2)} have been released for auction #${payment.auctionId}`
      });
      this.logPaymentFlow(String(paymentId), 'NOTIFICATION_SENT', { userId: payment.sellerId, type: 'payment', title: 'Funds Released' });

      return { success: true };
    } catch (error) {
      console.error("[PAYPAL] Error releasing funds:", error);
      this.logPaymentFlow(String(paymentId), 'FUND_RELEASE_ERROR', { error: error.message });
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

      this.logPaymentFlow(String(auctionId), 'PAYMENT_RECORD_FOUND', { payment });

      // If payment has PayPal order ID, verify its status
      if (payment.paypalOrderId) {
        const orderStatus = await this.getOrderStatus(payment.paypalOrderId);
        this.logPaymentFlow(String(auctionId), 'ORDER_STATUS_CHECK', orderStatus);
      }

      // Get the auction to check both statuses
      const auction = await storage.getAuction(auctionId);
      this.logPaymentFlow(String(auctionId), 'AUCTION_RECORD_FOUND', auction);
      console.log("[PAYPAL] Current status in tables:", {
        paymentTableStatus: payment.status,
        auctionTableStatus: auction?.paymentStatus
      });

      // Return the payment table status as it's more accurate
      return payment.status;
    } catch (error) {
      console.error("[PAYPAL] Error getting payment status:", error);
      this.logPaymentFlow(String(auctionId), 'PAYMENT_STATUS_ERROR', { error: error.message });
      throw new Error("Failed to get payment status");
    }
  }
}

class SellerPaymentService {
  static async createPayout(paymentId: number, sellerId: number, amount: number, receiverEmail: string) {
    try {
      // Check if PayPal is configured
      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
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