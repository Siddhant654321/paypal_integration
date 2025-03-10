import { storage } from "./storage";
import { Profile } from "@shared/schema";
import axios from 'axios';

// Check for required PayPal environment variables
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  throw new Error("Missing required PayPal credentials (CLIENT_ID or CLIENT_SECRET)");
}

// Log warning if partner merchant IDs are missing
if (!process.env.PAYPAL_PARTNER_MERCHANT_ID) {
  console.warn("Warning: PAYPAL_PARTNER_MERCHANT_ID is missing for production mode");
}
if (!process.env.PAYPAL_SANDBOX_PARTNER_MERCHANT_ID) {
  console.warn("Warning: PAYPAL_SANDBOX_PARTNER_MERCHANT_ID is missing for sandbox/development mode");
}

const PRODUCTION_URL = 'https://api-m.paypal.com';
const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

// Use sandbox URL in development
const IS_SANDBOX = process.env.NODE_ENV !== 'production';
const BASE_URL = IS_SANDBOX ? SANDBOX_URL : PRODUCTION_URL;
const PARTNER_MERCHANT_ID = IS_SANDBOX 
  ? process.env.PAYPAL_SANDBOX_PARTNER_MERCHANT_ID 
  : process.env.PAYPAL_PARTNER_MERCHANT_ID;

console.log("[PAYPAL] Initializing PayPal Payouts service:", {
  mode: IS_SANDBOX ? 'sandbox' : 'production',
  baseUrl: BASE_URL,
  clientIdPrefix: process.env.PAYPAL_CLIENT_ID.substring(0, 8) + '...'
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

      // Create a PayPal merchant integration
      const referralRequest = {
        tracking_id: `seller_${profile.userId}`,
        operations: [{
          operation: "API_INTEGRATION",
          api_integration_preference: {
            rest_api_integration: {
              integration_method: "PAYPAL",
              integration_type: "THIRD_PARTY",
              third_party_details: {
                features: ["PAYMENT", "REFUND", "PARTNER_FEE", "PAYOUT"]
              }
            }
          }
        }],
        products: ["EXPRESS_CHECKOUT", "PPCP"],
        legal_consents: [{
          type: "SHARE_DATA_CONSENT",
          granted: true
        }],
        partner_config_override: {
          return_url: `${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.replit.dev` : 'http://localhost:5000'}/seller/dashboard?success=true`
        }
      };

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
        throw new Error("Failed to generate PayPal onboarding URL");
      }

      console.log("[PAYPAL] Generated onboarding link:", {
        merchantId,
        returnUrl: `${process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.replit.dev` : 'http://localhost:5000'}/seller/dashboard?success=true`
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
    } catch (error) {
      console.error("[PAYPAL] Error creating seller account:", error);
      throw error;
    }
  }

  static async createPayout(paymentId: number, sellerId: number, amount: number): Promise<void> {
    try {
      console.log("[PAYPAL] Creating payout for:", { paymentId, sellerId, amount });

      const profile = await storage.getProfile(sellerId);
      if (!profile?.paypalMerchantId) {
        throw new Error("Seller has no PayPal account");
      }

      const accessToken = await this.getAccessToken();

      // Create a payout using the Payouts API
      const payoutRequest = {
        sender_batch_header: {
          sender_batch_id: `payout_${paymentId}_${Date.now()}`,
          email_subject: "You have a payout from your auction sale",
          email_message: "Your auction sale payment has been processed and the funds have been sent to your PayPal account."
        },
        items: [{
          recipient_type: "PAYPAL_ID",
          amount: {
            value: (amount / 100).toFixed(2),
            currency: "USD"
          },
          receiver: profile.paypalMerchantId,
          note: `Payout for auction sale #${paymentId}`,
          sender_item_id: `payout_item_${paymentId}`
        }]
      };

      console.log("[PAYPAL] Sending payout request:", {
        batchId: payoutRequest.sender_batch_header.sender_batch_id,
        amount: payoutRequest.items[0].amount.value,
        receiverId: profile.paypalMerchantId.substring(0, 8) + '...'
      });

      const response = await axios.post(
        `${BASE_URL}/v1/payments/payouts`,
        payoutRequest,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log("[PAYPAL] Payout created successfully:", {
        payoutBatchId: response.data.batch_header.payout_batch_id,
        status: response.data.batch_header.batch_status
      });

      // Store the payout details
      await storage.createSellerPayout({
        paymentId,
        sellerId,
        amount,
        paypalPayoutId: response.data.batch_header.payout_batch_id,
        status: 'pending'
      });

    } catch (error) {
      console.error("[PAYPAL] Error creating payout:", error);
      throw new Error("Failed to process seller payout");
    }
  }

  static async getAccountStatus(merchantId: string): Promise<"not_started" | "pending" | "verified" | "rejected"> {
    try {
      if (!merchantId) {
        return "not_started";
      }

      const accessToken = await this.getAccessToken();
      console.log("[PAYPAL] Checking account status for merchant:", merchantId);

      // Get merchant integration status
      const response = await axios.get(
        `${BASE_URL}/v1/customer/partners/${PARTNER_MERCHANT_ID}/merchant-integrations/${merchantId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const status = response.data.merchant_integration_status;

      console.log("[PAYPAL] Account status check:", {
        merchantId: merchantId.substring(0, 8) + '...',
        status,
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
    } catch (error) {
      console.error("[PAYPAL] Error checking account status:", error);
      return "not_started";
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