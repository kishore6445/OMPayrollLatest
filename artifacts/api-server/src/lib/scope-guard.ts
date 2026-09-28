/**
 * scope-guard.ts — HR Manager organisational scope helpers
 *
 * Scope tables (payrollom_client):
 *   USERCOMPANY  usercode + compids          (existing; no is_active column)
 *   USERBRANCH   usercode + compid + branchcode
 *   USERCLIENT   usercode + compid + branchcode + clientcode
 *
 * Unrestricted roles (Admin, Payroll Manager) bypass all scope checks.
 * All other roles are subject to scope enforcement.
 *
 * User identifier: app_users.id  =  USERCOMPANY.usercode (both INTEGER)
 */

import { type Request, type Response } from "express";
import { queryRows } from "@workspace/pg-client-db";
import { logClientAction } from "./client-audit.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserScope {
  isUnrestricted: boolean;
  companies: number[];
  branches:  Array<{ compid: number; branchcode: number }>;
  clients:   Array<{ compid: number; branchcode: number; clientcode: number }>;
  units:     Array<{ compid: number; unitcode: string }>;
}

// ── Role check ────────────────────────────────────────────────────────────────

const UNRESTRICTED_ROLES = new Set(["Admin", "Payroll Manager"]);

export function isUnrestrictedRole(role: string): boolean {
  return UNRESTRICTED_ROLES.has(role);
}

// ── Load scope from DB ────────────────────────────────────────────────────────

/**
 * Load the full scope record for a user.
 * Returns isUnrestricted=true for Admin/Payroll Manager (no DB queries).
 */
export async function loadUserScope(
  usercode: number,
  role: string,
): Promise<UserScope> {
  if (isUnrestrictedRole(role)) {
    return { isUnrestricted: true, companies: [], branches: [], clients: [], units: [] };
  }

  const [compRows, branchRows, clientRows, unitRows] = await Promise.all([
    queryRows<{ compids: number }>(
      `SELECT compids FROM "USERCOMPANY" WHERE usercode = $1`,
      [usercode],
    ),
    queryRows<{ compid: number; branchcode: number }>(
      `SELECT compid, branchcode FROM "USERBRANCH"
       WHERE usercode = $1 AND is_active = TRUE`,
      [usercode],
    ),
    queryRows<{ compid: number; branchcode: number; clientcode: number }>(
      `SELECT compid, branchcode, clientcode FROM "USERCLIENT"
       WHERE usercode = $1 AND is_active = TRUE`,
      [usercode],
    ),
    queryRows<{ compid: number; unitcode: string }>(
      `SELECT compid, unitcode FROM "USERUNIT" WHERE usercode = $1 AND is_active = TRUE`,
      [usercode],
    ),
  ]);

  // Migrated users were originally linked to EMPMAST through
  // app_users.employee_code + compid, but they may not yet have explicit scope
  // rows. If such a user's role is later changed to HR Manager (or another
  // restricted operational role), preserve that existing assignment as a
  // safe fallback. Explicit scope rows always win.
  let companies = compRows.map((r) => r.compids);
  let branches = branchRows;
  let clients = clientRows;
  let units = unitRows;

  if (companies.length === 0 && units.length === 0) {
    const fallbackRows = await queryRows<{
      compid: number;
      branchcode: number | null;
      clientcode: number | null;
      unitcode: string | null;
    }>(
      `SELECT au.compid, e."branchcode", e."clientcode", e."unitcode"
       FROM app_users au
       LEFT JOIN "EMPMAST" e
         ON e."EmpCode" = au.employee_code AND e."compid" = au.compid
       WHERE au.id = $1 AND au.compid IS NOT NULL
       LIMIT 1`,
      [usercode],
    );

    const fb = fallbackRows[0];
    if (fb?.compid != null) {
      companies = [fb.compid];
      if (fb.branchcode != null) branches = [{ compid: fb.compid, branchcode: fb.branchcode }];
      if (fb.clientcode != null && fb.branchcode != null) {
        clients = [{ compid: fb.compid, branchcode: fb.branchcode, clientcode: fb.clientcode }];
      }
      if (fb.unitcode) units = [{ compid: fb.compid, unitcode: fb.unitcode }];
    }
  }

  return {
    isUnrestricted: false,
    companies,
    branches,
    clients,
    units,
  };
}

// ── Scope check helpers ───────────────────────────────────────────────────────

export function isInScope(
  scope:      UserScope,
  compid:     number,
  branchcode?: number,
  clientcode?: number,
  unitcode?: string,
): boolean {
  if (scope.isUnrestricted) return true;

  if (!scope.companies.includes(compid)) return false;

  // When a business Client (UNITMASTER.unitcode) is supplied, USERUNIT is the
  // authoritative scope. Legacy Branch/CLIENTMASTER mappings must not block it.
  if (unitcode !== undefined) {
    const hasUnit = scope.units.some((u) => u.compid === compid && u.unitcode === unitcode);
    if (!hasUnit) return false;
    return true;
  }

  if (branchcode !== undefined && scope.branches.length > 0) {
    const hasBranch = scope.branches.some(
      (b) => b.compid === compid && b.branchcode === branchcode,
    );
    if (!hasBranch) return false;
  }

  if (clientcode !== undefined && scope.clients.length > 0) {
    const hasClient = scope.clients.some((c) => c.compid === compid && c.clientcode === clientcode);
    if (!hasClient) return false;
  }

  return true;
}

// ── Worker scope assertion ────────────────────────────────────────────────────

/**
 * Assert that the current user can access a specific worker resource.
 * Sends 403 and returns false when out of scope.
 * Returns true when access is allowed (and does not send a response).
 */
export async function assertWorkerScope(
  req:        Request,
  res:        Response,
  compid:     number,
  branchcode: number | undefined,
  clientcode: number | undefined,
  unitcode?: string,
): Promise<boolean> {
  const user = req.clientUser!;
  if (isUnrestrictedRole(user.role)) return true;

  const scope = await loadUserScope(user.id, user.role);
  if (isInScope(scope, compid, branchcode, clientcode, unitcode)) return true;

  // Out of scope — audit and reject
  await logClientAction(user.id, "scope.unauthorized_access_attempt", {
    requestedCompid:     compid,
    requestedBranchcode: branchcode,
    requestedClientcode: clientcode,
    requestedUnitcode:   unitcode,
  });
  res.status(403).json({
    error: "Access denied: resource is outside your assigned scope",
  });
  return false;
}

// ── List filter helper ────────────────────────────────────────────────────────

/**
 * Build extra WHERE conditions for an EMPMAST list query, enforcing the
 * user's assigned company/client scope. Returns empty arrays for unrestricted
 * roles. Employee self-service is handled separately by employee identity.
 *
 * Caller must use the returned params array (it may have grown).
 */
export async function buildWorkerScopeFilter(
  usercode:       number,
  role:           string,
  existingParams: unknown[],
): Promise<{ extraConds: string[]; params: unknown[] }> {
  if (isUnrestrictedRole(role)) {
    return { extraConds: [], params: existingParams };
  }

  const scope = await loadUserScope(usercode, role);
  const p     = [...existingParams];
  const conds: string[] = [];

  if (scope.companies.length === 0) {
    // No company scope assigned — return zero rows
    conds.push("FALSE");
    return { extraConds: conds, params: p };
  }

  p.push(scope.companies);
  conds.push(`e."compid" = ANY($${p.length})`);

  // Business Client access is enforced using USERUNIT because Employee onboarding
  // stores the selected Client in EMPMAST.unitcode.
  if (scope.units.length === 0) {
    conds.push("FALSE");
    return { extraConds: conds, params: p };
  }

  const pairConds: string[] = [];
  for (const u of scope.units) {
    p.push(u.compid);
    const compParam = p.length;
    p.push(u.unitcode);
    const unitParam = p.length;
    pairConds.push(`(e."compid" = $${compParam} AND e."unitcode" = $${unitParam})`);
  }
  conds.push(`(${pairConds.join(" OR ")})`);

  return { extraConds: conds, params: p };
}
