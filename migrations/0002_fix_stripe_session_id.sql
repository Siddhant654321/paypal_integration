
-- Rename stripe_session_id column to stripeSessionId if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'payments' AND column_name = 'stripe_session_id') THEN
        ALTER TABLE "payments" RENAME COLUMN "stripe_session_id" TO "stripeSessionId";
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name = 'payments' AND column_name = 'stripeSessionId') THEN
        ALTER TABLE "payments" ADD COLUMN "stripeSessionId" varchar;
    END IF;
END $$;
