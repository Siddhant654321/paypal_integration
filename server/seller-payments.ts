
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
  static async createSellerAccount(profile: Profile): Promise<{ accountId: string; url: string }> {
    try {
      console.log("Creating seller account for:", profile.email);
      console.log("Stripe API Version:", stripe.getApiField('version'));
      
      // Check if STRIPE_SECRET_KEY is set (but don't log the actual key)
      console.log("STRIPE_SECRET_KEY is set:", !!process.env.STRIPE_SECRET_KEY);

      // Clean up any existing account first
      if (profile.stripeAccountId) {
        try {
          console.log("Deleting existing Stripe account:", profile.stripeAccountId);
          await stripe.accounts.del(profile.stripeAccountId);
          console.log("Successfully deleted existing account");
        } catch (error) {
          console.log("Could not delete existing account, might already be deleted:", error);
          console.log("Error details:", error instanceof Error ? error.message : String(error));
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

      // Create an account link for onboarding
      console.log("Creating account link for onboarding");
      console.log("BASE_URL:", process.env.BASE_URL || 'http://localhost:5000');
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.BASE_URL || 'http://localhost:5000'}/seller-dashboard?refresh=true`,
        return_url: `${process.env.BASE_URL || 'http://localhost:5000'}/seller-dashboard?success=true`,
        type: 'account_onboarding',
      });
      console.log("Account link created:", accountLink.url ? "Success" : "Failed");

      // Update profile with Stripe account ID and initial status
      await storage.updateSellerStripeAccount(profile.userId, {
        accountId: account.id,
        status: "not_started"
      });
      console.log("Profile updated with Stripe account ID");

      return {
        accountId: account.id,
        url: accountLink.url,
      };
    } catch (error) {
      console.error("Error creating seller account:", error);
      if (error instanceof Error) {
        console.error("Stack trace:", error.stack);
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

      if (account.charges_enabled && account.payouts_enabled) {
        return "verified";
      } else if (account.details_submitted) {
        return "pending";
      } else if (account.requirements?.disabled_reason) {
        return "rejected";
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
