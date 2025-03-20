import { storage } from "./storage";
import { NotificationService } from "./notification-service";
import axios from 'axios';
import { EmailService } from './email-service';

// Payment Flow States and Logging
type PaymentFlowState = {
 orderId: string;
 status: string;
 timestamp: string;
 details?: any;
};

// Add a new type for order approval status
type OrderApprovalStatus = {
 approved: boolean;
 approvedAt?: Date;
};

const paymentFlowLog = new Map<string, PaymentFlowState[]>();

// Add a map to track order approvals
const orderApprovals = new Map<string, OrderApprovalStatus>();

// PayPal API Configuration
const PRODUCTION_URL = 'https://api-m.paypal.com';
const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

// Explicitly check for sandbox mode
const IS_SANDBOX = process.env.PAYPAL_ENV === 'sandbox' || process.env.VITE_PAYPAL_ENV === 'sandbox';
const BASE_URL = IS_SANDBOX ? SANDBOX_URL : PRODUCTION_URL;

console.log("[PAYPAL] Payment service configuration:", {
 mode: IS_SANDBOX ? 'sandbox' : 'production',
 baseUrl: BASE_URL,
 clientIdPrefix: process.env.PAYPAL_CLIENT_ID?.substring(0, 8) + '...',
 environment: process.env.NODE_ENV,
 paypalEnv: process.env.PAYPAL_ENV,
 vitePaypalEnv: process.env.VITE_PAYPAL_ENV
});

const PLATFORM_FEE_PERCENTAGE = 0.05;
const SELLER_FEE_PERCENTAGE = 0.9;
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

 private static logRequestResponse(stage: string, orderId: string, request: any, response: any) {
   console.log(`[PAYPAL] ${stage} for order ${orderId}:`, {
     request: {
       url: request.url,
       method: request.method,
       headers: request.headers,
       data: request.data
     },
     response: {
       status: response.status,
       statusText: response.statusText,
       headers: response.headers,
       data: response.data
     }
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
        sandbox: IS_SANDBOX
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
      
      const totalAmountDollars = (totalAmount / 100).toFixed(2);

      const accessToken = await this.getAccessToken();

      const orderRequest = {
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: `auction_${auctionId}`,
          description: `Payment for auction #${auctionId}`,
          amount: {
            currency_code: "USD",
            value: totalAmountDollars
          }
        }],
        application_context: {
          return_url: `${process.env.APP_URL}/payment/success`,
          cancel_url: `${process.env.APP_URL}/payment/cancel`
        }
      };

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

      // Create payment record
      await storage.insertPayment({
        auctionId,
        buyerId,
        sellerId: auction.sellerId,
        amount: totalAmount,
        platformFee,
        insuranceFee,
        status: 'pending',
        paypalOrderId: orderId
      });

      return {
        orderId,
        url: response.data.links.find((link: any) => link.rel === "approve")?.href
      };
    } catch (error) {
      console.error("[PAYPAL] Error creating order:", error);
      throw error;
    }
  } {
   try {
     console.log("[PAYPAL] Creating checkout session:", {
       auctionId,
       buyerId,
       includeInsurance,
       sandbox: IS_SANDBOX
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
         brand_name: "Agriculture Marketplace",
         landing_page: "NO_PREFERENCE",
         shipping_preference: "NO_SHIPPING",
         user_action: "PAY_NOW",
         payment_method: {
           payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED"
         },
         return_url: `${baseUrl}/payment/success`,
         cancel_url: `${baseUrl}/payment/cancel`
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
           'PayPal-Partner-Attribution-Id': process.env.PAYPAL_BN_CODE || 'AgriMarketplace_SP',
           'Prefer': 'return=representation'
         }
       }
     );

     this.logRequestResponse('Order Creation', response.data.id, {
       url: `${BASE_URL}/v2/checkout/orders`,
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${accessToken}`,
         'Content-Type': 'application/json',
         'PayPal-Request-Id': `order_${auctionId}_${Date.now()}`,
         'PayPal-Partner-Attribution-Id': process.env.PAYPAL_BN_CODE || 'AgriMarketplace_SP',
         'Prefer': 'return=representation'
       },
       data: orderRequest
     }, response);

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

     // Check if order was approved by buyer
     const approval = orderApprovals.get(orderId);
     if (!approval?.approved) {
       throw new Error("Order has not been approved by buyer");
     }

     const accessToken = await this.getAccessToken();

     const payment = await storage.findPaymentByPayPalId(orderId);
     if (!payment) {
       throw new Error("Payment record not found");
     }

     this.logPaymentFlow(orderId, 'PAYMENT_RECORD_FOUND', { payment });

     if (payment.status !== 'pending') {
       throw new Error(`Invalid payment status: ${payment.status}`);
     }

     // Initial check of order status
     const initialStatus = await this.getOrderStatus(orderId);
     console.log("[PAYPAL] Initial order status check:", initialStatus.status);

     // If order is already completed, no need to capture
     if (initialStatus.status === 'COMPLETED') {
       console.log("[PAYPAL] Order already completed");
       return { success: true };
     }

     // Maximum attempts and delay configuration
     const maxStatusChecks = 5;
     const baseDelay = 3000; // 3 seconds
     let currentStatus = initialStatus;

     // Wait for order to reach APPROVED state
     for (let attempt = 0; attempt < maxStatusChecks; attempt++) {
       if (currentStatus.status === 'APPROVED') {
         console.log("[PAYPAL] Order is approved, proceeding to capture");
         break;
       }

       if (attempt < maxStatusChecks - 1) {
         const delay = baseDelay * Math.pow(1.5, attempt);
         console.log(`[PAYPAL] Waiting ${delay}ms for order approval, current status: ${currentStatus.status}`);
         await new Promise(resolve => setTimeout(resolve, delay));
         currentStatus = await this.getOrderStatus(orderId);
       }
     }

     if (currentStatus.status !== 'APPROVED' && currentStatus.status !== 'COMPLETED') {
       console.error("[PAYPAL] Order failed to reach APPROVED state:", currentStatus);
       throw new Error(`Order is in invalid state: ${currentStatus.status}. Please complete the PayPal checkout process.`);
     }

     let lastError = null;
     let captureStatus = null;


     // Configure capture retry settings
     const maxRetries = 5;
     // Using different variable name to avoid conflict
     const captureDelay = 10000;

     // Try to capture the payment
     let captureSuccess = false;
     let captureError = null;

     for (let attempt = 1; attempt <= maxRetries; attempt++) {
       try {
         this.logPaymentFlow(orderId, `CAPTURE_ATTEMPT_${attempt}`);

         // Get fresh order status before capture
         const orderStatus = await this.getOrderStatus(orderId);
         this.logPaymentFlow(orderId, `ORDER_STATUS_CHECK_${attempt}`, orderStatus);

         // Log full order details
         console.log(`[PAYPAL] Order status details (attempt ${attempt}):`, {
           status: orderStatus.status,
           payer: orderStatus.payer,
           amount: orderStatus.amount,
           links: orderStatus.links
         });

         if (orderStatus.status === 'COMPLETED') {
           captureSuccess = true;
           break;
         }

         if (!['APPROVED', 'SAVED'].includes(orderStatus.status)) {
           console.log(`[PAYPAL] Order not ready for capture: ${orderStatus.status}`);
           if (attempt < maxRetries) {
             const delay = baseDelay * Math.pow(2, attempt - 1);
             console.log(`[PAYPAL] Waiting ${delay}ms before next attempt`);
             await new Promise(resolve => setTimeout(resolve, delay));
             continue;
           }
           throw new Error(`Order in invalid state: ${orderStatus.status}`);
         }

         // Additional verification of order state
         if (!orderStatus.payer || !orderStatus.amount) {
           console.log("[PAYPAL] Order missing required details:", { orderStatus });
           if (attempt < maxRetries) {
             const delay = baseDelay * Math.pow(2, attempt - 1);
             console.log(`[PAYPAL] Waiting ${delay}ms for order details to populate`);
             await new Promise(resolve => setTimeout(resolve, delay));
             continue;
           }
           throw new Error("Order missing required details");
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
               'PayPal-Partner-Attribution-Id': process.env.PAYPAL_BN_CODE || 'AgriMarketplace_SP',
               'Prefer': 'return=representation'
             }
           }
         );

         // Log the full capture request and response
         this.logRequestResponse(`Capture Attempt ${attempt}`, orderId, {
           url: `${BASE_URL}/v2/checkout/orders/${orderId}/capture`,
           method: 'POST',
           headers: {
             'Authorization': `Bearer ${accessToken}`,
             'Content-Type': 'application/json',
             'PayPal-Request-Id': `capture_${orderId}_${attempt}_${Date.now()}`,
             'PayPal-Partner-Attribution-Id': process.env.PAYPAL_BN_CODE || 'AgriMarketplace_SP',
             'Prefer': 'return=representation'
           },
           data: {}
         }, captureResponse);

         this.logPaymentFlow(orderId, `CAPTURE_RESPONSE_${attempt}`, captureResponse.data);

         if (captureResponse.data.status === 'COMPLETED') {
           captureSuccess = true;
           break;
         }

       } catch (error: any) {
         captureError = error;
         this.logPaymentFlow(orderId, `CAPTURE_ERROR_${attempt}`, {
           message: error.message,
           response: error.response?.data,
           responseHeaders: error.response?.headers,
           responseStatus: error.response?.status
         });

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
               const delay = baseDelay * Math.pow(2, attempt - 1);
               console.log(`[PAYPAL] Transaction refused, waiting ${delay}ms before retry`);
               await new Promise(resolve => setTimeout(resolve, delay));
               continue;
             }
             throw new Error("Transaction was refused. Please try a different payment method.");
           }
         }

         // Handle other errors with exponential backoff
         if (attempt < maxRetries) {
           const delay = baseDelay * Math.pow(2, attempt - 1);
           console.log(`[PAYPAL] Capture failed, waiting ${delay}ms before retry`);
           await new Promise(resolve => setTimeout(resolve, delay));
           continue;
         }
       }
     }

     if (!captureSuccess) {
       this.logPaymentFlow(orderId, 'CAPTURE_FAILED');
       throw captureError || new Error("Failed to capture payment after multiple attempts");
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
       message: `Payment received for auction #${payment.auctionId}`,
       metadata: { auctionId: payment.auctionId }
     });

     this.logPaymentFlow(orderId, 'PAYMENT_SUCCESS_COMPLETED');
     return { success: true };

   } catch (error: any) {
     console.error("[PAYPAL] Payment capture failed:", error);
     this.logPaymentFlow(orderId, 'PAYMENT_ERROR', {
       message: error.message,
       response: error.response?.data,
       stack: error.stack
     });
     throw error;
   }
 }

 static async getOrderStatus(orderId: string) {
   let attempts = 0;
   const maxAttempts = 3;
   const baseDelay = 2000;

   while (attempts < maxAttempts) {
     try {
       console.log(`[PAYPAL] Getting order status for ${orderId} (attempt ${attempts + 1}/${maxAttempts})`);
       const accessToken = await this.getAccessToken();

       const response = await axios.get(
         `${BASE_URL}/v2/checkout/orders/${orderId}`,
         {
           headers: {
             'Authorization': `Bearer ${accessToken}`,
             'Content-Type': 'application/json',
             'PayPal-Partner-Attribution-Id': process.env.PAYPAL_BN_CODE || 'AgriMarketplace_SP',
             'Prefer': 'return=representation'
           }
         }
       );

       const status = {
         id: response.data.id,
         status: response.data.status,
         payer: response.data.payer,
         amount: response.data.purchase_units[0]?.amount,
         links: response.data.links
       };

       this.logPaymentFlow(orderId, 'ORDER_STATUS_CHECK', status);
       return status;

     } catch (error: any) {
       attempts++;
       console.error(`[PAYPAL] Error getting order status (attempt ${attempts}/${maxAttempts}):`, error);
       this.logPaymentFlow(orderId, 'ORDER_STATUS_ERROR', {
         attempt: attempts,
         error: error.message,
         response: error.response?.data
       });

       if (attempts === maxAttempts) {
         throw new Error(`Failed to get order status after ${maxAttempts} attempts: ${error.message}`);
       }

       // Wait before retrying with exponential backoff
       const delay = baseDelay * Math.pow(2, attempts - 1);
       console.log(`[PAYPAL] Retrying in ${delay}ms...`);
       await new Promise(resolve => setTimeout(resolve, delay));
     }
   }

   throw new Error(`Failed to get order status after ${maxAttempts} attempts`);
 }
 // Add the generateClientToken method to the PaymentService class
 static async generateClientToken(): Promise<string> {
   try {
     console.log("[PAYPAL] Generating client token");

     const accessToken = await this.getAccessToken();

     const response = await axios.post(
       `${BASE_URL}/v1/identity/generate-token`,
       {},
       {
         headers: {
           'Authorization': `Bearer ${accessToken}`,
           'Content-Type': 'application/json',
           'PayPal-Partner-Attribution-Id': process.env.PAYPAL_BN_CODE || 'AgriMarketplace_SP'
         }
       }
     );

     console.log("[PAYPAL] Client token generated successfully");
     return response.data.client_token;

   } catch (error) {
     console.error("[PAYPAL] Error generating client token:", error);
     if (axios.isAxiosError(error) && error.response) {
       console.error("[PAYPAL] API Error Details:", {
         status: error.response.status,
         data: error.response.data
       });
     }
     throw new Error("Failed to generate PayPal client token");
   }
 }
 static async approveOrder(orderId: string): Promise<void> {
   try {
     console.log("[PAYPAL] Approving order:", orderId);

     // Verify order exists
     const orderStatus = await this.getOrderStatus(orderId);
     if (!orderStatus) {
       throw new Error("Order not found");
     }

     // Mark order as approved
     orderApprovals.set(orderId, {
       approved: true,
       approvedAt: new Date()
     });

     this.logPaymentFlow(orderId, 'ORDER_APPROVED_BY_BUYER');
   } catch (error) {
     console.error("[PAYPAL] Error approving order:", error);
     throw error;
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
       status: "pending_fulfillment", // Keep the original status
       paymentStatus: "failed"
     });
     this.logPaymentFlow(orderId, 'AUCTION_STATUS_UPDATED', { status: 'failed' });

     // Notify seller
     await NotificationService.createNotification({
       userId: payment.sellerId,
       type: "payment",
       title: "Payment Failed",
       message: `Payment failed for auction #${payment.auctionId}`,
       metadata: { auctionId: payment.auctionId }
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

     // Calculate seller payout
     const sellerPayout = payment.sellerPayout || Math.round(payment.amount * 0.90);

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
       paymentStatus: "completed"
     });
     this.logPaymentFlow(String(paymentId), 'AUCTION_STATUS_UPDATED', { status: 'fulfilled' });

     // Send tracking info to buyer
     await NotificationService.createNotification({
       userId: payment.buyerId,
       type: "fulfillment",
       title: "Order Shipped",
       message: `Your order has been shipped. Tracking information: ${trackingInfo}`,
       metadata: { auctionId: payment.auctionId, trackingInfo }
     });
     this.logPaymentFlow(String(paymentId), 'NOTIFICATION_SENT', { userId: payment.buyerId, type: 'fulfillment' });

     // Send notification to seller about payment
     await NotificationService.createNotification({
       userId: payment.sellerId,
       type: "payment",
       title: "Funds Released",
       message: `Your funds of $${(sellerPayout / 100).toFixed(2)} have been released for auction #${payment.auctionId}`,
       metadata: { auctionId: payment.auctionId, amount: sellerPayout }
     });
     this.logPaymentFlow(String(paymentId), 'NOTIFICATION_SENT', { userId: payment.sellerId, type: 'payment', title: 'Funds Released' });

     return { success: true };
   } catch (error: any) {
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
   } catch (error: any) {
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