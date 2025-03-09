import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import fs from 'fs';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });

// Create the connection
const dbUrl = process.env.DATABASE_URL || 'postgresql://poultry:poultry@localhost:5432/poultry';
const connectionString = dbUrl;
const client = postgres(connectionString, { max: 1 });
//export const db = drizzle(client, { schema }); //Commented out as we are using neonConfig

// Run migrations
async function runMigrations() {
  try {
    const migrationsFolder = path.join(process.cwd(), 'migrations');
    console.log('Running migrations from:', migrationsFolder);
    await migrate(db, { migrationsFolder });
    // Add missing columns directly as fallback
    await runFallbackMigration();
  } catch (e) {
    console.error('Error running migrations:', e);
    // If migration fails, try fallback method
    try {
      await runFallbackMigration();
    } catch (fallbackError) {
      console.error('Fallback migration also failed:', fallbackError);
    }
  }
}

// Fallback migration to ensure columns exist
async function runFallbackMigration() {
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

runMigrations();