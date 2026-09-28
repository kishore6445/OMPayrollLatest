/**
 * startup-check.ts
 *
 * Run BEFORE the HTTP server starts listening.
 * Verifies the payrollom_client database is reachable, is the correct
 * database, and contains the required tables with at least the expected
 * minimum number of columns.
 *
 * Exits with a clear error message and code 1 on any failure.
 * Does NOT expose connection strings, credentials, or internal paths.
 */

import { pool } from "@workspace/pg-client-db";
import { logger } from "./logger.js";

interface TableSpec {
  name: string;
  minColumns: number;
}

const REQUIRED_TABLES: TableSpec[] = [
  { name: "COMPANYMAST",      minColumns: 60 },
  { name: "CLIENTMASTER",     minColumns: 5  },
  { name: "UNITMASTER",       minColumns: 50 },
  { name: "EMPMAST",          minColumns: 200 },
  { name: "app_users",        minColumns: 10 },
  { name: "app_roles",        minColumns: 2  },
  { name: "app_permissions",  minColumns: 4  },
];

export interface SchemaReport {
  clientDb: "ok" | "error";
  schema: "ok" | "degraded" | "error";
  dbName: string | null;
  tables: Record<string, number>;
  errors: string[];
}

/** Returns a schema report without throwing. Used by /api/healthz. */
export async function checkSchema(): Promise<SchemaReport> {
  const report: SchemaReport = {
    clientDb: "error",
    schema: "ok",
    dbName: null,
    tables: {},
    errors: [],
  };

  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    report.errors.push("Cannot connect to client database");
    return report;
  }

  try {
    // Verify we are in the right database
    const dbRow = await client.query<{ current_database: string }>("SELECT current_database()");
    report.dbName = dbRow.rows[0]?.current_database ?? null;
    report.clientDb = "ok";

    if (report.dbName !== "payrollom_client") {
      report.schema = "error";
      report.errors.push(`Wrong database: expected payrollom_client, got ${report.dbName}`);
    }

    // Check each required table for existence and column count
    const colCountResult = await client.query<{ table_name: string; col_count: string }>(
      `SELECT table_name, COUNT(*) AS col_count
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY($1)
       GROUP BY table_name`,
      [REQUIRED_TABLES.map((t) => t.name)]
    );

    const colCounts: Record<string, number> = {};
    for (const row of colCountResult.rows) {
      colCounts[row.table_name] = parseInt(row.col_count, 10);
    }

    for (const spec of REQUIRED_TABLES) {
      const count = colCounts[spec.name] ?? 0;
      report.tables[spec.name] = count;

      if (count === 0) {
        report.schema = "error";
        report.errors.push(`Required table "${spec.name}" is missing`);
      } else if (count < spec.minColumns) {
        report.schema = report.schema === "error" ? "error" : "degraded";
        report.errors.push(
          `Table "${spec.name}" has ${count} columns, expected at least ${spec.minColumns}`
        );
      }
    }
  } catch (err) {
    report.schema = "error";
    report.errors.push("Schema validation query failed");
    logger.error({ err }, "startup-check schema query error");
  } finally {
    client.release();
  }

  return report;
}

/**
 * Runs the full startup check.
 * Logs a clear error and calls process.exit(1) on failure.
 * Returns the schema report on success for use by /api/healthz.
 */
export async function runStartupCheck(): Promise<SchemaReport> {
  logger.info("Checking client database connectivity and schema…");

  const report = await checkSchema();

  if (report.clientDb !== "ok") {
    logger.fatal(
      { errors: report.errors },
      "STARTUP FAILURE: cannot connect to payrollom_client. " +
        "Set CLIENT_PGDATABASE and ensure the database is reachable."
    );
    process.exit(1);
  }

  if (report.dbName !== "payrollom_client") {
    logger.fatal(
      { dbName: report.dbName },
      "STARTUP FAILURE: wrong database connected. Expected payrollom_client."
    );
    process.exit(1);
  }

  if (report.schema === "error") {
    logger.fatal(
      { errors: report.errors, tables: report.tables },
      "STARTUP FAILURE: required tables or columns are missing from payrollom_client."
    );
    process.exit(1);
  }

  if (report.schema === "degraded") {
    logger.warn(
      { errors: report.errors, tables: report.tables },
      "Startup WARNING: some tables have fewer columns than expected. Continuing."
    );
  } else {
    logger.info({ tables: report.tables }, "Client database schema validated ✓");
  }

  return report;
}
