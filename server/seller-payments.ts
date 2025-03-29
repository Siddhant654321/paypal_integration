import { type Profile, type PaymentStatus } from "@shared/schema";
import { storage } from "./storage";
import axios from "axios";
import { randomPaypalID } from "./utils/randomPaypalID";

// PayPal API Configuration
const PRODUCTION_URL = "https://api-m.paypal.com";
const SANDBOX_URL = "https://api-m.sandbox.paypal.com";

// Force sandbox mode if Client ID starts with 'sb-'
const IS_SANDBOX =
  process.env.PAYPAL_CLIENT_ID?.startsWith("sb-") ||
  process.env.PAYPAL_ENV === "sandbox" ||
  process.env.VITE_PAYPAL_ENV === "sandbox";

const BASE_URL = IS_SANDBOX ? SANDBOX_URL : PRODUCTION_URL;

console.log("[PAYPAL] Seller payments service:", {
  mode: IS_SANDBOX ? "sandbox" : "production",
  baseUrl: BASE_URL,
  clientIdPrefix: process.env.PAYPAL_CLIENT_ID?.substring(0, 8) + "...",
  isSandboxClientId: process.env.PAYPAL_CLIENT_ID?.startsWith("sb-"),
});

export class SellerPaymentService {
  private static async getAccessToken(): Promise<string> {
    try {
      console.log("[PAYPAL] Requesting access token...");

      if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
        throw new Error("PayPal API credentials are not configured");
      }

      const auth = Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
      ).toString("base64");
      const response = await axios.post(
        `${BASE_URL}/v1/oauth2/token`,
        "grant_type=client_credentials",
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      console.log("[PAYPAL] Successfully obtained access token");
      return response.data.access_token;
    } catch (error) {
      console.error("[PAYPAL] Error getting access token:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("[PAYPAL] Auth Error Details:", {
          status: error.response.status,
          data: error.response.data,
        });
      }
      throw new Error("Failed to authenticate with PayPal");
    }
  }

  static async createSellerAccount(
    profile: Profile,
  ): Promise<{ merchantId: string; url: string }> {
    try {
      console.log("[PAYPAL] Creating seller account for:", profile.email);

      // Use sandbox account for testing
      if (IS_SANDBOX) {
        console.log("[PAYPAL] Using sandbox environment");
        const testMerchantId = randomPaypalID();

        await storage.updateProfile(profile.userId, {
          paypalMerchantId: testMerchantId,
          paypalStatus: "verified",
        });

        return {
          merchantId: testMerchantId,
          url: `${process.env.APP_URL || "http://localhost:5001"}/seller/dashboard?success=true&sandbox=true`,
        };
      }

      // Production flow
      const accessToken = await this.getAccessToken();

      const partnerReferralRequest = {
        tracking_id: `SELLER_${profile.userId}_${Date.now()}`,
        operations: [
          {
            operation: "API_INTEGRATION",
            api_integration_preference: {
              rest_api_integration: {
                integration_method: "PAYPAL",
                integration_type: "THIRD_PARTY",
                third_party_details: {
                  features: ["PAYMENT", "REFUND", "DELAYED_DISBURSEMENT"],
                },
              },
            },
          },
        ],
        products: ["EXPRESS_CHECKOUT"],
        legal_consents: [
          {
            type: "SHARE_DATA_CONSENT",
            granted: true,
          },
        ],
        partner_config_override: {
          return_url: `${process.env.APP_URL || "http://localhost:5001"}/seller/dashboard?success=true`,
        },
      };

      const response = await axios.post(
        `${BASE_URL}/v2/customer/partner-referrals`,
        partnerReferralRequest,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "PayPal-Request-Id": partnerReferralRequest.tracking_id,
          },
        },
      );

      const actionUrl = response.data.links.find(
        (link: any) => link.rel === "action_url",
      )?.href;
      const merchantId = response.data.merchant_id;

      if (!actionUrl || !merchantId) {
        throw new Error("Failed to generate PayPal onboarding URL");
      }

      // Update profile
      await storage.updateProfile(profile.userId, {
        paypalMerchantId: merchantId,
        paypalStatus: "pending",
      });

      return {
        merchantId,
        url: actionUrl,
      };
    } catch (error) {
      console.error("[PAYPAL] Error creating seller account:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("[PAYPAL] API Error Details:", {
          status: error.response.status,
          data: error.response.data,
        });
      }
      throw new Error("Failed to create PayPal seller account");
    }
  }

  static async createPayout(
    paymentId: number,
    sellerId: number,
    amount: number,
    receiverEmail: string,
  ) {
    try {
      console.log(
        `[PAYPAL] Creating payout for payment ${paymentId} to seller ${sellerId}`,
      );

      if (amount <= 0) {
        throw new Error("Payout amount must be greater than 0");
      }

      // Use simulated payout for sandbox/testing
      if (IS_SANDBOX) {
        console.log("[PAYPAL] Using simulated payout for sandbox");

        const simulatedId = `SIM_${paymentId}_${Date.now()}`;

        await storage.createSellerPayout(sellerId, {
          paymentId,
          amount,
          status: "completed",
          payoutId: simulatedId,
          completedAt: new Date(),
        });

        return {
          batch_header: {
            payout_batch_id: simulatedId,
            batch_status: "COMPLETED",
          },
          simulated: true,
        };
      }

      const accessToken = await this.getAccessToken();
      const amountInDollars = (amount / 100).toFixed(2);

      const payoutRequest = {
        sender_batch_header: {
          sender_batch_id: `PAYOUT_${paymentId}_${Date.now()}`,
          email_subject: "Your auction payment has been processed",
          email_message: "The funds from your auction sale are now available.",
        },
        items: [
          {
            recipient_type: "PAYPAL_ID",
            amount: {
              value: amountInDollars,
              currency: "USD",
            },
            receiver: receiverEmail,
            note: "Payment for auction sale",
            sender_item_id: `ITEM_${paymentId}_${Date.now()}`,
          },
        ],
      };

      const response = await axios.post(
        `${BASE_URL}/v1/payments/payouts`,
        payoutRequest,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "PayPal-Request-Id":
              payoutRequest.sender_batch_header.sender_batch_id,
          },
        },
      );

      // Record payout
      await storage.createSellerPayout(sellerId, {
        paymentId,
        amount,
        status: "pending",
        payoutId: response.data.batch_header.payout_batch_id,
      });

      return response.data;
    } catch (error) {
      console.error("[PAYPAL] Error creating payout:", error);
      if (axios.isAxiosError(error) && error.response) {
        console.error("[PAYPAL] API Error Details:", {
          status: error.response.status,
          data: error.response.data,
        });
      }
      throw new Error("Failed to process seller payout");
    }
  }

  static async getAccountStatus(
    merchantId: string,
  ): Promise<"not_started" | "pending" | "verified" | "rejected"> {
    if (!merchantId) return "not_started";
    if (IS_SANDBOX) return "verified";

    try {
      const accessToken = await this.getAccessToken();
      const response = await axios.get(
        `${BASE_URL}/v1/customer/partners/${process.env.PAYPAL_PARTNER_MERCHANT_ID}/merchant-integrations/${merchantId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      switch (response.data.merchant_integration_status) {
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
  }
  // Helper function to map PayPal status to our schema status
  private static mapPayPalStatus(paypalStatus: string): PaymentStatus {
    switch (paypalStatus) {
      case "SUCCESS":
        return "completed";
      case "PENDING":
        return "pending";
      case "FAILED":
      case "DENIED":
        return "failed";
      default:
        return "pending";
    }
  }

  static async getBalance(merchantId: string) {
    try {
      const accessToken = await this.getAccessToken();

      const response = await axios.get(`${BASE_URL}/v1/reporting/balances`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "PayPal-Auth-Assertion": merchantId,
        },
      });

      return {
        available: [
          {
            amount: response.data.available_balance.total,
            currency: response.data.available_balance.currency,
          },
        ],
        pending: [
          {
            amount: response.data.pending_balance.total,
            currency: response.data.pending_balance.currency,
          },
        ],
      };
    } catch (error) {
      console.error("[PAYPAL] Error getting balance:", error);
      throw error;
    }
  }
}
