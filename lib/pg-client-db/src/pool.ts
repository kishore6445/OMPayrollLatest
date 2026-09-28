/**
 * pool.ts — pg.Pool for the payrollom_client database.
 *
 * Connection strategy (in priority order):
 *   1. CLIENT_DATABASE_URL — full connection string (for external/cloud PG)
 *   2. Construct from PGHOST + PGPORT + PGUSER + PGPASSWORD + CLIENT_PGDATABASE
 *      (uses Replit's runtime-managed PG credentials, different database name)
 *
 * The plain-text password is NEVER written to any file.
 * It is read only from environment variables at process start.
 */

import pg from "pg";

function buildConnectionString(): string {
  const explicit = process.env.CLIENT_DATABASE_URL;
  if (explicit) return explicit;

  const host = process.env.PGHOST;
  const port = process.env.PGPORT ?? "5432";
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const dbName = process.env.CLIENT_PGDATABASE ?? "payrollom_client";

  if (!host || !user || !password) {
    throw new Error(
      "Client DB not configured. Set CLIENT_DATABASE_URL or " +
        "PGHOST + PGUSER + PGPASSWORD + CLIENT_PGDATABASE."
    );
  }

  // URL-encode components in case of special characters
  const encodedPwd = encodeURIComponent(password);
  const encodedUser = encodeURIComponent(user);
  return `postgresql://${encodedUser}:${encodedPwd}@${host}:${port}/${dbName}`;
}

export const pool = new pg.Pool({
  connectionString: buildConnectionString(),
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("[pg-client-db] Unexpected pool error", err);
});

/**
 * Verify the payrollom_client database is reachable.
 * Relies on the pool's built-in connectionTimeoutMillis (5 s) so no
 * manual race is needed — a timed-out connect never leaks a checked-out
 * client back into the pool.
 * Resolves on success, rejects with an Error on failure.
 */
export async function checkClientDb(): Promise<void> {
  await pool.query("SELECT 1");
}
