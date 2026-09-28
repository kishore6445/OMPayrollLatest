/**
 * masters.ts — Reference/lookup master data routes
 * Source tables in payrollom_client:
 *   DESIGNATIONMASTER, DEPTMAST, GRADEMASTER, categorymaster, BANKMASTER
 *   COMPANYMAST, CLIENTMASTER, UNITMASTER, BRANCH   (assignment lookups)
 *
 * These are read-only reference lists used to populate dropdowns and
 * decode FK values on employee records.
 *
 * All routes require only requireClientAuth + requirePasswordChanged.
 * No module-level RBAC permission is enforced here — these are reference
 * lookups that any authenticated user (e.g. workers:write) must be able
 * to read in order to fill in employee assignment fields.
 */

import { Router, type IRouter } from "express";
import { queryRows } from "@workspace/pg-client-db";
import { requireClientAuth, requirePasswordChanged } from "../lib/client-auth.js";

const router: IRouter = Router();

// GET /api/masters/designations
router.get("/masters/designations", requireClientAuth, requirePasswordChanged, async (_req, res): Promise<void> => {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT "DESICODE","DESINAME","DispDesig","DUTYHRS","DESC", COALESCE("is_active", TRUE) AS "is_active"
     FROM "DESIGNATIONMASTER" ORDER BY "DESINAME"`
  );
  res.json(rows);
});

// GET /api/masters/departments
router.get("/masters/departments", requireClientAuth, requirePasswordChanged, async (_req, res): Promise<void> => {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT "deptcode","Deptname","desc" FROM "DEPTMAST" ORDER BY "Deptname"`
  );
  res.json(rows);
});

// GET /api/masters/grades
router.get("/masters/grades", requireClientAuth, requirePasswordChanged, async (_req, res): Promise<void> => {
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT "GradeCode","GradeName","HraRate","GradeRemark"
     FROM "GRADEMASTER" ORDER BY "GradeName"`
  );
  res.json(rows);
});

// GET /api/masters/categories?compid=
router.get("/masters/categories", requireClientAuth, requirePasswordChanged, async (req, res): Promise<void> => {
  const { compid } = req.query as Record<string, string>;
  const rows = await queryRows<Record<string, unknown>>(
    compid
      ? `SELECT "catcode","catname","catdescription","compid" FROM "categorymaster" WHERE "compid" = $1::text ORDER BY "catname","catcode"`
      : `SELECT "catcode","catname","catdescription","compid" FROM "categorymaster" ORDER BY "catname","catcode"`,
    compid ? [compid] : []
  );
  res.json(rows);
});

// ── Assignment lookup endpoints ────────────────────────────────────────────────
// These return only the columns needed for dropdown population.
// No RBAC permission guard — any authenticated, password-changed user may read.

// GET /api/masters/companies — company dropdown options with a human-readable unique label
router.get("/masters/companies", requireClientAuth, requirePasswordChanged, async (_req, res): Promise<void> => {
  const rows = await queryRows<{ compid: number; comname: string; city: string | null; state: string | null; corpID: string | null; orgCode: string; displayLabel: string }>(
    `SELECT "compid", "comname", "city", "state", "corpID",
            NULLIF(BTRIM("corpID"), '') AS "orgCode",
            CASE
              WHEN NULLIF(BTRIM("corpID"), '') IS NOT NULL
                THEN CONCAT_WS(' — ', NULLIF(BTRIM("comname"), ''), NULLIF(BTRIM("corpID"), ''))
              ELSE NULLIF(BTRIM("comname"), '')
            END AS "displayLabel"
       FROM "COMPANYMAST"
      ORDER BY "comname", "compid"`
  );
  res.json(rows);
});

// GET /api/masters/clients?compid=<id> — [{clientcode, Clientname, compid}]
router.get("/masters/clients", requireClientAuth, requirePasswordChanged, async (req, res): Promise<void> => {
  const { compid } = req.query as Record<string, string>;
  const rows = await queryRows<{ clientcode: number; Clientname: string; compid: number }>(
    compid
      ? `SELECT "clientcode", "Clientname", "compid"
         FROM "CLIENTMASTER"
         WHERE "compid" = $1
         ORDER BY "Clientname"`
      : `SELECT "clientcode", "Clientname", "compid"
         FROM "CLIENTMASTER"
         ORDER BY "Clientname"`,
    compid ? [Number(compid)] : []
  );
  res.json(rows);
});

// GET /api/masters/units?compcode=<id>&branchcode=<code>&clientcode=<code>
//   → [{unitcode, Unitname, compcode, branchcode, clientcode}]
router.get("/masters/units", requireClientAuth, requirePasswordChanged, async (req, res): Promise<void> => {
  const { compcode, branchcode, clientcode } = req.query as Record<string, string>;
  const params: unknown[] = [];
  const filters: string[] = [];
  if (compcode)   { params.push(Number(compcode));   filters.push(`"compcode"   = $${params.length}`); }
  if (branchcode) { params.push(Number(branchcode)); filters.push(`"branchcode" = $${params.length}`); }
  if (clientcode) { params.push(Number(clientcode)); filters.push(`"clientcode" = $${params.length}`); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await queryRows<{ unitcode: string; Unitname: string; compcode: number; branchcode: number; clientcode: number }>(
    `SELECT "unitcode", "Unitname", "compcode", "branchcode", "clientcode"
     FROM "UNITMASTER"
     ${where}
     ORDER BY "Unitname"`,
    params
  );
  res.json(rows);
});

// GET /api/masters/branches?compid=<id> — [{BranchCode, BranchName, compid}]
router.get("/masters/branches", requireClientAuth, requirePasswordChanged, async (req, res): Promise<void> => {
  const { compid } = req.query as Record<string, string>;
  const rows = await queryRows<{ BranchCode: number; BranchName: string; compid: number }>(
    compid
      ? `SELECT "BranchCode", "BranchName", "compid"
         FROM "BRANCH"
         WHERE "compid" = $1
         ORDER BY "BranchName"`
      : `SELECT "BranchCode", "BranchName", "compid"
         FROM "BRANCH"
         ORDER BY "BranchName"`,
    compid ? [Number(compid)] : []
  );
  res.json(rows);
});

export default router;
