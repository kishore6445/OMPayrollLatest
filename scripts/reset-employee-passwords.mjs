/**
 * reset-employee-passwords.mjs
 *
 * Safely resets the temporary password for mapped Employee accounts in app_users.
 *
 * Scope:
 *   role = 'Employee' AND employee_code IS NOT NULL
 *
 * Safety:
 *   - DRY RUN by default: no database writes without --apply.
 *   - Expects 171 mapped Employee accounts by default and aborts on mismatch.
 *   - Leaves is_active unchanged (inactive users stay inactive).
 *   - Generates a unique random PBKDF2 salt/hash for every user.
 *   - Sets must_change_password = TRUE so each employee must choose a personal
 *     password after the next successful login.
 *   - Plain-text password is read from EMPLOYEE_TEMP_PASSWORD only and is never
 *     printed or stored in source/database.
 *
 * Required environment:
 *   CLIENT_DATABASE_URL
 *   EMPLOYEE_TEMP_PASSWORD   (for the current rollout set this secret to Demo@123)
 *
 * Usage:
 *   # Preview only (recommended first)
 *   EMPLOYEE_TEMP_PASSWORD='Demo@123' node scripts/reset-employee-passwords.mjs
 *
 *   # Apply only after preview confirms exactly 171 mapped Employee accounts
 *   EMPLOYEE_TEMP_PASSWORD='Demo@123' node scripts/reset-employee-passwords.mjs --apply
 *
 *   # Emergency override if the expected count intentionally changes later
 *   EMPLOYEE_TEMP_PASSWORD='...' node scripts/reset-employee-passwords.mjs --apply --allow-count-mismatch
 */

import pg from "pg";
import { pbkdf2, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);
const EXPECTED_EMPLOYEE_COUNT = 171;
const APPLY = process.argv.includes("--apply");
const ALLOW_COUNT_MISMATCH = process.argv.includes("--allow-count-mismatch");

async function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const key = await pbkdf2Async(plain, salt, 310_000, 64, "sha512");
  return `pbkdf2:sha512:310000:${salt}:${key.toString("hex")}`;
}

function fail(message) {
  console.error(`❌  ${message}`);
  process.exit(1);
}

async function main() {
  const clientDbUrl = process.env.CLIENT_DATABASE_URL;
  const tempPassword = process.env.EMPLOYEE_TEMP_PASSWORD;

  if (!clientDbUrl) fail("CLIENT_DATABASE_URL is not set.");
  if (!tempPassword) fail("EMPLOYEE_TEMP_PASSWORD is not set.");
  if (tempPassword.length < 8 || tempPassword.length > 128) {
    fail("EMPLOYEE_TEMP_PASSWORD must be between 8 and 128 characters to match current app validation.");
  }

  const pool = new pg.Pool({ connectionString: clientDbUrl, max: 3 });
  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, username, employee_code, compid, is_active, must_change_password
         FROM app_users
        WHERE role = 'Employee'
          AND employee_code IS NOT NULL
        ORDER BY id`
    );

    const rows = result.rows;
    const active = rows.filter((r) => r.is_active === true).length;
    const inactive = rows.length - active;

    console.log("Employee temporary-password reset preview");
    console.log("----------------------------------------");
    console.log(`Mapped Employee accounts found : ${rows.length}`);
    console.log(`Expected migrated count         : ${EXPECTED_EMPLOYEE_COUNT}`);
    console.log(`Active                          : ${active}`);
    console.log(`Inactive                        : ${inactive}`);
    console.log(`Mode                            : ${APPLY ? "APPLY" : "DRY RUN"}`);
    console.log("");

    if (rows.length !== EXPECTED_EMPLOYEE_COUNT && !ALLOW_COUNT_MISMATCH) {
      fail(
        `Count mismatch: expected ${EXPECTED_EMPLOYEE_COUNT}, found ${rows.length}. ` +
        "No passwords were changed. Investigate first, or use --allow-count-mismatch only if the new count is intentional."
      );
    }

    if (!APPLY) {
      console.log("✓  DRY RUN complete. No database rows were changed.");
      console.log("   Re-run with --apply only after confirming this scope is correct.");
      return;
    }

    await client.query("BEGIN");

    let updated = 0;
    for (const row of rows) {
      const hash = await hashPassword(tempPassword);
      const update = await client.query(
        `UPDATE app_users
            SET password_hash = $1,
                must_change_password = TRUE
          WHERE id = $2
            AND role = 'Employee'
            AND employee_code IS NOT NULL`,
        [hash, row.id]
      );
      updated += update.rowCount ?? 0;
    }

    if (updated !== rows.length) {
      throw new Error(`Safety check failed: selected ${rows.length} rows but updated ${updated}. Rolling back.`);
    }

    await client.query("COMMIT");

    const verify = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM app_users
        WHERE role = 'Employee'
          AND employee_code IS NOT NULL
          AND must_change_password = TRUE
          AND password_hash LIKE 'pbkdf2:sha512:310000:%'`
    );

    console.log(`✓  Reset completed for ${updated} mapped Employee accounts.`);
    console.log(`✓  ${verify.rows[0]?.count ?? 0} mapped Employee accounts now have PBKDF2 hashes and must_change_password = TRUE.`);
    console.log("✓  is_active values were not changed.");
    console.log("✓  Admin/HR/Finance/other roles were not touched.");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("❌  Employee password reset failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌  Unhandled error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
