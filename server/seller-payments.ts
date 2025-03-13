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

      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
        throw new Error("PayPal credentials not configured. Please check your environment variables.");
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
          data: JSON.stringify(error.response.data, null, 2)
        });
      }
      throw new Error("Failed to authenticate with PayPal. Please check your credentials and try again.");
    }
  }

  static async createSellerAccount(profile: Profile): Promise<{ merchantId: string; url: string }> {
    try {
      console.log("[PAYPAL] Creating seller account for:", profile.email);

      // Base URL determination - use dynamic approach to get the correct Replit URL
      const baseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_SLUG?.includes('.') ? 'replit.dev' : 'repl.co'}`
        : (process.env.REPL_ID ? `https://${process.env.REPL_ID}.id.repl.co` : 'http://localhost:5001');

      // Always create a test merchant ID in sandbox mode
      if (IS_SANDBOX) {
        console.log("[PAYPAL] In sandbox mode, creating test merchant account");
        const testMerchantId = `TEST_MERCHANT_${profile.userId}_${Date.now()}`;

        console.log("[PAYPAL] Using return base URL:", baseUrl);

        // Update profile with test merchant ID
        await storage.updateSellerPayPalAccount(profile.userId, {
          merchantId: testMerchantId,
          status: "verified" // Mark as verified in sandbox
        });

        console.log("[PAYPAL] Created test merchant ID in sandbox:", testMerchantId);

        return {
          merchantId: testMerchantId,
          url: `${baseUrl}/seller/dashboard?success=true&test=true`,
        };
      }

      const accessToken = await this.getAccessToken();

      console.log("[PAYPAL] Using base URL:", baseUrl);

      // Create a PayPal merchant integration
      const referralRequest = {
        tracking_id: `seller_${profile.userId}_${Date.now()}`,
        operations: [{
          operation: "API_INTEGRATION",
          api_integration_preference: {
            rest_api_integration: {
              integration_method: "PAYPAL",
              integration_type: "THIRD_PARTY",
              third_party_details: {
                features: ["PAYMENT", "REFUND", "DELAYED_DISBURSEMENT"]
              }
            }
          }
        }],
        products: ["EXPRESS_CHECKOUT"],
        legal_consents: [{
          type: "SHARE_DATA_CONSENT",
          granted: true
        }],
        partner_config_override: {
          return_url: `${baseUrl}/seller/dashboard?success=true`,
          partner_logo_url: `${baseUrl}/images/logo.png`
        }
      };

      // Log the full request URL and headers for debugging
      const requestUrl = `${BASE_URL}/v2/customer/partner-referrals`;
      console.log("[PAYPAL] Making API request to:", requestUrl);
      console.log("[PAYPAL] With headers:", {
        Authorization: 'Bearer <token>',
        'Content-Type': 'application/json',
        'PayPal-Partner-Attribution-Id': process.env.PAYPAL_SANDBOX_PARTNER_MERCHANT_ID
      });

      const response = await axios.post(
        requestUrl,
        referralRequest,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'PayPal-Partner-Attribution-Id': process.env.PAYPAL_SANDBOX_PARTNER_MERCHANT_ID
          }
        }
      );

      console.log("[PAYPAL] Partner referral response:", {
        status: response.status,
        data: JSON.stringify(response.data, null, 2)
      });

      const links = response.data.links;
      const actionUrl = links.find((link: any) => link.rel === "action_url")?.href;
      const merchantId = response.data.merchant_id;

      if (!actionUrl || !merchantId) {
        throw new Error("Failed to generate PayPal onboarding URL. Please try again later.");
      }

      console.log("[PAYPAL] Generated onboarding link:", {
        merchantId,
        returnUrl: `${baseUrl}/seller/dashboard?success=true`
      });

      // Update profile with PayPal merchant ID and initial status
      await storage.updateSellerPayPalAccount(profile.userId, {
        merchantId,
        status: "pending"
      });

      return {
        merchantId,
        url: actionUrl,
      };
    } catch (err) {
      const error = err as Error | AxiosError;
      console.error("[PAYPAL] Error creating seller account:", error);

      if (axios.isAxiosError(error) && error.response?.data) {
        console.error("[PAYPAL] API Error Details:", {
          status: error.response.status,
          url: error.config?.url,
          data: JSON.stringify(error.response.data, null, 2),
          details: error.response.data.details || []
        });

        if (error.response.status === 404) {
          throw new Error("Unable to connect to PayPal API. Please ensure you're using a sandbox account for testing.");
        }

        // Extract specific PayPal error message
        const errorMessage = error.response.data.details?.[0]?.issue || 
                           error.response.data.message || 
                           "Failed to connect to PayPal";
        throw new Error(`PayPal error: ${errorMessage}`);
      }

      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
        throw new Error("PayPal is not properly configured. Please ensure your PayPal API credentials are set up correctly.");
      }

      throw new Error("Failed to connect with PayPal. Please check your internet connection and try again later.");
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