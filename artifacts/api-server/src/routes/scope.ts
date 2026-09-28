/**
 * scope.ts — organisational scope management + scoped lookup APIs
 *
 * Scope routes:
 *   GET  /api/users/:id/scope    — read scope for a user
 *   PUT  /api/users/:id/scope    — replace scope for a user (full replace, transactional)
 *
 * Scoped lookup routes (return filtered or full data depending on caller role):
 *   GET  /api/scoped/companies                          — companies in scope
 *   GET  /api/scoped/branches?compid=                   — branches in scope for a company
 *   GET  /api/scoped/clients?compid=&branchcode=        — clients in scope for a company+branch
 *   GET  /api/scoped/units?compid=&branchcode=&clientcode= — units (always from UNITMASTER, no
 *                                                            per-unit scope restriction)
 *
 * Scope rules:
 *   Admin / Payroll Manager → unrestricted (returns all data)
 *   Restricted operational roles → returns only assigned rows
 *   Employee → identity/client is derived from EMPMAST, not these scope tables
 *
 * User identifier: app_users.id = USERCOMPANY.usercode (both INTEGER)
 */

import { Router, type IRouter } from "express";
import {
  queryRows, queryOne, queryScalar, execute, withTransaction,
} from "@workspace/pg-client-db";
import {
  requireClientAuth,
  requirePasswordChanged,
  requireClientPermission,
} from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";
import { loadUserScope, isUnrestrictedRole } from "../lib/scope-guard.js";

const router: IRouter = Router();

const anyAuth  = [requireClientAuth, requirePasswordChanged];
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("users", "write")];

// ── Salary component configuration helpers ───────────────────────────────────
//
// IMPORTANT: Client salary configuration is read from the EXISTING UNITMASTER
// row at runtime. The Excel supplied on 18 Sep was used only to confirm the
// legacy layout; it is never bundled or used as application data.
//
// Salary head N in Client Master maps directly to EMPMAST.SalHeadN. We do not
// infer a storage column from the display label (for example, BASIC -> basic).
// This preserves the legacy Client Master mapping exactly as configured.

type SalaryComponent = {
  key: string;
  label: string;
  field: string;
  sourceHead: number;
  sourceColumn: string;
  defaultValue: number | null;
};

function normaliseHeadLabel(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * UNITMASTER deployments in this codebase have historically used both
 * `uSalHeadN` and `SalHeadN` naming in exports/legacy variants. Because the
 * endpoint reads the real UNITMASTER row with SELECT *, resolve the column
 * actually present in that database instead of hard-coding Excel data.
 */
function readUnitSalaryHead(
  unit: Record<string, unknown>,
  headNo: number,
): { label: string; sourceColumn: string } | null {
  const keyByLower = new Map(
    Object.keys(unit).map((key) => [key.toLowerCase(), key] as const),
  );

  for (const candidate of [`uSalHead${headNo}`, `SalHead${headNo}`]) {
    const actualKey = keyByLower.get(candidate.toLowerCase());
    if (!actualKey) continue;
    const label = normaliseHeadLabel(unit[actualKey]);
    if (label) return { label, sourceColumn: actualKey };
  }

  return null;
}

function salaryComponentsFromUnit(unit: Record<string, unknown>): {
  configured: boolean;
  components: SalaryComponent[];
} {
  const components: SalaryComponent[] = [];

  for (let i = 1; i <= 17; i++) {
    const configuredHead = readUnitSalaryHead(unit, i);
    if (!configuredHead) continue;

    const defaultKey = Object.keys(unit).find((key) => key.toLowerCase() === `salheaddefault${i}`.toLowerCase());
    const rawDefault = defaultKey ? unit[defaultKey] : null;
    const parsedDefault = rawDefault == null || rawDefault === "" ? null : Number(rawDefault);

    components.push({
      key: `salary-head-${i}`,
      label: configuredHead.label,
      field: `SalHead${i}`,
      sourceHead: i,
      sourceColumn: configuredHead.sourceColumn,
      defaultValue: parsedDefault != null && Number.isFinite(parsedDefault) ? parsedDefault : null,
    });
  }

  return { configured: components.length > 0, components };
}

// ── GET /api/users/:id/scope ──────────────────────────────────────────────────
router.get("/users/:id/scope", ...anyAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  // Only Admin / HR Manager level can read other users' scope;
  // any user can read their own scope
  const actor = req.clientUser!;
  if (actor.id !== id && !isUnrestrictedRole(actor.role) && actor.role !== "HR Manager") {
    res.status(403).json({ error: "Insufficient permissions to view this user's scope" });
    return;
  }

  const user = await queryOne<{ id: number; role: string; employee_code: string | null; compid: number | null }>(
    `SELECT id, role, employee_code, compid FROM app_users WHERE id = $1`, [id],
  );
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [companies, branches, clients, units] = await Promise.all([
    queryRows<{ compids: number; comname: string }>(
      `SELECT uc.compids, cm."comname"
       FROM "USERCOMPANY" uc
       LEFT JOIN "COMPANYMAST" cm ON cm."compid" = uc.compids
       WHERE uc.usercode = $1`,
      [id],
    ),
    queryRows<{ compid: number; branchcode: number; BranchName: string; is_active: boolean }>(
      `SELECT ub.compid, ub.branchcode, ub.is_active, b."BranchName"
       FROM "USERBRANCH" ub
       LEFT JOIN "BRANCH" b ON b."BranchCode" = ub.branchcode AND b."compid" = ub.compid
       WHERE ub.usercode = $1 AND ub.is_active = TRUE ORDER BY ub.compid, ub.branchcode`,
      [id],
    ),
    queryRows<{
      compid: number; branchcode: number; clientcode: number;
      Clientname: string; BranchName: string; is_active: boolean;
    }>(
      `SELECT uc.compid, uc.branchcode, uc.clientcode, uc.is_active,
              c."Clientname", b."BranchName"
       FROM "USERCLIENT" uc
       LEFT JOIN "CLIENTMASTER" c ON c."clientcode" = uc.clientcode
       LEFT JOIN "BRANCH" b ON b."BranchCode" = uc.branchcode AND b."compid" = uc.compid
       WHERE uc.usercode = $1 AND uc.is_active = TRUE ORDER BY uc.compid, uc.branchcode, uc.clientcode`,
      [id],
    ),
    queryRows<{ compid: number; unitcode: string; Unitname: string; is_active: boolean }>(
      `SELECT uu.compid, uu.unitcode, uu.is_active, u."Unitname"
       FROM "USERUNIT" uu
       LEFT JOIN "UNITMASTER" u ON u."unitcode" = uu.unitcode AND u."compcode" = uu.compid
       WHERE uu.usercode = $1 AND uu.is_active = TRUE ORDER BY uu.compid, u."Unitname", uu.unitcode`,
      [id],
    ),
  ]);

  // Existing migrated users may have no explicit USERCOMPANY / USERUNIT rows yet,
  // while still being linked to an EMPMAST record through (employee_code, compid).
  // When such a user is edited and their role is changed from Employee to a
  // scoped operational role, derive the current Organization + business Client
  // from EMPMAST so Edit User can preselect the existing context instead of
  // forcing the admin to map it again. Explicit scope rows always win.
  if (companies.length === 0 && units.length === 0 && user.employee_code && user.compid != null) {
    const employeeScope = await queryOne<{
      compid: number; unitcode: string | null; Unitname: string | null; comname: string | null;
    }>(
      `SELECT e."compid", e."unitcode", um."Unitname", cm."comname"
       FROM "EMPMAST" e
       LEFT JOIN "UNITMASTER" um
         ON um."unitcode" = e."unitcode" AND um."compcode" = e."compid"
       LEFT JOIN "COMPANYMAST" cm ON cm."compid" = e."compid"
       WHERE e."EmpCode" = $1 AND e."compid" = $2
       LIMIT 1`,
      [user.employee_code, user.compid],
    );

    if (employeeScope) {
      companies.push({
        compids: employeeScope.compid,
        comname: employeeScope.comname ?? `Company ${employeeScope.compid}`,
      });
      if (employeeScope.unitcode) {
        units.push({
          compid: employeeScope.compid,
          unitcode: employeeScope.unitcode,
          Unitname: employeeScope.Unitname ?? employeeScope.unitcode,
          is_active: true,
        });
      }
    }
  }

  res.json({ userId: id, role: user.role, companies, branches, clients, units });
});

// ── PUT /api/users/:id/scope ──────────────────────────────────────────────────
// Body: {
//   companies: number[],                               // compids
//   branches:  { compid: number; branchcode: number }[],
//   clients:   { compid: number; branchcode: number; clientcode: number }[]
// }
router.put("/users/:id/scope", ...canWrite, async (req, res): Promise<void> => {
  const id    = parseInt(req.params.id as string, 10);
  const actor = req.clientUser!;
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const user = await queryOne<{ id: number; role: string; username: string }>(
    `SELECT id, role, username FROM app_users WHERE id = $1`, [id],
  );
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const body = req.body as {
    companies?: number[];
    branches?:  { compid: number; branchcode: number }[];
    clients?:   { compid: number; branchcode: number; clientcode: number }[];
    units?:     { compid: number; unitcode: string }[];
  };

  const companies = body.companies ?? [];
  const branches  = body.branches  ?? [];
  const clients   = body.clients   ?? [];
  const units     = body.units     ?? [];

  // Basic type validation
  if (!Array.isArray(companies) || !Array.isArray(branches) || !Array.isArray(clients) || !Array.isArray(units)) {
    res.status(400).json({ error: "companies, branches, clients, and units must be arrays" });
    return;
  }

  const normalizedCompanies = Array.from(new Set(companies.map(Number)));
  if (normalizedCompanies.some((c) => !Number.isInteger(c) || c <= 0)) {
    res.status(400).json({ error: "Invalid Organization selection" });
    return;
  }
  const companySet = new Set(normalizedCompanies);
  if (units.some((u) => !companySet.has(Number(u.compid)) || !String(u.unitcode ?? "").trim())) {
    res.status(400).json({ error: "Every selected Client must belong to one of the selected Organizations" });
    return;
  }
  if (normalizedCompanies.length > 0) {
    const orgsWithoutClient = normalizedCompanies.filter((compid) => !units.some((u) => Number(u.compid) === compid));
    if (orgsWithoutClient.length > 0) {
      res.status(400).json({ error: "Select at least one Client under each selected Organization" });
      return;
    }
  }

  await withTransaction(async (tx) => {
    // Companies — replace all rows for this user
    await tx.query(`DELETE FROM "USERCOMPANY" WHERE usercode = $1`, [id]);
    for (const compid of normalizedCompanies) {
      await tx.query(
        `INSERT INTO "USERCOMPANY" (usercode, compids) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [id, compid],
      );
    }

    // Branches — soft-deactivate all, then upsert active
    await tx.query(
      `UPDATE "USERBRANCH" SET is_active = FALSE, updated_by = $1, updated_at = NOW()
       WHERE usercode = $2`,
      [actor.id, id],
    );
    for (const b of branches) {
      await tx.query(
        `INSERT INTO "USERBRANCH" (usercode, compid, branchcode, is_active, created_by)
         VALUES ($1, $2, $3, TRUE, $4)
         ON CONFLICT (usercode, compid, branchcode)
         DO UPDATE SET is_active = TRUE, updated_by = $4, updated_at = NOW()`,
        [id, b.compid, b.branchcode, actor.id],
      );
    }

    // Clients — soft-deactivate all, then upsert active
    await tx.query(
      `UPDATE "USERCLIENT" SET is_active = FALSE, updated_by = $1, updated_at = NOW()
       WHERE usercode = $2`,
      [actor.id, id],
    );
    for (const c of clients) {
      await tx.query(
        `INSERT INTO "USERCLIENT" (usercode, compid, branchcode, clientcode, is_active, created_by)
         VALUES ($1, $2, $3, $4, TRUE, $5)
         ON CONFLICT (usercode, compid, branchcode, clientcode)
         DO UPDATE SET is_active = TRUE, updated_by = $5, updated_at = NOW()`,
        [id, c.compid, c.branchcode, c.clientcode, actor.id],
      );
    }

    // Business Clients (UNITMASTER) — this is the same Client entity used by Employee onboarding.
    await tx.query(
      `UPDATE "USERUNIT" SET is_active = FALSE, updated_by = $1, updated_at = NOW() WHERE usercode = $2`,
      [actor.id, id],
    );
    for (const u of units) {
      const exists = await tx.query(
        `SELECT 1 FROM "UNITMASTER" WHERE "unitcode" = $1 AND "compcode" = $2`,
        [u.unitcode, u.compid],
      );
      if (exists.rowCount === 0) throw new Error(`Client ${u.unitcode} does not belong to Organization ${u.compid}`);
      await tx.query(
        `INSERT INTO "USERUNIT" (usercode, compid, unitcode, is_active, created_by)
         VALUES ($1, $2, $3, TRUE, $4)
         ON CONFLICT (usercode, compid, unitcode)
         DO UPDATE SET is_active = TRUE, updated_by = $4, updated_at = NOW()`,
        [id, u.compid, u.unitcode, actor.id],
      );
    }
  });

  // Audit
  await logClientAction(actor.id, "scope.update", {
    targetUserId: id,
    targetUsername: user.username,
    companiesCount: normalizedCompanies.length,
    branchesCount:  branches.length,
    clientsCount:   clients.length,
    unitsCount:     units.length,
    companies: normalizedCompanies, branches, clients, units,
  });

  // Return new scope
  const [newBranches, newClients, newUnits] = await Promise.all([
    queryRows(
      `SELECT ub.compid, ub.branchcode, b."BranchName"
       FROM "USERBRANCH" ub
       LEFT JOIN "BRANCH" b ON b."BranchCode" = ub.branchcode AND b."compid" = ub.compid
       WHERE ub.usercode = $1 AND ub.is_active = TRUE`,
      [id],
    ),
    queryRows(
      `SELECT uc.compid, uc.branchcode, uc.clientcode, c."Clientname"
       FROM "USERCLIENT" uc
       LEFT JOIN "CLIENTMASTER" c ON c."clientcode" = uc.clientcode
       WHERE uc.usercode = $1 AND uc.is_active = TRUE`,
      [id],
    ),
    queryRows(
      `SELECT uu.compid, uu.unitcode, u."Unitname"
       FROM "USERUNIT" uu
       LEFT JOIN "UNITMASTER" u ON u."unitcode" = uu.unitcode AND u."compcode" = uu.compid
       WHERE uu.usercode = $1 AND uu.is_active = TRUE`,
      [id],
    ),
  ]);

  res.json({ userId: id, companies: normalizedCompanies, branches: newBranches, clients: newClients, units: newUnits });
});

// ── Scoped lookup routes ──────────────────────────────────────────────────────

// GET /api/scoped/companies
router.get("/scoped/companies", ...anyAuth, async (req, res): Promise<void> => {
  const user = req.clientUser!;

  if (isUnrestrictedRole(user.role)) {
    const rows = await queryRows(
      `SELECT "compid", "comname", "city", "state", "corpID",
              NULLIF(BTRIM("corpID"), '') AS "orgCode",
              CASE WHEN NULLIF(BTRIM("corpID"), '') IS NOT NULL
                   THEN CONCAT_WS(' — ', NULLIF(BTRIM("comname"), ''), NULLIF(BTRIM("corpID"), ''))
                   ELSE NULLIF(BTRIM("comname"), '') END AS "displayLabel"
       FROM "COMPANYMAST" ORDER BY "comname", "compid"`,
    );
    res.json(rows);
    return;
  }

  // Restricted: explicit USERCOMPANY scope wins. Migrated users whose role was
  // later changed from Employee may not have explicit scope rows yet; in that
  // case preserve their existing EMPMAST company context instead of returning
  // an empty company list.
  const rows = await queryRows<{ compid: number; comname: string; city: string | null; state: string | null; corpID: string | null; orgCode: string; displayLabel: string }>(
    `SELECT cm."compid", cm."comname", cm."city", cm."state", cm."corpID",
            NULLIF(BTRIM(cm."corpID"), '') AS "orgCode",
            CASE WHEN NULLIF(BTRIM(cm."corpID"), '') IS NOT NULL
                 THEN CONCAT_WS(' — ', NULLIF(BTRIM(cm."comname"), ''), NULLIF(BTRIM(cm."corpID"), ''))
                 ELSE NULLIF(BTRIM(cm."comname"), '') END AS "displayLabel"
     FROM "COMPANYMAST" cm
     JOIN "USERCOMPANY" uc ON uc.compids = cm."compid"
     WHERE uc.usercode = $1
     ORDER BY cm."comname"`,
    [user.id],
  );

  if (rows.length === 0) {
    // Existing migrated users already carry their Organization in app_users.compid.
    // Do not require an EMPMAST join just to recover that Organization after a
    // role change; this keeps Company / Entity available even when explicit
    // USERCOMPANY scope has not yet been created.
    const derived = await queryOne<{ compid: number; comname: string; city: string | null; state: string | null; corpID: string | null; orgCode: string; displayLabel: string }>(
      `SELECT cm."compid", cm."comname", cm."city", cm."state", cm."corpID",
              NULLIF(BTRIM(cm."corpID"), '') AS "orgCode",
              CASE WHEN NULLIF(BTRIM(cm."corpID"), '') IS NOT NULL
                   THEN CONCAT_WS(' — ', NULLIF(BTRIM(cm."comname"), ''), NULLIF(BTRIM(cm."corpID"), ''))
                   ELSE NULLIF(BTRIM(cm."comname"), '') END AS "displayLabel"
       FROM app_users au
       JOIN "COMPANYMAST" cm ON cm."compid" = au.compid
       WHERE au.id = $1 AND au.compid IS NOT NULL
       LIMIT 1`,
      [user.id],
    );
    if (derived) rows.push(derived);
  }

  res.json(rows);
});

// GET /api/scoped/branches?compid=
router.get("/scoped/branches", ...anyAuth, async (req, res): Promise<void> => {
  const user    = req.clientUser!;
  const compid  = req.query.compid ? parseInt(req.query.compid as string, 10) : null;
  if (compid && isNaN(compid)) { res.status(400).json({ error: "compid must be an integer" }); return; }

  if (isUnrestrictedRole(user.role)) {
    const rows = await queryRows(
      `SELECT "BranchCode", "BranchName", "compid"
       FROM "BRANCH"
       WHERE ($1::integer IS NULL OR "compid" = $1)
       ORDER BY "BranchName"`,
      [compid],
    );
    res.json(rows);
    return;
  }

  // Restricted: return only branches in USERBRANCH
  const rows = await queryRows(
    `SELECT b."BranchCode", b."BranchName", b."compid"
     FROM "BRANCH" b
     JOIN "USERBRANCH" ub
       ON ub.branchcode = b."BranchCode" AND ub.compid = b."compid"
     WHERE ub.usercode = $1 AND ub.is_active = TRUE
       AND ($2::integer IS NULL OR b."compid" = $2)
     ORDER BY b."BranchName"`,
    [user.id, compid],
  );
  res.json(rows);
});

// GET /api/scoped/clients?compid=&branchcode=
router.get("/scoped/clients", ...anyAuth, async (req, res): Promise<void> => {
  const user       = req.clientUser!;
  const compid     = req.query.compid     ? parseInt(req.query.compid     as string, 10) : null;
  const branchcode = req.query.branchcode ? parseInt(req.query.branchcode as string, 10) : null;

  if (compid     && isNaN(compid))     { res.status(400).json({ error: "compid must be an integer"     }); return; }
  if (branchcode && isNaN(branchcode)) { res.status(400).json({ error: "branchcode must be an integer" }); return; }

  if (isUnrestrictedRole(user.role)) {
    // For Admin/PM: filter by BRANCHCLIENT when branchcode is provided (uses the new mapping),
    // otherwise fall back to CLIENTMASTER filtered by compid.
    if (branchcode) {
      const rows = await queryRows(
        `SELECT c."clientcode", c."Clientname", c."compid"
         FROM "CLIENTMASTER" c
         JOIN "BRANCHCLIENT" bc ON bc.clientcode = c."clientcode"
         WHERE bc.compid = $1 AND bc.branchcode = $2 AND bc.is_active = TRUE
         ORDER BY c."Clientname"`,
        [compid ?? 0, branchcode],
      );
      res.json(rows);
    } else {
      const rows = await queryRows(
        `SELECT "clientcode", "Clientname", "compid"
         FROM "CLIENTMASTER"
         WHERE ($1::integer IS NULL OR "compid" = $1)
         ORDER BY "Clientname"`,
        [compid],
      );
      res.json(rows);
    }
    return;
  }

  // Restricted: return only clients in USERCLIENT
  const rows = await queryRows(
    `SELECT c."clientcode", c."Clientname", c."compid"
     FROM "CLIENTMASTER" c
     JOIN "USERCLIENT" uc ON uc.clientcode = c."clientcode"
     WHERE uc.usercode = $1 AND uc.is_active = TRUE
       AND ($2::integer IS NULL OR uc.compid     = $2)
       AND ($3::integer IS NULL OR uc.branchcode = $3)
     ORDER BY c."Clientname"`,
    [user.id, compid, branchcode],
  );
  res.json(rows);
});

// GET /api/scoped/units?compid=&branchcode=&clientcode=
// UNITMASTER is the business Client used by Employee onboarding. Restricted
// users only receive Clients explicitly mapped in USERUNIT.
router.get("/scoped/units", ...anyAuth, async (req, res): Promise<void> => {
  const user = req.clientUser!;
  const compid     = req.query.compid     ? parseInt(req.query.compid     as string, 10) : null;
  const branchcode = req.query.branchcode ? parseInt(req.query.branchcode as string, 10) : null;
  const clientcode = req.query.clientcode ? parseInt(req.query.clientcode as string, 10) : null;

  const conds: string[] = [];
  const p: unknown[] = [];
  if (compid)     { p.push(compid);     conds.push(`u."compcode" = $${p.length}`); }
  if (branchcode) { p.push(branchcode); conds.push(`u."branchcode" = $${p.length}`); }
  if (clientcode) { p.push(clientcode); conds.push(`u."clientcode" = $${p.length}`); }

  if (!isUnrestrictedRole(user.role)) {
    // Explicit USERUNIT mappings take priority. If none exist for a migrated
    // user whose role was changed from Employee to an operational role, fall
    // back to that user's existing EMPMAST unit only. This preserves the
    // current assignment without granting access to every unit in the company.
    const explicitCount = await queryScalar<number>(
      `SELECT COUNT(*)::int FROM "USERUNIT" WHERE usercode = $1 AND is_active = TRUE`,
      [user.id],
    );

    if (Number(explicitCount ?? 0) > 0) {
      p.push(user.id);
      const join = `JOIN "USERUNIT" uu ON uu.unitcode = u."unitcode" AND uu.compid = u."compcode" AND uu.usercode = $${p.length} AND uu.is_active = TRUE`;
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const rows = await queryRows(
        `SELECT u."unitcode", u."Unitname", u."compcode", u."branchcode", u."clientcode", u."StateID", u."city", u."state"
         FROM "UNITMASTER" u
         ${join}
         ${where}
         ORDER BY u."Unitname"`,
        p,
      );
      res.json(rows);
      return;
    }

    p.push(user.id);
    conds.push(`EXISTS (
      SELECT 1
      FROM app_users au
      JOIN "EMPMAST" e ON e."EmpCode" = au.employee_code AND e."compid" = au.compid
      WHERE au.id = $${p.length}
        AND au.employee_code IS NOT NULL
        AND e."unitcode" = u."unitcode"
        AND e."compid" = u."compcode"
    )`);
  }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await queryRows(
    `SELECT u."unitcode", u."Unitname", u."compcode", u."branchcode", u."clientcode", u."StateID", u."city", u."state"
     FROM "UNITMASTER" u
     ${where}
     ORDER BY u."Unitname"`,
    p,
  );
  res.json(rows);
});


// GET /api/scoped/units/:unitcode/salary-components
// Reads the selected client's salary-head mapping from the live UNITMASTER row.
// Employee onboarding uses this lightweight endpoint so HR users do not need
// separate Unit Master read permission merely to load salary configuration.
// No writes are performed here.
router.get("/scoped/units/:unitcode/salary-components", ...anyAuth, async (req, res): Promise<void> => {
  const { unitcode } = req.params;
  const unit = await queryOne<Record<string, unknown>>(
    `SELECT * FROM "UNITMASTER" WHERE "unitcode" = $1`,
    [unitcode],
  );

  if (!unit) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  if (!isUnrestrictedRole(req.clientUser!.role)) {
    let allowed = await queryScalar<number>(
      `SELECT 1 FROM "USERUNIT" WHERE usercode = $1 AND compid = $2 AND unitcode = $3 AND is_active = TRUE`,
      [req.clientUser!.id, Number(unit.compcode), String(unit.unitcode)],
    );

    if (!allowed) {
      allowed = await queryScalar<number>(
        `SELECT 1
         FROM app_users au
         JOIN "EMPMAST" e ON e."EmpCode" = au.employee_code AND e."compid" = au.compid
         WHERE au.id = $1 AND au.employee_code IS NOT NULL
           AND e."compid" = $2 AND e."unitcode" = $3
         LIMIT 1`,
        [req.clientUser!.id, Number(unit.compcode), String(unit.unitcode)],
      );
    }

    if (!allowed) { res.status(403).json({ error: "Access denied: Client is outside your assigned scope" }); return; }
  }

  const config = salaryComponentsFromUnit(unit);
  res.json({
    source: "UNITMASTER",
    unitcode: String(unit.unitcode ?? unitcode),
    Unitname: unit.Unitname ?? null,
    configured: config.configured,
    components: config.components,
  });
});

export default router;
