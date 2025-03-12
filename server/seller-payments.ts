import { storage } from "./storage";
import { Profile } from "@shared/schema";
import axios, { AxiosError } from 'axios';

// PayPal API Configuration
const PRODUCTION_URL = 'https://api-m.paypal.com';
const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

// Use sandbox URL in development
const IS_SANDBOX = process.env.NODE_ENV !== 'production';
const BASE_URL = IS_SANDBOX ? SANDBOX_URL : PRODUCTION_URL;

console.log("[PAYPAL] Initializing PayPal Payouts service:", {
  mode: IS_SANDBOX ? 'sandbox' : 'production',
  baseUrl: BASE_URL
});

export class SellerPaymentService {
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

  static async createSellerAccount(profile: Profile): Promise<{ merchantId: string; url: string }> {
    try {
      console.log("[PAYPAL] Creating seller account for:", profile.email);

      // Always create a test merchant ID in sandbox mode
      if (IS_SANDBOX) {
        console.log("[PAYPAL] In sandbox mode, creating test merchant account");
        const testMerchantId = `TEST_MERCHANT_${profile.userId}_${Date.now()}`;

        // Base URL for return paths
        const baseUrl = process.env.REPL_SLUG 
          ? `https://${process.env.REPL_SLUG}.${process.env.REPL_SLUG?.includes('.') ? 'replit.dev' : 'repl.co'}`
          : (process.env.REPL_ID ? `https://${process.env.REPL_ID}.id.repl.co` : 'http://localhost:5001');

        console.log("[PAYPAL] Using return base URL:", baseUrl);

        // Update profile with test merchant ID
        await storage.updateSellerPayPalAccount(profile.userId, {
          merchantId: testMerchantId,
          status: "verified", // Mark as verified in sandbox
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        console.log("[PAYPAL] Created test merchant ID in sandbox:", testMerchantId);

        return {
          merchantId: testMerchantId,
          url: `${baseUrl}/seller/dashboard?success=true&test=true`,
        };
      }

      // Clean up any existing account first
      if (profile.paypalMerchantId) {
        try {
          console.log("[PAYPAL] Previous merchant account exists:", profile.paypalMerchantId);
          // Note: In PayPal, we don't delete the merchant account, we just create a new one
        } catch (error) {
          console.warn("[PAYPAL] Warning with existing account:", error);
        }
      }

      const accessToken = await this.getAccessToken();

      // Base URL determination - use dynamic approach to get the correct Replit URL
      const baseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_SLUG?.includes('.') ? 'replit.dev' : 'repl.co'}`
        : (process.env.REPL_ID ? `https://${process.env.REPL_ID}.id.repl.co` : 'http://localhost:5001');

      console.log("[PAYPAL] Using base URL:", baseUrl);

      // Create a PayPal merchant integration
      // Simplified referral request for testing/sandbox environments
      const referralRequest = {
        tracking_id: `seller_${profile.userId}_${Date.now()}`,
        operations: [{
          operation: "API_INTEGRATION",
          api_integration_preference: {
            rest_api_integration: {
              integration_method: "PAYPAL",
              integration_type: "THIRD_PARTY",
              third_party_details: {
                features: ["PAYMENT", "REFUND"]
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
          return_url: `${baseUrl}/seller/dashboard?success=true`
        }
      };

      // Add logo URL only if we're in production (can cause issues in sandbox)
      if (!IS_SANDBOX) {
        referralRequest.partner_config_override.partner_logo_url = `${baseUrl}/images/logo.png`;
      }

      console.log("[PAYPAL] Sending partner referral request:", JSON.stringify(referralRequest, null, 2));

      const response = await axios.post(
        `${BASE_URL}/v2/customer/partner-referrals`,
        referralRequest,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const links = response.data.links;
      const actionUrl = links.find((link: any) => link.rel === "action_url")?.href;
      const merchantId = response.data.merchant_id;

      if (!actionUrl || !merchantId) {
        if (IS_SANDBOX) {
          // In sandbox/testing, create a test merchant ID if needed
          console.log("[PAYPAL] Generated mock onboarding link for testing");
          const testMerchantId = `TEST_MERCHANT_${profile.userId}_${Date.now()}`;

          // Update profile with test merchant ID
          await storage.updateSellerPayPalAccount(profile.userId, {
            merchantId: testMerchantId,
            status: "pending",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          return {
            merchantId: testMerchantId,
            url: `${baseUrl}/seller/dashboard?success=true&test=true`,
          };
        } else {
          throw new Error("Failed to generate PayPal onboarding URL");
        }
      }

      console.log("[PAYPAL] Generated onboarding link:", {
        merchantId,
        returnUrl: `${baseUrl}/seller/dashboard?success=true`
      });

      // Update profile with PayPal merchant ID and initial status
      await storage.updateSellerPayPalAccount(profile.userId, {
        merchantId,
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      return {
        merchantId,
        url: actionUrl,
      };
    } catch (err) {
      const error = err as Error | AxiosError;
      console.error("[PAYPAL] Error creating seller account:", error);

      if (axios.isAxiosError(error) && error.response?.data) {
        // Extract specific PayPal error message
        const errorMessage = error.response.data.details?.[0]?.issue || 
                           error.response.data.message || 
                           "Failed to connect to PayPal";
        throw new Error(`PayPal error: ${errorMessage}`);
      }

      throw new Error("Failed to connect with PayPal. Please try again later.");
    }
  }

  static async createPayout(
    paymentId: number, 
    sellerId: number, 
    amount: number,
    merchantId: string
  ): Promise<any> {
    try {
      console.log(`[PAYPAL] Creating payout for payment ${paymentId} to seller ${sellerId}`);

      const accessToken = await this.getAccessToken();

      // Validate amount is greater than 0
      if (amount <= 0) {
        throw new Error("Payout amount must be greater than 0");
      }

      const amountInDollars = (amount / 100).toFixed(2);

      // Create payout using PayPal's V1 Payouts API
      const payoutRequest = {
        sender_batch_header: {
          sender_batch_id: `payout_${paymentId}_${Date.now()}`,
          email_subject: "Your auction payment has been processed",
          email_message: "Your auction sale payment has been processed and the funds have been sent to your PayPal account."
        },
        items: [{
          recipient_type: "PAYPAL_ID",
          amount: {
            value: amountInDollars,
            currency: "USD"
          },
          receiver: merchantId,
          note: `Payment for auction sale #${paymentId}`,
          sender_item_id: `item_${paymentId}_${Date.now()}`
        }]
      };

      console.log("[PAYPAL] Sending payout request:", {
        batchId: payoutRequest.sender_batch_header.sender_batch_id,
        recipientType: "PAYPAL_ID",
        receiverPrefix: merchantId.substring(0, 8) + '...',
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

  static async getAccountStatus(merchantId: string): Promise<"not_started" | "pending" | "verified" | "rejected"> {
    try {
      if (!merchantId) {
        return "not_started";
      }

      // Always allow testing mode in sandbox environment
      if (IS_SANDBOX) {
        console.log("[PAYPAL] Running in sandbox mode, allowing seller operations");
        return "verified";
      }

      const accessToken = await this.getAccessToken();
      console.log("[PAYPAL] Checking account status for merchant:", merchantId);
      console.log("[PAYPAL] Using partner merchant ID:", PARTNER_MERCHANT_ID);

      try {
        // Get merchant integration status
        const url = `${BASE_URL}/v1/customer/partners/${PARTNER_MERCHANT_ID}/merchant-integrations/${merchantId}`;
        console.log("[PAYPAL] Making API call to:", url);

        const response = await axios.get(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        const status = response.data.merchant_integration_status;

        console.log("[PAYPAL] Account status check:", {
          merchantId: merchantId.substring(0, 8) + '...',
          status,
          responseData: JSON.stringify(response.data)
        });

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
      } catch (statusError) {
        // Log detailed error information
        console.error("[PAYPAL] Error during status check:", statusError.message);

        if (axios.isAxiosError(statusError) && statusError.response) {
          console.error("[PAYPAL] API error details:", {
            status: statusError.response.status,
            data: JSON.stringify(statusError.response.data),
            headers: statusError.response.headers
          });
        }

        // Always allow in sandbox mode regardless of errors
        if (IS_SANDBOX) {
          console.log("[PAYPAL] In sandbox mode, allowing operation to continue as 'verified' despite errors");
          return "verified";
        }

        return "pending";
      }
    } catch (error) {
      console.error("[PAYPAL] General error checking account status:", error);
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