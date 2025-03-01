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
  static async createSellerAccount(profile: Profile): Promise<string> {
    try {
      console.log("Creating Stripe Connect account for seller:", profile.userId);

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
          name: profile.businessName || profile.fullName,
          url: process.env.APP_URL ? `${process.env.APP_URL}/seller/${profile.userId}` : undefined,
        },
      });

      console.log("Stripe Connect account created:", account.id);

      // Update profile with Stripe account ID
      await storage.updateProfileStripeAccount(profile.userId, account.id, "pending");

      return account.id;
    } catch (error) {
      console.error("Error creating seller account:", error);
      throw error;
    }
  }

  static async getOnboardingLink(accountId: string, baseUrl: string): Promise<string> {
    try {
      console.log("Creating onboarding link for account:", accountId);

      // Create an account link with type=account_onboarding
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl}/seller/dashboard?refresh_onboarding=true`,
        return_url: `${baseUrl}/seller/dashboard?onboarding_complete=true`,
        type: 'account_onboarding',
      });

      if (!accountLink.url) {
        throw new Error('Stripe did not return a valid onboarding URL');
      }

      return accountLink.url;
    } catch (error) {
      console.error("Error creating onboarding link:", error);
      throw error;
    }
  }

  static async getAccountStatus(accountId: string): Promise<"not_started" | "pending" | "verified" | "rejected"> {
    try {
      console.log("Checking account status for:", accountId);

      const account = await stripe.accounts.retrieve(accountId);

      if (account.charges_enabled && account.payouts_enabled) {
        return "verified";
      } else if (account.requirements?.disabled_reason) {
        return "rejected";
      }

      return "pending";
    } catch (error) {
      console.error("Error checking account status:", error);
      throw error;
    }
  }

  static async getPayoutSchedule(accountId: string) {
    try {
      const account = await stripe.accounts.retrieve(accountId);
      return account.settings?.payouts;
    } catch (error) {
      console.error("Error getting payout schedule:", error);
      throw error;
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
      console.log("Creating payout for seller:", sellerId, "amount:", amount);

      // Get seller's Stripe account ID
      const profile = await storage.getProfile(sellerId);
      if (!profile?.stripeAccountId) {
        throw new Error("Seller has no Stripe account");
      }

      // Create transfer to seller's connected account
      const transfer = await stripe.transfers.create({
        amount,
        currency: 'usd',
        destination: profile.stripeAccountId,
        transfer_group: `payment_${paymentId}`,
      });

      console.log("Transfer created:", transfer.id);

      // Create payout record
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