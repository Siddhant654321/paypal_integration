import Stripe from "stripe";
import { storage } from "./storage";
import { Profile } from "@shared/schema";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
});

export class SellerPaymentService {
  static async createSellerAccount(profile: Profile): Promise<{ accountId: string; clientSecret: string }> {
    try {
      // Create a Connect Express account
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
        settings: {
          payouts: {
            schedule: {
              interval: 'manual'
            }
          }
        }
      });

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.BASE_URL || 'http://localhost:5000'}/seller-dashboard?refresh=true`,
        return_url: `${process.env.BASE_URL || 'http://localhost:5000'}/seller-dashboard?success=true`,
        type: 'account_onboarding',
      });

      // Update profile with Stripe account ID
      await storage.updateProfileStripeAccount(profile.userId, account.id, "pending");

      return {
        accountId: account.id,
        url: accountLink.url,
        clientSecret: null, // Adding this for API compatibility
      };
    } catch (error) {
      console.error("Error creating seller account:", error);
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

  static async getOnboardingLink(accountId: string, baseUrl: string): Promise<string> {
    try {
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl}/seller-dashboard?refresh=true`,
        return_url: `${baseUrl}/seller-dashboard?success=true`,
        type: 'account_onboarding',
      });

      return accountLink.url;
    } catch (error) {
      console.error("Error creating onboarding link:", error);
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
      });
    } catch (error) {
      console.error("Error creating payout:", error);
      throw error;
    }
  }
}