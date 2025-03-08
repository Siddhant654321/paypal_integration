import Stripe from "stripe";
import { storage } from "./storage";
import { Profile } from "@shared/schema";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
});

const BASE_URL = process.env.REPL_SLUG 
  ? `https://${process.env.REPL_SLUG}.replit.dev`
  : 'http://localhost:5000';

console.log(`[STRIPE CONNECT] Using base URL: ${BASE_URL}`);

export class SellerPaymentService {
  static async createSellerAccount(profile: Profile): Promise<{ accountId: string; url: string }> {
    try {
      console.log("[STRIPE CONNECT] Creating seller account for:", profile.email);

      // Create a new Connect Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: profile.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          product_description: "Poultry and hatching eggs auction sales",
          mcc: "0742", // Veterinary Services, which includes animal breeding
        },
      });

      console.log("[STRIPE CONNECT] Account created:", account.id);

      // Create onboarding link
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${BASE_URL}/seller/dashboard?refresh=true`,
        return_url: `${BASE_URL}/seller/dashboard?success=true`,
        type: 'account_onboarding',
        collect: 'eventually_due',
      });

      if (!accountLink.url) {
        throw new Error("Failed to generate Stripe Connect onboarding URL");
      }

      // Update profile with account info
      await storage.updateSellerStripeAccount(profile.userId, {
        accountId: account.id,
        status: "pending"
      });

      return {
        accountId: account.id,
        url: accountLink.url,
      };
    } catch (error) {
      console.error("[STRIPE CONNECT] Error creating seller account:", error);
      if (error instanceof Stripe.errors.StripeError) {
        throw new Error(`Stripe error: ${error.message}`);
      }
      throw error;
    }
  }

  static async getAccountStatus(accountId: string): Promise<"not_started" | "pending" | "verified" | "rejected"> {
    try {
      if (!accountId) {
        return "not_started";
      }

      const account = await stripe.accounts.retrieve(accountId);

      console.log("[STRIPE CONNECT] Account status check:", {
        accountId,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        requirements: account.requirements?.currently_due,
      });

      if (account.charges_enabled && account.payouts_enabled) {
        return "verified";
      }

      if (account.details_submitted) {
        return "pending";
      }

      if (account.requirements?.disabled_reason) {
        return "rejected";
      }

      return "pending";
    } catch (error) {
      console.error("[STRIPE CONNECT] Error checking account status:", error);
      if (error instanceof Stripe.errors.StripeError && 
          error.type === 'StripePermissionError') {
        return "rejected";
      }
      return "not_started";
    }
  }

  static async refreshOnboardingLink(accountId: string): Promise<string> {
    try {
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${BASE_URL}/seller/dashboard?refresh=true`,
        return_url: `${BASE_URL}/seller/dashboard?success=true`,
        type: 'account_onboarding',
        collect: 'eventually_due',
      });

      if (!accountLink.url) {
        throw new Error("Failed to generate Stripe Connect onboarding URL");
      }

      return accountLink.url;
    } catch (error) {
      console.error("[STRIPE CONNECT] Error refreshing onboarding link:", error);
      if (error instanceof Stripe.errors.StripeError) {
        throw new Error(`Stripe error: ${error.message}`);
      }
      throw error;
    }
  }

  static async getBalance(accountId: string) {
    try {
      return await stripe.balance.retrieve({
        stripeAccount: accountId,
      });
    } catch (error) {
      console.error("[STRIPE CONNECT] Error getting balance:", error);
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

      // Create transfer to connected account
      const transfer = await stripe.transfers.create({
        amount,
        currency: 'usd',
        destination: profile.stripeAccountId,
        transfer_group: `payment_${paymentId}`,
      });

      // Record payout in database
      await storage.createSellerPayout({
        sellerId,
        paymentId,
        amount,
        stripeTransferId: transfer.id,
        status: 'pending'
      });
    } catch (error) {
      console.error("[STRIPE CONNECT] Error creating payout:", error);
      throw error;
    }
  }
}