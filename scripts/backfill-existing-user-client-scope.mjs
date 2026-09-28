/**
 * backfill-existing-user-client-scope.mjs
 *
 * One-time migration helper for existing app_users records.
 *
 * Business rule:
 *   - Existing restricted Users already have an Organization in app_users.compid.
 *   - If a User has no active USERCLIENT rows yet, grant access to ALL active
 *     Clients currently mapped to that Organization through BRANCHCLIENT.
 *   - If OM later supplies a narrower User -> Client list, Admin can edit that
 *     User's Organization/Client scope in the UI.
 *
 * No schema changes are made. app_users is not modified.
 *
 * Safety:
 *   - DRY RUN by default. Add --apply to write.
 *   - Admin and Payroll Manager are skipped because they are unrestricted roles.
 *   - Users that already have any active USERCLIENT mapping are skipped so an
 *     intentional restriction is never expanded accidentally.
 *   - Users without app_users.compid are skipped and reported.
 *   - Uses existing USERCOMPANY, USERBRANCH, USERCLIENT and BRANCHCLIENT tables.
 *
 * Required environment:
 *   CLIENT_DATABASE_URL
 *
 * Usage:
 *   node scripts/backfill-existing-user-client-scope.mjs
 *   node scripts/backfill-existing-user-client-scope.mjs --apply
 */

import pg from "pg";

const APPLY = process.argv.includes("--apply");
const UNRESTRICTED = new Set(["Admin", "Payroll Manager"]);

function fail(message) {
  console.error(`❌  ${message}`);
  process.exit(1);
}

async function main() {
  const connectionString = process.env.CLIENT_DATABASE_URL;
  if (!connectionString) fail("CLIENT_DATABASE_URL is not set.");

  const pool = new pg.Pool({ connectionString, max: 3 });
  const client = await pool.connect();

  try {
    const actorResult = await client.query(
      `SELECT id FROM app_users WHERE LOWER(username) = LOWER('systemadmin') ORDER BY id LIMIT 1`,
    );
    const actorId = actorResult.rows[0]?.id ?? 1;

    const usersResult = await client.query(
      `SELECT u.id, u.username, u.full_name, u.role, u.compid,
              EXISTS (
                SELECT 1 FROM "USERCLIENT" uc
                WHERE uc.usercode = u.id AND uc.is_active = TRUE
              ) AS has_active_client_scope
         FROM app_users u
        WHERE u.is_active = TRUE
        ORDER BY u.id`,
    );

    const allUsers = usersResult.rows;
    const candidates = allUsers.filter(
      (u) => !UNRESTRICTED.has(u.role) && u.compid != null && !u.has_active_client_scope,
    );
    const alreadyScoped = allUsers.filter(
      (u) => !UNRESTRICTED.has(u.role) && u.has_active_client_scope,
    );
    const missingOrg = allUsers.filter(
      (u) => !UNRESTRICTED.has(u.role) && u.compid == null,
    );

    console.log("Existing User -> Client scope backfill preview");
    console.log("------------------------------------------");
    console.log(`Mode                              : ${APPLY ? "APPLY" : "DRY RUN"}`);
    console.log(`Active app_users                  : ${allUsers.length}`);
    console.log(`Candidates (org, no client scope) : ${candidates.length}`);
    console.log(`Already client-scoped (skipped)   : ${alreadyScoped.length}`);
    console.log(`No organization/compid (skipped)  : ${missingOrg.length}`);
    console.log("");

    const plan = [];
    for (const user of candidates) {
      const mappings = await client.query(
        `SELECT DISTINCT bc.compid, bc.branchcode, bc.clientcode,
                cm."comname", c."Clientname", b."BranchName"
           FROM "BRANCHCLIENT" bc
           LEFT JOIN "COMPANYMAST" cm ON cm."compid" = bc.compid
           LEFT JOIN "CLIENTMASTER" c ON c."clientcode" = bc.clientcode AND c."compid" = bc.compid
           LEFT JOIN "BRANCH" b ON b."BranchCode" = bc.branchcode AND b."compid" = bc.compid
          WHERE bc.compid = $1
            AND bc.is_active = TRUE
          ORDER BY bc.branchcode, bc.clientcode`,
        [user.compid],
      );

      const clientCodes = [...new Set(mappings.rows.map((r) => Number(r.clientcode)))];
      const branchCodes = [...new Set(mappings.rows.map((r) => Number(r.branchcode)))];
      plan.push({ user, mappings: mappings.rows, clientCodes, branchCodes });

      console.log(
        `User ${user.id} ${user.username} | Org ${user.compid} | ` +
        `${clientCodes.length} client(s), ${branchCodes.length} branch(es)`,
      );
    }

    const noMappings = plan.filter((x) => x.mappings.length === 0);
    if (noMappings.length) {
      console.log("");
      console.log(`⚠️  ${noMappings.length} candidate user(s) have no active BRANCHCLIENT rows for their Organization.`);
      console.log("   They will be skipped; fix Organization -> Branch -> Client mapping first.");
    }

    if (!APPLY) {
      console.log("");
      console.log("✓  DRY RUN complete. No database rows were changed.");
      console.log("   Re-run with --apply only after reviewing the preview.");
      return;
    }

    await client.query("BEGIN");
    let usersUpdated = 0;
    let companyRows = 0;
    let branchRows = 0;
    let clientRows = 0;

    for (const item of plan) {
      if (item.mappings.length === 0) continue;
      const { user, mappings } = item;

      const compInsert = await client.query(
        `INSERT INTO "USERCOMPANY" (usercode, compids)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [user.id, user.compid],
      );
      companyRows += compInsert.rowCount ?? 0;

      const seenBranches = new Set();
      for (const row of mappings) {
        const branchKey = `${row.compid}:${row.branchcode}`;
        if (!seenBranches.has(branchKey)) {
          seenBranches.add(branchKey);
          const branchInsert = await client.query(
            `INSERT INTO "USERBRANCH" (usercode, compid, branchcode, is_active, created_by)
             VALUES ($1, $2, $3, TRUE, $4)
             ON CONFLICT (usercode, compid, branchcode)
             DO UPDATE SET is_active = TRUE, updated_by = $4, updated_at = NOW()`,
            [user.id, row.compid, row.branchcode, actorId],
          );
          branchRows += branchInsert.rowCount ?? 0;
        }

        const clientInsert = await client.query(
          `INSERT INTO "USERCLIENT" (usercode, compid, branchcode, clientcode, is_active, created_by)
           VALUES ($1, $2, $3, $4, TRUE, $5)
           ON CONFLICT (usercode, compid, branchcode, clientcode)
           DO UPDATE SET is_active = TRUE, updated_by = $5, updated_at = NOW()`,
          [user.id, row.compid, row.branchcode, row.clientcode, actorId],
        );
        clientRows += clientInsert.rowCount ?? 0;
      }

      usersUpdated += 1;
    }

    await client.query("COMMIT");

    const verify = await client.query(
      `SELECT COUNT(DISTINCT u.id)::int AS users_with_client_scope
         FROM app_users u
         JOIN "USERCLIENT" uc ON uc.usercode = u.id AND uc.is_active = TRUE
        WHERE u.is_active = TRUE
          AND u.compid IS NOT NULL
          AND u.role NOT IN ('Admin', 'Payroll Manager')`,
    );

    console.log("");
    console.log(`✓  Backfill applied to ${usersUpdated} User(s).`);
    console.log(`✓  USERCOMPANY rows inserted : ${companyRows}`);
    console.log(`✓  USERBRANCH rows upserted   : ${branchRows}`);
    console.log(`✓  USERCLIENT rows upserted   : ${clientRows}`);
    console.log(`✓  Restricted active Users now having client scope: ${verify.rows[0]?.users_with_client_scope ?? 0}`);
    console.log("✓  app_users rows/schema were not changed.");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("❌  User client-scope backfill failed:", err instanceof Error ? err.message : err);
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
