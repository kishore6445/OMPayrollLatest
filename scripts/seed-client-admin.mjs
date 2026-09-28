/**
 * seed-client-admin.mjs
 *
 * Seeds the payrollom_client database with default roles, permissions,
 * and one admin user (systemadmin).
 *
 * Security contract:
 *   - The plain-text password is read ONLY from process.env.ADMIN_SEED_PASSWORD
 *     (a Replit Secret). It is NEVER written to a file, log, git history, or
 *     any persisted variable.
 *   - Only the PBKDF2-SHA-512 hash is stored in the database.
 *   - The script is idempotent — running it twice will not duplicate rows.
 *
 * Run:
 *   node scripts/seed-client-admin.mjs
 *   (CLIENT_DATABASE_URL and ADMIN_SEED_PASSWORD must be set as env/secrets)
 */

import pg from "pg";
import { pbkdf2, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

/** Hash a plain-text password. Returns a self-describing string with salt embedded. */
async function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const key = await pbkdf2Async(plain, salt, 310_000, 64, "sha512");
  return `pbkdf2:sha512:310000:${salt}:${key.toString("hex")}`;
}

async function main() {
  // ── Read credentials from environment only — never from code or args ──────
  const clientDbUrl = process.env.CLIENT_DATABASE_URL;
  const adminPassword = process.env.ADMIN_SEED_PASSWORD;

  if (!clientDbUrl) {
    console.error("❌  CLIENT_DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!adminPassword) {
    console.error("❌  ADMIN_SEED_PASSWORD is not set. Add it as a Replit Secret.");
    process.exit(1);
  }

  // Hash the password immediately — the plain-text reference is discarded after this
  const passwordHash = await hashPassword(adminPassword);
  // adminPassword is no longer referenced below this line

  const pool = new pg.Pool({ connectionString: clientDbUrl, max: 3 });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ── 1. Roles ─────────────────────────────────────────────────────────────
    const roles = [
      { id: 1, role_name: "Admin",              description: "Full system access" },
      { id: 2, role_name: "HR Manager",         description: "Employee and attendance management" },
      { id: 3, role_name: "Finance Executive",  description: "Billing and collections" },
      { id: 4, role_name: "Finance Manager",    description: "Billing approval and finance oversight" },
      { id: 5, role_name: "Compliance Officer", description: "Statutory compliance and reporting" },
      { id: 6, role_name: "Viewer",             description: "Read-only access" },
      { id: 7, role_name: "Payroll Manager",    description: "Payroll processing and approval" },
    ];

    for (const r of roles) {
      await client.query(
        `INSERT INTO app_roles (id, role_name, description, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT DO NOTHING`,
        [r.id, r.role_name, r.description]
      );
    }
    console.log(`✓  Seeded ${roles.length} roles`);

    // ── 2. Permissions ────────────────────────────────────────────────────────
    const allModules = [
      "auth", "users", "company", "branches", "clients", "units", "shifts",
      "workers", "attendance", "leave", "advances", "arrears",
      "payroll", "statutory", "challans", "billing", "collections",
      "reports", "masters", "finance", "audit", "departments",
      "zones",
    ];
    const allActions = ["read", "write", "export", "delete"];

    // Admin — full access
    for (const module of allModules) {
      for (const action of allActions) {
        await client.query(
          `INSERT INTO app_permissions (role_name, module, action, allowed)
           VALUES ('Admin', $1, $2, TRUE)
           ON CONFLICT DO NOTHING`,
          [module, action]
        );
      }
    }

    // HR Manager — employees, attendance, leave (read+write); payroll read; departments CRUD
    const hrModules = ["workers", "attendance", "leave", "advances", "masters", "reports", "departments"];
    for (const m of hrModules) {
      for (const a of ["read", "write", "export"]) {
        await client.query(
          `INSERT INTO app_permissions (role_name, module, action, allowed)
           VALUES ('HR Manager', $1, $2, TRUE)
           ON CONFLICT DO NOTHING`,
          [m, a]
        );
      }
    }
    await client.query(
      `INSERT INTO app_permissions (role_name, module, action, allowed)
       VALUES ('HR Manager', 'payroll', 'read', TRUE)
       ON CONFLICT DO NOTHING`
    );

    // Finance Executive — billing, collections, invoices (read+write+export)
    const finExecModules = ["billing", "collections", "finance", "reports", "clients", "units"];
    for (const m of finExecModules) {
      for (const a of ["read", "write", "export"]) {
        await client.query(
          `INSERT INTO app_permissions (role_name, module, action, allowed)
           VALUES ('Finance Executive', $1, $2, TRUE)
           ON CONFLICT DO NOTHING`,
          [m, a]
        );
      }
    }

    // Finance Manager — same as Finance Executive + delete
    const finMgrModules = [...finExecModules, "workers", "payroll"];
    for (const m of finMgrModules) {
      for (const a of allActions) {
        await client.query(
          `INSERT INTO app_permissions (role_name, module, action, allowed)
           VALUES ('Finance Manager', $1, $2, TRUE)
           ON CONFLICT DO NOTHING`,
          [m, a]
        );
      }
    }

    // Compliance Officer — statutory, challans, reports (read+export)
    const compModules = ["statutory", "challans", "reports", "workers", "payroll", "attendance"];
    for (const m of compModules) {
      for (const a of ["read", "export"]) {
        await client.query(
          `INSERT INTO app_permissions (role_name, module, action, allowed)
           VALUES ('Compliance Officer', $1, $2, TRUE)
           ON CONFLICT DO NOTHING`,
          [m, a]
        );
      }
    }

    // Viewer — read-only on safe modules
    const viewerModules = ["workers", "attendance", "payroll", "billing", "reports", "masters", "clients", "units"];
    for (const m of viewerModules) {
      await client.query(
        `INSERT INTO app_permissions (role_name, module, action, allowed)
         VALUES ('Viewer', $1, 'read', TRUE)
         ON CONFLICT DO NOTHING`,
        [m]
      );
    }

    // Payroll Manager — payroll processing + employee/attendance read
    const payrollMgrModules = [
      "payroll", "workers", "attendance", "masters", "departments",
      "reports", "advances", "arrears", "statutory",
    ];
    for (const m of payrollMgrModules) {
      for (const a of ["read", "write", "export"]) {
        await client.query(
          `INSERT INTO app_permissions (role_name, module, action, allowed)
           VALUES ('Payroll Manager', $1, $2, TRUE)
           ON CONFLICT DO NOTHING`,
          [m, a]
        );
      }
    }

    console.log("✓  Seeded permissions for all roles");

    // ── 3. Admin user ─────────────────────────────────────────────────────────
    const existing = await client.query(
      "SELECT id FROM app_users WHERE username = $1",
      ["systemadmin"]
    );

    if (existing.rows.length > 0) {
      console.log("ℹ  User 'systemadmin' exists — refreshing password hash only");
      await client.query(
        `UPDATE app_users
         SET password_hash = $1, must_change_password = TRUE, is_active = TRUE
         WHERE username = 'systemadmin'`,
        [passwordHash]
      );
    } else {
      await client.query(
        `INSERT INTO app_users
           (id, username, password_hash, full_name, role, is_active,
            must_change_password, created_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, TRUE, NOW())`,
        [1, "systemadmin", passwordHash, "System Administrator", "Admin"]
      );
      console.log("✓  Created admin user 'systemadmin'");
    }

    await client.query("COMMIT");
    console.log("✓  Seed complete. Admin must change password on first login.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌  Seed failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌  Unhandled error:", err);
  process.exit(1);
});
