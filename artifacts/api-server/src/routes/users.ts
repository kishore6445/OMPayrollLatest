/**
 * users.ts — User & Role management
 *
 * Tables: app_users, app_roles, app_permissions (payrollom_client)
 *
 * Routes:
 *   GET    /api/users                      — paginated list      (users:read)
 *   GET    /api/users/:id                  — user detail          (users:read)
 *   POST   /api/users                      — create user          (users:write)
 *   PATCH  /api/users/:id                  — edit name/email/role (users:write)
 *   POST   /api/users/:id/activate         — re-activate          (users:write)
 *   POST   /api/users/:id/deactivate       — soft-deactivate      (users:write)
 *   POST   /api/users/:id/reset-password   — admin password reset (users:write)
 *
 *   GET    /api/roles                      — list roles (any authenticated user)
 *   POST   /api/roles                      — create role + permissions (users:write)
 *   GET    /api/roles/:roleName/permissions — role permissions   (users:read)
 *   GET    /api/permissions               — all module:action pairs (any auth)
 *
 * Guard rules:
 *   - requireClientPermission bypasses for Admin role automatically
 *   - systemadmin (id=1) cannot be deactivated or have role changed by anyone
 *     except themselves
 *   - a user cannot deactivate their own account
 *   - a user cannot change their own role
 */

import { Router, type IRouter } from "express";
import {
  queryRows, queryOne, queryScalar, execute, withTransaction,
} from "@workspace/pg-client-db";
import {
  requireClientAuth,
  requirePasswordChanged,
  requireClientPermission,
  hashClientPassword,
} from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";

const router: IRouter = Router();

const canRead  = [requireClientAuth, requirePasswordChanged, requireClientPermission("users", "read")];
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("users", "write")];
const anyAuth  = [requireClientAuth, requirePasswordChanged];

// ── Validation helpers ────────────────────────────────────────────────────────

function validateUsername(u: string): string | null {
  const v = u.trim();
  if (v.length < 3)  return "Username must be at least 3 characters";
  if (v.length > 50) return "Username must be 50 characters or fewer";
  if (!/^[a-zA-Z0-9._@-]+$/.test(v))
    return "Username may only contain letters, digits, dots, @, hyphens, or underscores";
  return null;
}

function validatePassword(p: string): string | null {
  if (!p || p.length < 8)   return "Password must be at least 8 characters";
  if (p.length > 128)        return "Password must be 128 characters or fewer";
  return null;
}

function validateEmail(e: string): string | null {
  if (e.length > 100) return "Email must be 100 characters or fewer";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "Invalid email address";
  return null;
}


const EMPLOYEE_ROLE = "Employee";
const UNRESTRICTED_ROLES = new Set(["Admin", "Payroll Manager"]);
const usesManualScope = (role: string) => Boolean(role) && role !== EMPLOYEE_ROLE && !UNRESTRICTED_ROLES.has(role);

type UserScopePayload = {
  companies?: number[];
  branches?: { compid: number; branchcode: number }[];
  clients?: { compid: number; branchcode: number; clientcode: number }[];
  units?: { compid: number; unitcode: string }[];
};

type NormalizedUserScope = {
  companies: number[];
  branches: { compid: number; branchcode: number }[];
  clients: { compid: number; branchcode: number; clientcode: number }[];
  units: { compid: number; unitcode: string }[];
};

function normalizeUserScope(raw: unknown): { scope?: NormalizedUserScope; error?: string } {
  if (!raw || typeof raw !== "object") return { error: "Organization / Client scope is required" };
  const body = raw as UserScopePayload;
  const companies = body.companies ?? [];
  const branches = body.branches ?? [];
  const clients = body.clients ?? [];
  const units = body.units ?? [];
  if (!Array.isArray(companies) || !Array.isArray(branches) || !Array.isArray(clients) || !Array.isArray(units)) {
    return { error: "companies, branches, clients, and units must be arrays" };
  }
  const normalizedCompanies = Array.from(new Set(companies.map(Number)));
  if (normalizedCompanies.some((c) => !Number.isInteger(c) || c <= 0)) return { error: "Invalid Organization selection" };
  if (normalizedCompanies.length === 0) return { error: "Select at least one Organization" };
  const companySet = new Set(normalizedCompanies);
  const normalizedUnits = units.map((u) => ({ compid: Number(u.compid), unitcode: String(u.unitcode ?? "").trim() }));
  if (normalizedUnits.some((u) => !companySet.has(u.compid) || !u.unitcode)) {
    return { error: "Every selected Client must belong to one of the selected Organizations" };
  }
  const missing = normalizedCompanies.filter((compid) => !normalizedUnits.some((u) => u.compid === compid));
  if (missing.length) return { error: "Select at least one Client under each selected Organization" };
  return {
    scope: {
      companies: normalizedCompanies,
      branches: branches.map((b) => ({ compid: Number(b.compid), branchcode: Number(b.branchcode) })),
      clients: clients.map((c) => ({ compid: Number(c.compid), branchcode: Number(c.branchcode), clientcode: Number(c.clientcode) })),
      units: normalizedUnits,
    },
  };
}

async function replaceUserScopeTx(tx: import("pg").PoolClient, userId: number, actorId: number, scope: NormalizedUserScope) {
  for (const compid of scope.companies) {
    const org = await tx.query(`SELECT 1 FROM "COMPANYMAST" WHERE "compid"=$1`, [compid]);
    if (org.rowCount === 0) throw new Error(`Organization ${compid} does not exist`);
  }
  for (const u of scope.units) {
    const unit = await tx.query(`SELECT 1 FROM "UNITMASTER" WHERE "unitcode"=$1 AND "compcode"=$2`, [u.unitcode, u.compid]);
    if (unit.rowCount === 0) throw new Error(`Client ${u.unitcode} does not belong to Organization ${u.compid}`);
  }

  await tx.query(`DELETE FROM "USERCOMPANY" WHERE usercode=$1`, [userId]);
  for (const compid of scope.companies) {
    await tx.query(`INSERT INTO "USERCOMPANY" (usercode, compids) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, compid]);
  }

  await tx.query(`UPDATE "USERBRANCH" SET is_active=FALSE, updated_by=$1, updated_at=NOW() WHERE usercode=$2`, [actorId, userId]);
  for (const b of scope.branches) {
    await tx.query(`INSERT INTO "USERBRANCH" (usercode, compid, branchcode, is_active, created_by)
                    VALUES ($1,$2,$3,TRUE,$4)
                    ON CONFLICT (usercode, compid, branchcode)
                    DO UPDATE SET is_active=TRUE, updated_by=$4, updated_at=NOW()`, [userId, b.compid, b.branchcode, actorId]);
  }

  await tx.query(`UPDATE "USERCLIENT" SET is_active=FALSE, updated_by=$1, updated_at=NOW() WHERE usercode=$2`, [actorId, userId]);
  for (const c of scope.clients) {
    await tx.query(`INSERT INTO "USERCLIENT" (usercode, compid, branchcode, clientcode, is_active, created_by)
                    VALUES ($1,$2,$3,$4,TRUE,$5)
                    ON CONFLICT (usercode, compid, branchcode, clientcode)
                    DO UPDATE SET is_active=TRUE, updated_by=$5, updated_at=NOW()`, [userId, c.compid, c.branchcode, c.clientcode, actorId]);
  }

  await tx.query(`UPDATE "USERUNIT" SET is_active=FALSE, updated_by=$1, updated_at=NOW() WHERE usercode=$2`, [actorId, userId]);
  for (const u of scope.units) {
    await tx.query(`INSERT INTO "USERUNIT" (usercode, compid, unitcode, is_active, created_by)
                    VALUES ($1,$2,$3,TRUE,$4)
                    ON CONFLICT (usercode, compid, unitcode)
                    DO UPDATE SET is_active=TRUE, updated_by=$4, updated_at=NOW()`, [userId, u.compid, u.unitcode, actorId]);
  }
}

// ── Safe user row (no password_hash) ─────────────────────────────────────────
const SAFE_COLS = `
  u.id, u.username, u.full_name, u.email, u.role,
  u.employee_code, u.compid,
  u.is_active, u.must_change_password,
  u.created_at, u.last_login, u.created_by
`;

// Extra organisational labels used by the User Management list.
// Explicit scope mappings win. For migrated users that are still linked to EMPMAST,
// fall back to their existing employee Organization / Unit context even after their
// app role changes from Employee to an operational role such as HR Manager.
const USER_LIST_SCOPE_COLS = `
  COALESCE(scoped.company_names, CASE WHEN NULLIF(BTRIM(emp_company."corpID"), '') IS NOT NULL
       THEN CONCAT_WS(' — ', emp_company."comname", NULLIF(BTRIM(emp_company."corpID"), ''))
       ELSE emp_company."comname" END) AS company_display,
  COALESCE(scoped.client_names, emp_unit."Unitname") AS client_display,
  COALESCE(scoped.branch_names, emp_branch."BranchName") AS branch_display,
  CASE WHEN scoped.client_names IS NULL THEN emp."unitcode"::text ELSE NULL END AS unit_display
`;

const USER_LIST_SCOPE_JOINS = `
  LEFT JOIN "EMPMAST" emp
    ON emp."EmpCode" = u.employee_code
   AND emp."compid" = u.compid
  LEFT JOIN "COMPANYMAST" emp_company
    ON emp_company."compid" = emp."compid"
  LEFT JOIN "UNITMASTER" emp_unit
    ON emp_unit."unitcode" = emp."unitcode"
   AND emp_unit."compcode" = emp."compid"
  LEFT JOIN "BRANCH" emp_branch
    ON emp_branch."BranchCode" = emp."branchcode"
   AND emp_branch."compid" = emp."compid"
  LEFT JOIN LATERAL (
    SELECT
      string_agg(DISTINCT CASE WHEN NULLIF(BTRIM(cm."corpID"), '') IS NOT NULL
                 THEN CONCAT_WS(' — ', cm."comname", NULLIF(BTRIM(cm."corpID"), ''))
                 ELSE cm."comname" END, ', ' ORDER BY CASE WHEN NULLIF(BTRIM(cm."corpID"), '') IS NOT NULL
                 THEN CONCAT_WS(' — ', cm."comname", NULLIF(BTRIM(cm."corpID"), ''))
                 ELSE cm."comname" END) AS company_names,
      string_agg(DISTINCT um."Unitname", ', ' ORDER BY um."Unitname") AS client_names,
      NULL::text AS branch_names
    FROM "USERUNIT" uu
    LEFT JOIN "COMPANYMAST" cm ON cm."compid" = uu.compid
    LEFT JOIN "UNITMASTER" um ON um."unitcode" = uu.unitcode AND um."compcode" = uu.compid
    WHERE uu.usercode = u.id AND uu.is_active = TRUE
  ) scoped ON TRUE
`;

// ── GET /api/users/employee-options ──────────────────────────────────────────
// Lightweight employee lookup used while creating Employee login accounts.
// The login mapping is always the composite key (compid, EmpCode).
router.get("/users/employee-options", ...canRead, async (req, res): Promise<void> => {
  const search = String(req.query.search ?? "").trim();
  const compid = req.query.compid ? parseInt(String(req.query.compid), 10) : null;
  if (compid !== null && Number.isNaN(compid)) {
    res.status(400).json({ error: "compid must be an integer" });
    return;
  }

  const params: unknown[] = [];
  const conds: string[] = [];
  if (search) {
    params.push(`%${search}%`);
    conds.push(`(e."EmpCode" ILIKE $${params.length} OR e."EmpName" ILIKE $${params.length})`);
  }
  if (compid !== null) {
    params.push(compid);
    conds.push(`e."compid" = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const rows = await queryRows<Record<string, unknown>>(
    `SELECT e."EmpCode", e."EmpName", e."compid", e."clientcode", e."branchcode", e."unitcode",
            c."Clientname", b."BranchName", cm."comname",
            EXISTS (
              SELECT 1 FROM app_users au
              WHERE au.role = 'Employee'
                AND au.employee_code = e."EmpCode"
                AND au.compid = e."compid"
            ) AS has_login
     FROM "EMPMAST" e
     LEFT JOIN "CLIENTMASTER" c ON c."clientcode" = e."clientcode" AND c."compid" = e."compid"
     LEFT JOIN "BRANCH" b ON b."BranchCode" = e."branchcode" AND b."compid" = e."compid"
     LEFT JOIN "COMPANYMAST" cm ON cm."compid" = e."compid"
     ${where}
     ORDER BY e."EmpName", e."EmpCode"
     LIMIT 50`,
    params,
  );
  res.json(rows);
});

// ── GET /api/users ─────────────────────────────────────────────────────────────
router.get("/users", ...canRead, async (req, res): Promise<void> => {
  const {
    search, page: pg, pageSize: ps,
    role: roleFilter, active: activeFilter,
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(pg  ?? "1",  10));
  const pageSz  = Math.min(200, Math.max(1, parseInt(ps ?? "50", 10)));
  const offset  = (pageNum - 1) * pageSz;

  const conds: string[] = [];
  const params: unknown[] = [];

  if (search?.trim()) {
    params.push(`%${search.trim()}%`);
    conds.push(`(u.username ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  if (roleFilter?.trim()) {
    params.push(roleFilter.trim());
    conds.push(`u.role = $${params.length}`);
  }
  if (activeFilter === "true"  ) conds.push(`u.is_active = TRUE`);
  if (activeFilter === "false" ) conds.push(`u.is_active = FALSE`);

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const [rows, total] = await Promise.all([
    queryRows<Record<string, unknown>>(
      `SELECT ${SAFE_COLS}, ${USER_LIST_SCOPE_COLS}
       FROM app_users u
       ${USER_LIST_SCOPE_JOINS}
       ${where}
       ORDER BY u.full_name, u.username
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSz, offset]
    ),
    queryScalar<string>(
      `SELECT COUNT(*) FROM app_users u ${where}`, params
    ),
  ]);

  res.json({
    data:     rows,
    total:    parseInt(total ?? "0", 10),
    page:     pageNum,
    pageSize: pageSz,
  });
});

// ── GET /api/users/:id ────────────────────────────────────────────────────────
router.get("/users/:id", ...canRead, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${SAFE_COLS} FROM app_users u WHERE u.id = $1`, [id]
  );
  if (!row) { res.status(404).json({ error: "User not found" }); return; }
  res.json(row);
});

// ── POST /api/users ───────────────────────────────────────────────────────────
router.post("/users", ...canWrite, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const actor = req.clientUser!;

  const username   = String(body.username  ?? "").trim();
  const full_name  = String(body.full_name ?? "").trim();
  const email      = body.email ? String(body.email).trim() : null;
  const role       = String(body.role      ?? "").trim();
  const password   = String(body.password  ?? "");
  const employeeCode = body.employee_code ? String(body.employee_code).trim() : null;
  const employeeCompid = body.compid !== undefined && body.compid !== null
    ? Number(body.compid)
    : null;

  // Field validation
  if (!full_name) { res.status(400).json({ error: "full_name is required" }); return; }
  if (full_name.length > 100) { res.status(400).json({ error: "full_name must be 100 characters or fewer" }); return; }

  const unErr = validateUsername(username);
  if (unErr) { res.status(400).json({ error: unErr }); return; }

  const pwErr = validatePassword(password);
  if (pwErr) { res.status(400).json({ error: pwErr }); return; }

  if (email) {
    const emailErr = validateEmail(email);
    if (emailErr) { res.status(400).json({ error: emailErr }); return; }
  }

  if (!role) { res.status(400).json({ error: "role is required" }); return; }

  // Role must exist
  const roleRow = await queryOne(
    `SELECT role_name FROM app_roles WHERE role_name = $1`, [role]
  );
  if (!roleRow) { res.status(400).json({ error: `Role '${role}' does not exist` }); return; }

  // Employee users must be tied to exactly one EMPMAST row. Client/branch/unit
  // are intentionally NOT stored separately on app_users; they are derived from
  // EMPMAST using this composite key at runtime.
  if (role === "Employee") {
    if (!employeeCode || employeeCompid === null || !Number.isInteger(employeeCompid)) {
      res.status(400).json({ error: "Employee role requires employee_code and compid" });
      return;
    }
    const emp = await queryOne(
      `SELECT 1 FROM "EMPMAST" WHERE "EmpCode" = $1 AND "compid" = $2`,
      [employeeCode, employeeCompid],
    );
    if (!emp) {
      res.status(400).json({ error: "Selected employee was not found in EMPMAST" });
      return;
    }
    const existingEmployeeLogin = await queryScalar(
      `SELECT 1 FROM app_users
       WHERE role = 'Employee' AND employee_code = $1 AND compid = $2`,
      [employeeCode, employeeCompid],
    );
    if (existingEmployeeLogin) {
      res.status(409).json({ error: `Employee '${employeeCode}' already has a login` });
      return;
    }
  }

  // Username uniqueness
  const dupUser = await queryScalar(
    `SELECT 1 FROM app_users WHERE LOWER(username) = LOWER($1)`, [username]
  );
  if (dupUser) { res.status(409).json({ error: `Username '${username}' already exists` }); return; }

  // Email uniqueness (if provided)
  if (email) {
    const dupEmail = await queryScalar(
      `SELECT 1 FROM app_users WHERE LOWER(email) = LOWER($1)`, [email]
    );
    if (dupEmail) { res.status(409).json({ error: `Email '${email}' is already in use` }); return; }
  }

  let normalizedScope: NormalizedUserScope | undefined;
  if (usesManualScope(role)) {
    const parsed = normalizeUserScope(body.scope);
    if (parsed.error || !parsed.scope) { res.status(400).json({ error: parsed.error ?? "Invalid Organization / Client scope" }); return; }
    normalizedScope = parsed.scope;
  }

  const passwordHash = await hashClientPassword(password);
  const nextId = await withTransaction(async (tx) => {
    // Keep MAX(id)+1 safe from concurrent user creation.
    await tx.query(`LOCK TABLE app_users IN EXCLUSIVE MODE`);
    const nextResult = await tx.query<{ id: number }>(`SELECT COALESCE(MAX(id), 100) + 1 AS id FROM app_users`);
    const id = Number(nextResult.rows[0]?.id ?? 101);
    await tx.query(
      `INSERT INTO app_users
         (id, username, password_hash, full_name, email, role, employee_code, compid,
          is_active, must_change_password, created_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,TRUE,NOW(),$9)`,
      [id, username, passwordHash, full_name, email, role,
       role === EMPLOYEE_ROLE ? employeeCode : null,
       role === EMPLOYEE_ROLE ? employeeCompid : null,
       actor.id]
    );
    if (normalizedScope) await replaceUserScopeTx(tx, id, actor.id, normalizedScope);
    return id;
  });

  await logClientAction(actor.id, "user.create", {
    targetId: nextId, username, role,
    scopeSaved: Boolean(normalizedScope),
  });

  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${SAFE_COLS} FROM app_users u WHERE u.id = $1`, [nextId]
  );
  res.status(201).json(row ?? { id: nextId, username });
});

// ── PATCH /api/users/:id ──────────────────────────────────────────────────────
router.patch("/users/:id", ...canWrite, async (req, res): Promise<void> => {
  const id    = parseInt(req.params.id as string, 10);
  const body  = req.body as Record<string, unknown>;
  const actor = req.clientUser!;

  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const existing = await queryOne<{ id: number; username: string; role: string; is_active: boolean }>(
    `SELECT id, username, role, is_active FROM app_users WHERE id = $1`, [id]
  );
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }

  // Protect systemadmin from edits by other admins
  if (id === 1 && actor.id !== 1) {
    res.status(403).json({ error: "The systemadmin account can only be edited by itself" });
    return;
  }

  // Cannot change own role
  if (id === actor.id && body.role !== undefined && body.role !== existing.role) {
    res.status(400).json({ error: "You cannot change your own role" });
    return;
  }

  const setCols: string[] = [];
  const vals:    unknown[] = [];
  let   idx = 1;

  if (body.full_name !== undefined) {
    const fn = String(body.full_name).trim();
    if (!fn) { res.status(400).json({ error: "full_name cannot be empty" }); return; }
    if (fn.length > 100) { res.status(400).json({ error: "full_name must be 100 characters or fewer" }); return; }
    setCols.push(`full_name = $${idx}`); vals.push(fn); idx++;
  }

  if (body.email !== undefined) {
    const e = body.email ? String(body.email).trim() : null;
    if (e) {
      const emailErr = validateEmail(e);
      if (emailErr) { res.status(400).json({ error: emailErr }); return; }
      // Uniqueness excluding self
      const dup = await queryScalar(
        `SELECT 1 FROM app_users WHERE LOWER(email) = LOWER($1) AND id <> $2`, [e, id]
      );
      if (dup) { res.status(409).json({ error: `Email '${e}' is already in use` }); return; }
    }
    setCols.push(`email = $${idx}`); vals.push(e); idx++;
  }

  if (body.role !== undefined) {
    const newRole = String(body.role).trim();
    if (!newRole) { res.status(400).json({ error: "role cannot be empty" }); return; }
    const roleRow = await queryOne(`SELECT role_name FROM app_roles WHERE role_name = $1`, [newRole]);
    if (!roleRow) { res.status(400).json({ error: `Role '${newRole}' does not exist` }); return; }
    if (newRole === "Employee" && existing.role !== "Employee") {
      res.status(400).json({
        error: "To create an Employee login, use Add User and select the employee from EMPMAST so the account is mapped safely",
      });
      return;
    }
    setCols.push(`role = $${idx}`); vals.push(newRole); idx++;
  }

  const resultingRole = body.role !== undefined ? String(body.role).trim() : existing.role;
  let normalizedScope: NormalizedUserScope | undefined;
  if (body.scope !== undefined) {
    if (!usesManualScope(resultingRole)) {
      res.status(400).json({ error: "Organization / Client scope can only be saved for scoped operational roles" });
      return;
    }
    const parsed = normalizeUserScope(body.scope);
    if (parsed.error || !parsed.scope) { res.status(400).json({ error: parsed.error ?? "Invalid Organization / Client scope" }); return; }
    normalizedScope = parsed.scope;
  }

  if (setCols.length === 0 && !normalizedScope) {
    res.status(400).json({ error: "No updatable fields provided (full_name, email, role, scope)" });
    return;
  }

  await withTransaction(async (tx) => {
    if (setCols.length > 0) {
      const txVals = [...vals, id];
      await tx.query(`UPDATE app_users SET ${setCols.join(", ")} WHERE id = $${idx}`, txVals);
    }
    if (normalizedScope) await replaceUserScopeTx(tx, id, actor.id, normalizedScope);
  });

  await logClientAction(actor.id, "user.update", {
    targetId: id,
    targetUsername: existing.username,
    fields: Object.keys(body).filter((k) => k !== "password"),
    scopeSaved: Boolean(normalizedScope),
  });

  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${SAFE_COLS} FROM app_users u WHERE u.id = $1`, [id]
  );
  res.json(row ?? { id });
});

// ── POST /api/users/:id/activate ─────────────────────────────────────────────
router.post("/users/:id/activate", ...canWrite, async (req, res): Promise<void> => {
  const id    = parseInt(req.params.id as string, 10);
  const actor = req.clientUser!;
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const existing = await queryOne<{ id: number; username: string; is_active: boolean }>(
    `SELECT id, username, is_active FROM app_users WHERE id = $1`, [id]
  );
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }
  if (existing.is_active) { res.status(400).json({ error: "User is already active" }); return; }

  await execute(`UPDATE app_users SET is_active = TRUE WHERE id = $1`, [id]);
  await logClientAction(actor.id, "user.activate", {
    targetId: id, targetUsername: existing.username,
  });

  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${SAFE_COLS} FROM app_users u WHERE u.id = $1`, [id]
  );
  res.json(row ?? { id });
});

// ── POST /api/users/:id/deactivate ───────────────────────────────────────────
router.post("/users/:id/deactivate", ...canWrite, async (req, res): Promise<void> => {
  const id    = parseInt(req.params.id as string, 10);
  const actor = req.clientUser!;
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  if (id === actor.id) {
    res.status(400).json({ error: "You cannot deactivate your own account" });
    return;
  }
  if (id === 1) {
    res.status(400).json({ error: "The systemadmin account cannot be deactivated" });
    return;
  }

  const existing = await queryOne<{ id: number; username: string; is_active: boolean }>(
    `SELECT id, username, is_active FROM app_users WHERE id = $1`, [id]
  );
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }
  if (!existing.is_active) { res.status(400).json({ error: "User is already inactive" }); return; }

  await execute(`UPDATE app_users SET is_active = FALSE WHERE id = $1`, [id]);
  await logClientAction(actor.id, "user.deactivate", {
    targetId: id, targetUsername: existing.username,
  });

  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${SAFE_COLS} FROM app_users u WHERE u.id = $1`, [id]
  );
  res.json(row ?? { id });
});

// ── POST /api/users/:id/reset-password ───────────────────────────────────────
router.post("/users/:id/reset-password", ...canWrite, async (req, res): Promise<void> => {
  const id    = parseInt(req.params.id as string, 10);
  const body  = req.body as Record<string, unknown>;
  const actor = req.clientUser!;
  if (isNaN(id)) { res.status(400).json({ error: "Invalid user id" }); return; }

  if (id === 1 && actor.id !== 1) {
    res.status(403).json({ error: "systemadmin's password can only be reset by itself" });
    return;
  }

  const existing = await queryOne<{ id: number; username: string }>(
    `SELECT id, username FROM app_users WHERE id = $1`, [id]
  );
  if (!existing) { res.status(404).json({ error: "User not found" }); return; }

  const newPassword = String(body.newPassword ?? "");
  const pwErr = validatePassword(newPassword);
  if (pwErr) { res.status(400).json({ error: pwErr }); return; }

  const hash = await hashClientPassword(newPassword);
  await execute(
    `UPDATE app_users SET password_hash = $1, must_change_password = TRUE WHERE id = $2`,
    [hash, id]
  );

  await logClientAction(actor.id, "user.reset_password", {
    targetId: id, targetUsername: existing.username,
  });

  res.json({ success: true, mustChangePassword: true, id });
});

// ── POST /api/roles ────────────────────────────────────────────────────────────
// Creates a custom application role and its permission set in one transaction.
// Existing seeded roles are left untouched. users:write (or Admin bypass) is required.
router.post("/roles", ...canWrite, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const roleName = String(body.roleName ?? body.role_name ?? "").trim();
  const descriptionRaw = body.description == null ? "" : String(body.description).trim();
  const permissionsRaw = Array.isArray(body.permissions) ? body.permissions : [];

  if (roleName.length < 2 || roleName.length > 50) {
    res.status(400).json({ error: "Role name must be between 2 and 50 characters" });
    return;
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 &()/_-]*$/.test(roleName)) {
    res.status(400).json({ error: "Role name contains unsupported characters" });
    return;
  }
  if (descriptionRaw.length > 250) {
    res.status(400).json({ error: "Description must be 250 characters or fewer" });
    return;
  }

  const requested = permissionsRaw
    .map((p: any) => ({ module: String(p?.module ?? "").trim(), action: String(p?.action ?? "").trim() }))
    .filter((p: { module: string; action: string }) => p.module && p.action);

  // Deduplicate module/action pairs supplied by the UI.
  const deduped = Array.from(
    new Map(requested.map((p: { module: string; action: string }) => [`${p.module}:${p.action}`, p])).values()
  );

  if (deduped.length === 0) {
    res.status(400).json({ error: "Select at least one permission for the role" });
    return;
  }

  const existing = await queryOne<{ role_name: string }>(
    `SELECT role_name FROM app_roles WHERE LOWER(role_name) = LOWER($1) LIMIT 1`,
    [roleName]
  );
  if (existing) {
    res.status(409).json({ error: `Role '${existing.role_name}' already exists` });
    return;
  }

  // app_permissions already contains the canonical module/action vocabulary via
  // the seeded Admin role. Reject invented permission names.
  const allowedPairs = await queryRows<{ module: string; action: string }>(
    `SELECT DISTINCT module, action FROM app_permissions ORDER BY module, action`
  );
  const allowed = new Set(allowedPairs.map((p) => `${p.module}:${p.action}`));
  const invalid = deduped.find((p) => !allowed.has(`${p.module}:${p.action}`));
  if (invalid) {
    res.status(400).json({ error: `Unknown permission: ${invalid.module}:${invalid.action}` });
    return;
  }

  const actor = req.clientUser!;
  try {
    const created = await withTransaction(async (client) => {
      // The legacy app_roles table is not guaranteed to use an identity/serial
      // column, so allocate the next id under a table lock to avoid collisions.
      await client.query(`LOCK TABLE app_roles IN EXCLUSIVE MODE`);
      const duplicate = await client.query(
        `SELECT role_name FROM app_roles WHERE LOWER(role_name) = LOWER($1) LIMIT 1`,
        [roleName]
      );
      if (duplicate.rowCount) {
        const err = new Error("ROLE_EXISTS") as Error & { code?: string };
        err.code = "ROLE_EXISTS";
        throw err;
      }

      const idRow = await client.query<{ next_id: number }>(
        `SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM app_roles`
      );
      const nextId = Number(idRow.rows[0]?.next_id ?? 1);
      await client.query(
        `INSERT INTO app_roles (id, role_name, description, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [nextId, roleName, descriptionRaw || null]
      );

      for (const perm of deduped) {
        await client.query(
          `INSERT INTO app_permissions (role_name, module, action, allowed)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT DO NOTHING`,
          [roleName, perm.module, perm.action]
        );
      }

      return { id: nextId, role_name: roleName, description: descriptionRaw || null };
    });

    await logClientAction(actor.id, "role.create", {
      roleName,
      permissionCount: deduped.length,
      permissions: deduped.map((p) => `${p.module}:${p.action}`),
    });

    res.status(201).json({ ...created, permissions: deduped });
  } catch (err: any) {
    if (err?.code === "ROLE_EXISTS" || err?.code === "23505") {
      res.status(409).json({ error: `Role '${roleName}' already exists` });
      return;
    }
    throw err;
  }
});

// ── GET /api/roles ─────────────────────────────────────────────────────────────
router.get("/roles", ...anyAuth, async (_req, res): Promise<void> => {
  const rows = await queryRows<{ id: number; role_name: string; description: string | null }>(
    `SELECT DISTINCT ON (role_name) id, role_name, description
     FROM app_roles
     ORDER BY role_name, id`
  );
  res.json(rows);
});

// ── GET /api/roles/:roleName/permissions ──────────────────────────────────────
router.get("/roles/:roleName/permissions", ...canRead, async (req, res): Promise<void> => {
  const roleName = decodeURIComponent(req.params.roleName as string);
  const role = await queryOne<{ role_name: string }>(
    `SELECT role_name FROM app_roles WHERE role_name = $1 LIMIT 1`, [roleName]
  );
  if (!role) { res.status(404).json({ error: "Role not found" }); return; }

  const perms = await queryRows<{ module: string; action: string; allowed: boolean }>(
    `SELECT module, action, allowed
     FROM app_permissions
     WHERE role_name = $1 AND allowed = TRUE
     ORDER BY module, action`,
    [roleName]
  );
  res.json({ roleName, permissions: perms });
});

// ── GET /api/permissions ───────────────────────────────────────────────────────
router.get("/permissions", ...anyAuth, async (_req, res): Promise<void> => {
  const rows = await queryRows(
    `SELECT DISTINCT module, action FROM app_permissions WHERE allowed = TRUE ORDER BY module, action`
  );
  res.json(rows);
});

export default router;
