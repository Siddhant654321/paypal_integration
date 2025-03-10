import { storage } from "./storage";
import { Profile } from "@shared/schema";
import axios from 'axios';

if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET || !process.env.PAYPAL_PARTNER_MERCHANT_ID || !process.env.PAYPAL_SANDBOX_PARTNER_MERCHANT_ID) {
  throw new Error("Missing PayPal environment variables");
}

const PRODUCTION_URL = 'https://api-m.paypal.com';
const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';

// Use sandbox URL if we're in development, otherwise use production URL
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || process.env.REPL_SLUG !== undefined;
const BASE_URL = IS_PRODUCTION ? PRODUCTION_URL : SANDBOX_URL;
const PARTNER_MERCHANT_ID = IS_PRODUCTION ? process.env.PAYPAL_PARTNER_MERCHANT_ID : process.env.PAYPAL_SANDBOX_PARTNER_MERCHANT_ID;

console.log(`[PAYPAL] Using base URL: ${BASE_URL}`);

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
                features: ["PAYMENT", "REFUND", "PARTNER_FEE"]
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

  static async getAccountStatus(merchantId: string): Promise<"not_started" | "pending" | "verified" | "rejected"> {
    try {
      if (!merchantId) {
        return "not_started";
      }

      const accessToken = await this.getAccessToken();

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
        merchantId,
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

  static async refreshOnboardingLink(merchantId: string): Promise<string> {
    try {
      const accessToken = await this.getAccessToken();

      // Create a new referral link for the existing merchant
      const referralRequest = {
        tracking_id: `seller_refresh_${merchantId}`,
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

      const actionUrl = response.data.links.find((link: any) => link.rel === "action_url")?.href;

      if (!actionUrl) {
        throw new Error("Failed to generate PayPal onboarding URL");
      }

      return actionUrl;
    } catch (error) {
      console.error("[PAYPAL] Error refreshing onboarding link:", error);
      throw error;
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

  static async createPayout(paymentId: number, sellerId: number, amount: number): Promise<void> {
    try {
      const profile = await storage.getProfile(sellerId);
      if (!profile?.paypalMerchantId) {
        throw new Error("Seller has no PayPal account");
      }

      const accessToken = await this.getAccessToken();

      // Create a payout to the seller
      const payoutRequest = {
        sender_batch_header: {
          sender_batch_id: `payment_${paymentId}`,
          email_subject: "You have a payment from your auction sale"
        },
        items: [{
          recipient_type: "PAYPAL_ID",
          amount: {
            value: (amount / 100).toFixed(2),
            currency: "USD"
          },
          receiver: profile.paypalMerchantId,
          note: `Payment for auction sale #${paymentId}`,
          sender_item_id: `payment_${paymentId}`
        }]
      };

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

      await storage.createSellerPayout({
        sellerId,
        paymentId,
        amount,
        paypalPayoutId: response.data.batch_header.payout_batch_id,
        status: 'pending'
      });
    } catch (error) {
      console.error("[PAYPAL] Error creating payout:", error);
      throw error;
    }
  }
}