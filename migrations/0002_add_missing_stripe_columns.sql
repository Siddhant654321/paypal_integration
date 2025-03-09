
-- Add missing Stripe-related columns to the payments table
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "stripe_session_id" varchar;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "stripe_charge_id" varchar;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "stripe_transfer_id" varchar;
