import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configure connection pool
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  maxConnections: 20,
  idleTimeout: 30000, // 30 seconds
  connectionTimeoutMillis: 5000, // 5 seconds
});

// Add event listeners for pool events
pool.on('error', (err) => {
  console.error('[DATABASE] Unexpected error on idle client:', err);
  process.exit(-1);
});

pool.on('connect', () => {
  console.log('[DATABASE] New client connected to pool');
});

// Create drizzle instance with configured pool
export const db = drizzle({ 
  client: pool, 
  schema,
  logger: true 
});

export { pool };