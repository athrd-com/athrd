import { Pool } from "pg";
import { env } from "~/env";

// pg Pool for database queries
const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

// pg Pool for better-auth compatibility (better-auth requires pg.Pool)
export const pool =
  globalForDb.pool ?? new Pool({ connectionString: env.DATABASE_URL });

// Export pool as db for convenience
export const db = pool;

if (env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}
