import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import path from 'path';
import { sql } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

// Export the runMigrations function
export async function runMigrations() {
  try {
    console.log('Running migrations...');
    // Since we're not using postgres-js migrate, we'll just run the fallback
    await runFallbackMigration();
  } catch (e) {
    console.error('Error running migrations:', e);
    console.log('Migration error:', e);
  }
}

// Fallback migration to ensure columns exist
export async function runFallbackMigration() {
  try {
    console.log('Running fallback migration to add missing columns...');
    // Check if the columns exist and add them if not
    await db.execute(sql`
      DO $$ 
      BEGIN 
        BEGIN
          ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "stripe_session_id" varchar;
        EXCEPTION WHEN duplicate_column THEN 
          -- Column already exists, do nothing
        END;

        BEGIN
          ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "stripe_charge_id" varchar;
        EXCEPTION WHEN duplicate_column THEN 
          -- Column already exists, do nothing
        END;

        BEGIN
          ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "stripe_transfer_id" varchar;
        EXCEPTION WHEN duplicate_column THEN 
          -- Column already exists, do nothing
        END;
      END $$;
    `);
    console.log('Fallback migration completed successfully');
  } catch (e) {
    console.error('Error in fallback migration:', e);
    throw e;
  }
}

// Run migrations at startup
runMigrations().catch(err => console.error('Failed to run initial migrations:', err));