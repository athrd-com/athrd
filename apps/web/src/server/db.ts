import { sql } from "bun";
import { Pool } from "pg";
import { env } from "~/env";

// Bun SQL client for direct queries
const globalForDb = globalThis as unknown as {
  sql: typeof sql | undefined;
  pool: Pool | undefined;
};

// Use Bun's built-in SQL for PostgreSQL queries
// It auto-detects PostgreSQL from DATABASE_URL environment variable
export const db = globalForDb.sql ?? sql;

// pg Pool for better-auth compatibility (better-auth requires pg.Pool)
export const pool =
  globalForDb.pool ?? new Pool({ connectionString: env.DATABASE_URL });

if (env.NODE_ENV !== "production") {
  globalForDb.sql = db;
  globalForDb.pool = pool;
}
