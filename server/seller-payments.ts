import Stripe from "stripe";
import { storage } from "./storage";
import { Profile } from "@shared/schema";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia"
});

export class SellerPaymentService {
  static async createSellerAccount(profile: Profile): Promise<{ accountId: string; url: string }> {
    try {
      console.log("Creating seller account for:", profile.email);

      // Clean up any existing account first
      if (profile.stripeAccountId) {
        try {
          console.log("Deleting existing Stripe account:", profile.stripeAccountId);
          await stripe.accounts.del(profile.stripeAccountId);
          console.log("Successfully deleted existing account");
        } catch (error) {
          console.warn("Could not delete existing account:", error);
        }
      }

      // Create a new Connect Express account
      console.log("Creating new Stripe Connect account");
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: profile.email,
        business_type: 'individual',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          product_description: "Poultry and hatching eggs auction sales",
          mcc: "0742", // Veterinary Services, which includes animal breeding
        },
      });
      console.log("Stripe account created with ID:", account.id);

      // Get the base URL - handle both development and Replit environments
      let baseUrl: string;

      // First try REPLIT_DOMAIN which is automatically set by Replit
      if (process.env.REPLIT_DOMAIN) {
        baseUrl = `https://${process.env.REPLIT_DOMAIN}`;
        console.log("Using Replit domain:", baseUrl);
      }
      // Then try constructing from REPL_SLUG if available
      else if (process.env.REPL_SLUG) {
        baseUrl = `https://${process.env.REPL_SLUG}.repl.co`;
        console.log("Using constructed Replit URL:", baseUrl);
      }
      // Finally fallback to localhost for development
      else {
        baseUrl = 'http://localhost:5000';
        console.log("Using development URL:", baseUrl);
      }

      console.log("Final base URL for Stripe redirects:", baseUrl);

      // Create an account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${baseUrl}/seller-dashboard?refresh=true`,
        return_url: `${baseUrl}/seller-dashboard?success=true`,
        type: 'account_onboarding',
        collect: 'eventually_due',
      });

      if (!accountLink.url) {
        throw new Error("Failed to generate Stripe Connect URL");
      }

      console.log("Generated Stripe Connect URL:", accountLink.url.substring(0, 50) + "...");

      // Update profile with Stripe account ID and initial status
      await storage.updateSellerStripeAccount(profile.userId, {
        accountId: account.id,
        status: "pending"
      });
      console.log("Profile updated with Stripe account ID");

      return {
        accountId: account.id,
        url: accountLink.url,
      };
    } catch (error) {
      console.error("Error creating seller account:", error);
      throw error;
    }
  }

  static async getAccountStatus(accountId: string): Promise<"not_started" | "pending" | "verified" | "rejected"> {
    try {
      if (!accountId) {
        return "not_started";
      }

      const account = await stripe.accounts.retrieve(accountId);
      console.log("Retrieved account status:", {
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        requirements: account.requirements
      });

      if (account.charges_enabled && account.payouts_enabled) {
        // Update the local status if verified
        const profile = await storage.findProfileByStripeAccountId(accountId);
        if (profile) {
          await storage.updateSellerStripeAccount(profile.userId, {
            accountId: accountId,
            status: "verified"
          });
        }
        return "verified";
      } else if (account.details_submitted) {
        return "pending";
      } else if (account.requirements?.disabled_reason) {
        return "rejected";
      }

      return "pending";
    } catch (error) {
      console.error("Error checking account status:", error);
      if (error instanceof Stripe.errors.PermissionError) {
        return "rejected";
      }
      return "not_started";
    }
  }

  static async getBalance(accountId: string) {
    try {
      return await stripe.balance.retrieve({
        stripeAccount: accountId,
      });
    } catch (error) {
      console.error("Error getting balance:", error);
      throw error;
    }
  }

  static async getPayoutSchedule(accountId: string) {
    try {
      const account = await stripe.accounts.retrieve(accountId);
      return {
        interval: account.settings?.payouts?.schedule?.interval || 'daily',
        delay_days: account.settings?.payouts?.schedule?.delay_days || 2,
      };
    } catch (error) {
      console.error("Error getting payout schedule:", error);
      throw error;
    }
  }

  static async createPayout(paymentId: number, sellerId: number, amount: number): Promise<void> {
    try {
      const profile = await storage.getProfile(sellerId);
      if (!profile?.stripeAccountId) {
        throw new Error("Seller has no Stripe account");
      }

      const transfer = await stripe.transfers.create({
        amount,
        currency: 'usd',
        destination: profile.stripeAccountId,
        transfer_group: `payment_${paymentId}`,
      });

      await storage.createSellerPayout({
        sellerId,
        paymentId,
        amount,
        stripeTransferId: transfer.id,
        status: 'pending'
      });
    } catch (error) {
      console.error("Error creating payout:", error);
      throw error;
    }
  }
}