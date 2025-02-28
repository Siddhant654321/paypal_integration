import Stripe from "stripe";
import { storage } from "./storage";
import { Profile } from "@shared/schema";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  throw new Error("Stripe secret key must be a test mode key (starts with sk_test_)");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia"
});

export class SellerPaymentService {
  static async createSellerAccount(profile: Profile): Promise<string> {
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
          name: profile.businessName || profile.fullName,
          url: `${process.env.APP_URL}/seller/${profile.userId}`,
        },
      });

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
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl}/seller/onboarding/refresh`,
        return_url: `${baseUrl}/seller/onboarding/complete`,
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

      // Create payout record
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

  static async getAccountStatus(accountId: string): Promise<"pending" | "verified" | "rejected"> {
    try {
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
}