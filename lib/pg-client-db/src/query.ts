import { pool } from "./pool.js";

/**
 * Execute a query and return all rows typed as T[].
 * Always use $1, $2, ... placeholders — never interpolate user values.
 */
export async function queryRows<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

/**
 * Execute a query and return the first row, or null if no rows.
 */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await pool.query(sql, params);
  return (result.rows[0] ?? null) as T | null;
}

/**
 * Execute a query and return a single scalar value, or null.
 */
export async function queryScalar<T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const result = await pool.query(sql, params);
  if (!result.rows[0]) return null;
  const vals = Object.values(result.rows[0]);
  return (vals[0] ?? null) as T | null;
}

/**
 * Execute a write statement and return row count.
 */
export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<{ rowCount: number }> {
  const result = await pool.query(sql, params);
  return { rowCount: result.rowCount ?? 0 };
}

/**
 * Run a function inside a transaction. Rolls back on error.
 */
export async function withTransaction<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
