-- Drop old Stripe-related columns
ALTER TABLE "payments" DROP COLUMN IF EXISTS "stripe_session_id";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "stripe_payment_intent_id";
ALTER TABLE "seller_payouts" DROP COLUMN IF EXISTS "stripe_transfer_id";
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "stripe_account_id";
ALTER TABLE "profiles" DROP COLUMN IF EXISTS "stripe_account_status";

-- Add PayPal-specific columns
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paypal_order_id" varchar(256);
ALTER TABLE "seller_payouts" ADD COLUMN IF NOT EXISTS "paypal_payout_id" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "paypal_merchant_id" text;
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "paypal_account_status" text;
