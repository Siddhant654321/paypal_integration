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
  static async createSellerAccount(profile: Profile): Promise<{ accountId: string; clientSecret: string }> {
    try {
      // Create Stripe Connect account
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

      // Create an account session for embedded components
      const session = await stripe.accountSessions.create({
        account: account.id,
        components: {
          account_onboarding: { enabled: true },
          payment_details: { enabled: true },
          payout_settings: { enabled: true },
        },
      });

      // Update profile with Stripe account ID
      await storage.updateProfileStripeAccount(profile.userId, account.id, "pending");

      return {
        accountId: account.id,
        clientSecret: session.client_secret,
      };
    } catch (error) {
      console.error("Error creating seller account:", error);
      throw error;
    }
  }

  static async refreshAccountSession(accountId: string): Promise<string> {
    try {
      const session = await stripe.accountSessions.create({
        account: accountId,
        components: {
          account_onboarding: { enabled: true },
          payment_details: { enabled: true },
          payout_settings: { enabled: true },
        },
      });

      return session.client_secret;
    } catch (error) {
      console.error("Error refreshing account session:", error);
      throw error;
    }
  }

  static async getAccountStatus(accountId: string): Promise<"not_started" | "pending" | "verified" | "rejected"> {
    try {
      if (!accountId || typeof accountId !== 'string' || accountId.trim() === '') {
        return "not_started";
      }

      const account = await stripe.accounts.retrieve(accountId);

      if (account.charges_enabled && account.payouts_enabled) {
        return "verified";
      } else if (account.requirements?.disabled_reason) {
        return "rejected";
      }

      return account.details_submitted ? "pending" : "not_started";
    } catch (error) {
      console.error("Error checking account status:", error);
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

  static async getPayouts(accountId: string, limit = 10) {
    try {
      return await stripe.payouts.list(
        { limit },
        { stripeAccount: accountId }
      );
    } catch (error) {
      console.error("Error getting payouts:", error);
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

      await storage.createPayout({
        sellerId,
        paymentId,
        amount,
        stripeTransferId: transfer.id,
        status: 'pending',
      });
    } catch (error) {
      console.error("Error creating payout:", error);
      throw error;
    }
  }
}