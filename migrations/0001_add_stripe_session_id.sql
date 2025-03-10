
-- Add the missing stripe_session_id column to the payments table
ALTER TABLE "payments" ADD COLUMN "stripe_session_id" varchar;
