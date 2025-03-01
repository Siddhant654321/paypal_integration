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
      // Clean up any existing account first
      if (profile.stripeAccountId) {
        try {
          await stripe.accounts.del(profile.stripeAccountId);
        } catch (error) {
          console.log("Could not delete existing account, might already be deleted:", error);
        }
      }

      // Create a new Connect Express account
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

      // Create an account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.BASE_URL || 'http://localhost:5000'}/seller-dashboard?refresh=true`,
        return_url: `${process.env.BASE_URL || 'http://localhost:5000'}/seller-dashboard?success=true`,
        type: 'account_onboarding',
      });

      // Update profile with Stripe account ID and initial status
      await storage.updateProfileStripeAccount(profile.userId, account.id, "not_started");

      return {
        accountId: account.id,
        url: accountLink.url,
      };
    } catch (error) {
      console.error("Error creating seller account:", error);
      throw error;
    }
  }

  static async getAccountStatus(accountId: string): Promise<"not_started" | "pending" | "verified"> {
    try {
      if (!accountId) {
        return "not_started";
      }

      const account = await stripe.accounts.retrieve(accountId);

      if (account.charges_enabled && account.payouts_enabled) {
        return "verified";
      } else if (account.details_submitted) {
        return "pending";
      }

      return "not_started";
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