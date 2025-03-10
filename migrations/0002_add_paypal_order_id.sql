-- Add PayPal-specific columns to the payments table
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "paypal_order_id" varchar;

-- Drop Stripe-specific columns that are no longer needed
ALTER TABLE "payments" DROP COLUMN IF EXISTS "stripe_session_id";
ALTER TABLE "payments" DROP COLUMN IF EXISTS "stripe_charge_id";
