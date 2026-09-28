import pg from "pg";
const { Client } = pg;
const apply = process.argv.includes("--apply");
const connectionString = process.env.CLIENT_DATABASE_URL;
if (!connectionString) throw new Error("CLIENT_DATABASE_URL is required");
const db = new Client({ connectionString });
await db.connect();
try {
  const table = await db.query(`SELECT to_regclass('public."USERUNIT"') AS t`);
  if (!table.rows[0]?.t) throw new Error('USERUNIT does not exist. Run migrations/20260924_create_userunit_scope.sql first.');

  const q = await db.query(`
    WITH eligible AS (
      SELECT u.id AS usercode, u.username, u.role, u.compid
      FROM app_users u
      WHERE u.is_active = TRUE
        AND u.compid IS NOT NULL
        AND u.role NOT IN ('Admin','Payroll Manager')
    ), missing AS (
      SELECT e.*
      FROM eligible e
      WHERE NOT EXISTS (SELECT 1 FROM "USERUNIT" uu WHERE uu.usercode=e.usercode AND uu.is_active=TRUE)
    )
    SELECT m.usercode, m.username, m.role, m.compid, um."unitcode", um."Unitname"
    FROM missing m
    JOIN "UNITMASTER" um ON um."compcode" = m.compid
    ORDER BY m.usercode, um."Unitname", um."unitcode"
  `);
  const users = new Set(q.rows.map(r => r.usercode));
  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY_RUN', users_to_map: users.size, mappings_to_create: q.rowCount }, null, 2));
  if (!apply) process.exit(0);
  await db.query('BEGIN');
  for (const r of q.rows) {
    await db.query(`INSERT INTO "USERUNIT" (usercode,compid,unitcode,is_active,created_by)
      VALUES ($1,$2,$3,TRUE,$1)
      ON CONFLICT (usercode,compid,unitcode) DO UPDATE SET is_active=TRUE, updated_by=$1, updated_at=NOW()`,
      [r.usercode, r.compid, r.unitcode]);
  }
  await db.query('COMMIT');
  console.log(JSON.stringify({ applied: q.rowCount, users: users.size }, null, 2));
} catch (e) {
  try { await db.query('ROLLBACK'); } catch {}
  throw e;
} finally { await db.end(); }
