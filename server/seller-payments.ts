import { type Profile, PaymentStatus } from "@shared/schema";
import { storage } from "./storage";
import axios, { AxiosError } from 'axios';

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
  clientIdPrefix: process.env.PAYPAL_CLIENT_ID?.substring(0, 8) + '...'
});

export class SellerPaymentService {
  private static async getAccessToken(): Promise<string> {
    try {
      console.log("[PAYPAL] Requesting access token...");

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
          data: JSON.stringify(error.response.data, null, 2)
        });
      }
      throw new Error("Failed to authenticate with PayPal");
    }
  }

  // Helper function to map PayPal status to our schema status
  private static mapPayPalStatus(paypalStatus: string): PaymentStatus {
    switch (paypalStatus) {
      case 'SUCCESS':
        return 'completed';
      case 'PENDING':
        return 'pending';
      case 'FAILED':
      case 'DENIED':
        return 'failed';
      default:
        return 'pending';
    }
  }

  static async createPayout(
    paymentId: number,
    sellerId: number,
    amount: number,
    receiverEmail: string,
    senderEmail?: string
  ): Promise<any> {
    try {
      console.log(`[PAYPAL] Creating payout for payment ${paymentId} to seller ${sellerId}`);

      // Validate parameters
      if (!receiverEmail) {
        throw new Error("Receiver email is required for payout");
      }

      if (amount <= 0) {
        throw new Error("Payout amount must be greater than 0");
      }

      const accessToken = await this.getAccessToken();
      const amountInDollars = (amount / 100).toFixed(2);

      // Create minimal payout request according to PayPal documentation
      const payoutRequest = {
        sender_batch_header: {
          sender_batch_id: `TEST_PAYOUT_${paymentId}_${Date.now()}`,
          email_subject: "You have a payout from your auction sale",
          email_message: "Your auction payment has been processed."
        },
        items: [{
          recipient_type: "EMAIL",
          amount: {
            value: amountInDollars,
            currency: "USD"
          },
          receiver: receiverEmail,
          note: "POSPYO001", // Success test code for sandbox
          sender_item_id: `PAYOUT_${paymentId}_${Date.now()}`
        }]
      };

      console.log("[PAYPAL] Sending payout request:", {
        batchId: payoutRequest.sender_batch_header.sender_batch_id,
        recipientType: "EMAIL",
        receiverEmail: receiverEmail.substring(0, 8) + '...',
        amount: amountInDollars,
        request: JSON.stringify(payoutRequest, null, 2)
      });

      const response = await axios.post(
        `${BASE_URL}/v1/payments/payouts`,
        payoutRequest,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Request-Id': payoutRequest.sender_batch_header.sender_batch_id,
            'PayPal-Partner-Attribution-Id': process.env.PAYPAL_SANDBOX_PARTNER_MERCHANT_ID
          }
        }
      );

      console.log("[PAYPAL] Payout created successfully:", {
        status: response.status,
        data: JSON.stringify(response.data, null, 2)
      });

      // Store the payout details - now passing sellerId and payout data separately
      // Map PayPal status to our schema status
      const status = this.mapPayPalStatus(response.data.batch_header.batch_status);

      await storage.createSellerPayOut(sellerId, {
        paymentId,
        amount,
        paypalPayoutId: response.data.batch_header.payout_batch_id,
        status,
        createdAt: new Date(),
        completedAt: status === 'completed' ? new Date() : null
      });

      return response.data;
    } catch (error) {
      console.error("[PAYPAL] Error creating payout:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("[PAYPAL] API Error Details:", {
          status: error.response.status,
          data: JSON.stringify(error.response.data, null, 2),
          details: error.response.data?.details || [],
          name: error.response.data?.name,
          message: error.response.data?.message
        });

        if (error.response.status === 422 || error.response.status === 400) {
          const errorDetails = error.response.data?.details?.[0] || error.response.data;
          throw new Error(`PayPal validation error: ${JSON.stringify(errorDetails)}`);
        }
      }

      // In production, record the failed attempt
      if (process.env.NODE_ENV === 'production') {
        await storage.createSellerPayOut(sellerId, {
          paymentId,
          amount,
          paypalPayoutId: `FAILED_${paymentId}_${Date.now()}`,
          status: 'failed',
          createdAt: new Date(),
          completedAt: null
        });
      }

      throw new Error("Failed to process seller payout. Please ensure your PayPal account is properly configured.");
    }
  }

  static async getAccountStatus(merchantId: string): Promise<"not_started" | "pending" | "verified" | "rejected"> {
    try {
      if (!merchantId) {
        return "not_started";
      }

      // For sandbox/testing, always return verified
      if (IS_SANDBOX || !process.env.PAYPAL_CLIENT_ID) {
        return "verified";
      }

      // In production, verify the account status
      const accessToken = await this.getAccessToken();

      try {
        const response = await axios.get(
          `${BASE_URL}/v1/customer/partners/${process.env.PAYPAL_PARTNER_MERCHANT_ID}/merchant-integrations/${merchantId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const status = response.data.merchant_integration_status;
        switch (status) {
          case "ACTIVE":
            return "verified";
          case "INACTIVE":
            return "rejected";
          case "PENDING":
            return "pending";
          default:
            return "not_started";
        }
      } catch (error) {
        console.error("[PAYPAL] Error checking merchant status:", error);
        return "pending";
      }
    } catch (error) {
      console.error("[PAYPAL] Error in getAccountStatus:", error);
      return IS_SANDBOX ? "verified" : "not_started";
    }
  }

  static async getBalance(merchantId: string) {
    try {
      const accessToken = await this.getAccessToken();

      const response = await axios.get(
        `${BASE_URL}/v1/reporting/balances`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Auth-Assertion': merchantId
          }
        }
      );

      return {
        available: [{
          amount: response.data.available_balance.total,
          currency: response.data.available_balance.currency
        }],
        pending: [{
          amount: response.data.pending_balance.total,
          currency: response.data.pending_balance.currency
        }]
      };
    } catch (error) {
      console.error("[PAYPAL] Error getting balance:", error);
      throw error;
    }
  }
}