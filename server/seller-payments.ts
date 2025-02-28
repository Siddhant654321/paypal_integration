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
  static async createSellerAccount(profile: Profile): Promise<string> {
    try {
      console.log("Creating Stripe Connect account for seller:", profile.userId);
      console.log("Profile data:", {
        email: profile.email,
        businessName: profile.businessName,
        fullName: profile.fullName
      });

      // Create Stripe Connect account with minimal required fields
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: profile.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      console.log("Stripe Connect account created:", account.id);

      // Update profile with Stripe account ID
      await storage.updateProfileStripeAccount(profile.userId, account.id, "pending");

      return account.id;
    } catch (error) {
      console.error("Error creating seller account:", error);
      if (error instanceof Stripe.errors.StripeError) {
        console.error("Stripe error details:", {
          type: error.type,
          code: error.code,
          message: error.message
        });
      }
      throw error;
    }
  }

  static async getOnboardingLink(accountId: string, baseUrl: string): Promise<string> {
    try {
      console.log("Creating onboarding link for account:", accountId, "baseUrl:", baseUrl);

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl}/seller/onboarding/refresh`,
        return_url: `${baseUrl}/seller/onboarding/complete`,
        type: 'account_onboarding',
        collect: 'eventually_due',
      });

      console.log("Onboarding link created:", accountLink.url);
      return accountLink.url;
    } catch (error) {
      console.error("Error creating onboarding link:", error);
      if (error instanceof Stripe.errors.StripeError) {
        console.error("Stripe error details:", {
          type: error.type,
          code: error.code,
          message: error.message
        });
      }
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
        status: 'pending',
        stripeTransferId: transfer.id,
      });
    } catch (error) {
      console.error("Error creating payout:", error);
      throw error;
    }
  }

  static async getAccountStatus(accountId: string): Promise<"pending" | "verified" | "rejected"> {
    try {
      console.log("Checking account status for:", accountId);

      const account = await stripe.accounts.retrieve(accountId);
      console.log("Account status:", {
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        requirements: account.requirements
      });

      if (account.charges_enabled && account.payouts_enabled) {
        return "verified";
      } else if (account.requirements?.disabled_reason) {
        return "rejected";
      }

      return "pending";
    } catch (error) {
      console.error("Error checking account status:", error);
      if (error instanceof Stripe.errors.StripeError) {
        console.error("Stripe error details:", {
          type: error.type,
          code: error.code,
          message: error.message
        });
      }
      throw error;
    }
  }
}