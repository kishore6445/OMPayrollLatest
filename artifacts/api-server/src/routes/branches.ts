/**
 * branches.ts — Branch and Branch-Office CRUD routes
 *
 * Source tables (payrollom_client only):
 *   "BRANCH"       — operational branches; BranchCode is unique within compid
 *   "BRANCHOFFICE" — state-level registered offices; BranchStateID is unique within Compid
 *   "COMPANYMAST"  — parent company (read-only JOIN for display)
 *
 * Uniqueness rules (verified from child table schema):
 *   BranchCode   → scoped to compid (BRANCHFO_ISSUE, EMPMAST, UNITMASTER all carry both)
 *   BranchStateID → scoped to Compid (represents company's office per state)
 *
 * BRANCH ↔ BRANCHOFFICE: no direct FK — both link to COMPANYMAST independently.
 *
 * Do NOT write to any SaaS tables or COMPANYMAST.
 */

import { Router, type IRouter } from "express";
import { queryRows, queryOne, queryScalar, withTransaction } from "@workspace/pg-client-db";
import {
  requireClientAuth,
  requirePasswordChanged,
  requireClientPermission,
} from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";

const router: IRouter = Router();

// Middleware chains
const canRead  = [requireClientAuth, requirePasswordChanged, requireClientPermission("branches", "read")];
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("branches", "write")];

// ── GSTIN format ──────────────────────────────────────────────────────────────
// 15-char Indian GSTIN: 2-digit state code + PAN + 1 entity + 1 check
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// Email — basic format
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pincode — 6 digits
const PIN_RE = /^[1-9][0-9]{5}$/;

// ══════════════════════════════════════════════════════════════════════════════
// BRANCH routes
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/branches
 * Query params: compid, search, page (1-based), pageSize
 */
router.get("/branches", ...canRead, async (req, res): Promise<void> => {
  const { compid, search, page = "1", pageSize = "25" } = req.query as Record<string, string>;
  const p: unknown[] = [];
  const conds: string[] = [];

  if (compid) {
    p.push(parseInt(compid, 10));
    conds.push(`b."compid" = $${p.length}`);
  }
  if (search) {
    p.push(`%${search}%`);
    conds.push(`b."BranchName" ILIKE $${p.length}`);
  }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const pageNum  = Math.max(1, parseInt(page, 10)     || 1);
  const pageSz   = Math.min(200, parseInt(pageSize, 10) || 25);
  const offset   = (pageNum - 1) * pageSz;

  const countParams = [...p];
  const total = await queryScalar<number>(
    `SELECT COUNT(*) FROM "BRANCH" b ${where}`,
    countParams
  );

  p.push(pageSz, offset);
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT b."BranchCode", b."BranchName", b."Baddress", b."BManager",
            b."BPhone", b."ESIZonecode", b."remark", b."compid",
            c."comname"
     FROM "BRANCH" b
     LEFT JOIN "COMPANYMAST" c ON c."compid" = b."compid"
     ${where}
     ORDER BY b."BranchName"
     LIMIT $${p.length - 1} OFFSET $${p.length}`,
    p
  );

  res.json({ data: rows, total: Number(total), page: pageNum, pageSize: pageSz });
});

/**
 * GET /api/branches/:branchCode?compid=
 * BranchCode alone is not unique — compid is required.
 */
router.get("/branches/:branchCode", ...canRead, async (req, res): Promise<void> => {
  const branchCode = parseInt(req.params.branchCode as string, 10);
  const compid     = parseInt((req.query.compid as string) || "", 10);

  if (isNaN(branchCode)) { res.status(400).json({ error: "branchCode must be an integer" }); return; }
  if (isNaN(compid))     { res.status(400).json({ error: "compid query param is required (BranchCode is scoped to compid)" }); return; }

  const row = await queryOne<Record<string, unknown>>(
    `SELECT b."BranchCode", b."BranchName", b."Baddress", b."BManager",
            b."BPhone", b."ESIZonecode", b."remark", b."compid",
            c."comname", c."state" AS "compState", c."city" AS "compCity"
     FROM "BRANCH" b
     LEFT JOIN "COMPANYMAST" c ON c."compid" = b."compid"
     WHERE b."BranchCode" = $1 AND b."compid" = $2`,
    [branchCode, compid]
  );

  if (!row) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(row);
});

/**
 * POST /api/branches
 * Required: compid, BranchName
 * Auto-generates BranchCode = MAX(BranchCode WHERE compid=X)+1 inside transaction.
 */
router.post("/branches", ...canWrite, async (req, res): Promise<void> => {
  const body   = req.body as Record<string, unknown>;
  const userId = req.clientUser!.id;

  const name   = (body.BranchName as string | undefined)?.trim();
  const compid = Number(body.compid);

  if (!name)       { res.status(400).json({ error: "BranchName is required" }); return; }
  if (name.length > 50) { res.status(400).json({ error: "BranchName must be 50 characters or fewer" }); return; }
  if (!body.compid || isNaN(compid)) { res.status(400).json({ error: "compid is required" }); return; }

  // Validate optional fields when present
  const err = validateBranchFields(body);
  if (err) { res.status(400).json({ error: err }); return; }

  const result = await withTransaction(async (client) => {
    // 1. Verify parent company exists
    const comp = await client.query<{ comname: string }>(
      `SELECT "comname" FROM "COMPANYMAST" WHERE "compid" = $1`, [compid]
    );
    if (comp.rows.length === 0) {
      throw Object.assign(new Error("Company not found"), { status: 400 });
    }

    // 2. Check duplicate BranchName within this company
    const dup = await client.query(
      `SELECT 1 FROM "BRANCH"
       WHERE LOWER("BranchName") = LOWER($1) AND "compid" = $2`,
      [name, compid]
    );
    if (dup.rows.length > 0) {
      throw Object.assign(
        new Error(`A branch named "${name}" already exists under this company`),
        { status: 409 }
      );
    }

    // 3. Auto-generate BranchCode scoped to compid
    const codeRow = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX("BranchCode"), 0) + 1 AS next
       FROM "BRANCH" WHERE "compid" = $1`,
      [compid]
    );
    const branchCode = codeRow.rows[0].next;

    // 4. Insert
    await client.query(
      `INSERT INTO "BRANCH"
         ("BranchCode","BranchName","Baddress","BManager","BPhone","ESIZonecode","remark","compid")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        branchCode,
        name,
        body.Baddress  ? String(body.Baddress).trim()  : null,
        body.BManager  ? String(body.BManager).trim()  : null,
        body.BPhone    ? String(body.BPhone).trim()     : null,
        body.ESIZonecode != null ? Number(body.ESIZonecode) : null,
        body.remark    ? String(body.remark).trim()    : null,
        compid,
      ]
    );

    return { branchCode, comname: comp.rows[0].comname };
  }).catch((err) => {
    const status = (err as { status?: number }).status;
    if (status) return { _err: err.message, _status: status };
    throw err;
  });

  if ("_err" in result) {
    res.status((result as { _status: number })._status).json({ error: (result as { _err: string })._err });
    return;
  }

  const { branchCode, comname } = result as { branchCode: number; comname: string };

  await logClientAction(userId, "branch.create", {
    branchCode,
    compid,
    BranchName: name,
  });

  res.status(201).json({
    BranchCode: branchCode,
    BranchName: name,
    compid,
    comname,
    Baddress:   body.Baddress  ? String(body.Baddress).trim()  : null,
    BManager:   body.BManager  ? String(body.BManager).trim()  : null,
    BPhone:     body.BPhone    ? String(body.BPhone).trim()     : null,
    ESIZonecode: body.ESIZonecode != null ? Number(body.ESIZonecode) : null,
    remark:     body.remark    ? String(body.remark).trim()    : null,
  });
});

/**
 * PATCH /api/branches/:branchCode
 * Body must include `compid` for scoped lookup (BranchCode is not globally unique).
 * Only WRITABLE_BRANCH fields are updated.
 */
router.patch("/branches/:branchCode", ...canWrite, async (req, res): Promise<void> => {
  const branchCode = parseInt(req.params.branchCode as string, 10);
  if (isNaN(branchCode)) { res.status(400).json({ error: "branchCode must be an integer" }); return; }

  const body   = req.body as Record<string, unknown>;
  const userId = req.clientUser!.id;

  // compid is required for scoped lookup
  const compid = Number(body.compid);
  if (!body.compid || isNaN(compid)) {
    res.status(400).json({ error: "compid is required in the request body to identify the branch (BranchCode is scoped to compid)" });
    return;
  }

  const WRITABLE = new Set(["BranchName","Baddress","BManager","BPhone","ESIZonecode","remark"]);
  // Note: compid is excluded from WRITABLE — use it only for lookup, not update
  const cols: string[] = [];
  const vals: unknown[] = [];

  for (const [key, val] of Object.entries(body)) {
    if (!WRITABLE.has(key)) continue;
    cols.push(key);
    vals.push(val === "" ? null : val);
  }

  if (cols.length === 0) {
    res.status(400).json({ error: "No writable fields provided" });
    return;
  }

  // Validate fields present in body
  if (cols.includes("BranchName")) {
    const n = (body.BranchName as string | undefined)?.trim();
    if (!n) { res.status(400).json({ error: "BranchName cannot be empty" }); return; }
    if (n.length > 50) { res.status(400).json({ error: "BranchName must be 50 characters or fewer" }); return; }
  }
  const err = validateBranchFields(body);
  if (err) { res.status(400).json({ error: err }); return; }

  // Load current row
  const current = await queryOne<Record<string, unknown>>(
    `SELECT * FROM "BRANCH" WHERE "BranchCode" = $1 AND "compid" = $2`,
    [branchCode, compid]
  );
  if (!current) { res.status(404).json({ error: "Branch not found" }); return; }

  // Duplicate BranchName check (only if name is being changed)
  if (cols.includes("BranchName")) {
    const newName = (body.BranchName as string).trim();
    const dup = await queryOne(
      `SELECT 1 FROM "BRANCH"
       WHERE LOWER("BranchName") = LOWER($1) AND "compid" = $2
         AND "BranchCode" != $3`,
      [newName, compid, branchCode]
    );
    if (dup) {
      res.status(409).json({ error: `A branch named "${newName}" already exists under this company` });
      return;
    }
  }

  // Build SET clause
  const setClauses = cols.map((c, i) => `"${c}" = $${i + 1}`);
  vals.push(branchCode, compid);
  await queryOne(
    `UPDATE "BRANCH" SET ${setClauses.join(", ")}
     WHERE "BranchCode" = $${vals.length - 1} AND "compid" = $${vals.length}`,
    vals
  );

  await logClientAction(userId, "branch.update", {
    branchCode,
    compid,
    changedFields: cols,
  });

  // Return updated row
  const updated = await queryOne<Record<string, unknown>>(
    `SELECT b.*, c."comname"
     FROM "BRANCH" b
     LEFT JOIN "COMPANYMAST" c ON c."compid" = b."compid"
     WHERE b."BranchCode" = $1 AND b."compid" = $2`,
    [branchCode, compid]
  );
  res.json(updated);
});

// ══════════════════════════════════════════════════════════════════════════════
// BRANCHOFFICE routes
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/branch-offices
 * Query params: compid, search (by BranchState or BranchCity), page, pageSize
 */
router.get("/branch-offices", ...canRead, async (req, res): Promise<void> => {
  const { compid, search, page = "1", pageSize = "25" } = req.query as Record<string, string>;
  const p: unknown[] = [];
  const conds: string[] = [];

  if (compid) {
    p.push(parseInt(compid, 10));
    conds.push(`bo."Compid" = $${p.length}`);
  }
  if (search) {
    p.push(`%${search}%`);
    conds.push(
      `(bo."BranchState" ILIKE $${p.length} OR bo."BranchCity" ILIKE $${p.length} OR bo."BGSTIN" ILIKE $${p.length})`
    );
  }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const pageNum = Math.max(1, parseInt(page, 10)      || 1);
  const pageSz  = Math.min(200, parseInt(pageSize, 10) || 25);
  const offset  = (pageNum - 1) * pageSz;

  const total = await queryScalar<number>(
    `SELECT COUNT(*) FROM "BRANCHOFFICE" bo ${where}`,
    [...p]
  );

  p.push(pageSz, offset);
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT bo."BranchStateID", bo."BranchAddress", bo."BranchCity",
            bo."BranchPincode", bo."BranchState", bo."BGSTIN",
            bo."BranchPhone", bo."BranchEmail", bo."BranchWebSite",
            bo."BranchStatecode", bo."Compid",
            c."comname"
     FROM "BRANCHOFFICE" bo
     LEFT JOIN "COMPANYMAST" c ON c."compid" = bo."Compid"
     ${where}
     ORDER BY bo."BranchState", bo."BranchCity"
     LIMIT $${p.length - 1} OFFSET $${p.length}`,
    p
  );

  res.json({ data: rows, total: Number(total), page: pageNum, pageSize: pageSz });
});

/**
 * GET /api/branch-offices/:id?compid=
 * :id is BranchStateID; compid query param required (BranchStateID is scoped to Compid).
 */
router.get("/branch-offices/:id", ...canRead, async (req, res): Promise<void> => {
  const branchStateId = parseInt(req.params.id as string, 10);
  const compid        = parseInt((req.query.compid as string) || "", 10);

  if (isNaN(branchStateId)) { res.status(400).json({ error: "id (BranchStateID) must be an integer" }); return; }
  if (isNaN(compid))         { res.status(400).json({ error: "compid query param is required (BranchStateID is scoped to Compid)" }); return; }

  const row = await queryOne<Record<string, unknown>>(
    `SELECT bo."BranchStateID", bo."BranchAddress", bo."BranchCity",
            bo."BranchPincode", bo."BranchState", bo."BGSTIN",
            bo."BranchPhone", bo."BranchEmail", bo."BranchWebSite",
            bo."BranchStatecode", bo."Compid",
            c."comname", c."state" AS "compState"
     FROM "BRANCHOFFICE" bo
     LEFT JOIN "COMPANYMAST" c ON c."compid" = bo."Compid"
     WHERE bo."BranchStateID" = $1 AND bo."Compid" = $2`,
    [branchStateId, compid]
  );

  if (!row) { res.status(404).json({ error: "Branch office not found" }); return; }
  res.json(row);
});

/**
 * POST /api/branch-offices
 * Required: Compid
 * Auto-generates BranchStateID = MAX(BranchStateID WHERE Compid=X)+1
 */
router.post("/branch-offices", ...canWrite, async (req, res): Promise<void> => {
  const body   = req.body as Record<string, unknown>;
  const userId = req.clientUser!.id;

  const compid = Number(body.Compid);
  if (!body.Compid || isNaN(compid)) {
    res.status(400).json({ error: "Compid is required" });
    return;
  }

  // Validate optional fields when provided
  const err = validateBranchOfficeFields(body);
  if (err) { res.status(400).json({ error: err }); return; }

  const result = await withTransaction(async (client) => {
    // 1. Verify parent company
    const comp = await client.query<{ comname: string }>(
      `SELECT "comname" FROM "COMPANYMAST" WHERE "compid" = $1`, [compid]
    );
    if (comp.rows.length === 0) {
      throw Object.assign(new Error("Company not found"), { status: 400 });
    }

    // 2. Duplicate state check within company (same BranchState per company)
    const bstate = (body.BranchState as string | undefined)?.trim();
    if (bstate) {
      const dup = await client.query(
        `SELECT 1 FROM "BRANCHOFFICE"
         WHERE LOWER("BranchState") = LOWER($1) AND "Compid" = $2`,
        [bstate, compid]
      );
      if (dup.rows.length > 0) {
        throw Object.assign(
          new Error(`A branch office for state "${bstate}" already exists under this company`),
          { status: 409 }
        );
      }
    }

    // 3. Auto-generate BranchStateID scoped to Compid
    const idRow = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX("BranchStateID"), 0) + 1 AS next
       FROM "BRANCHOFFICE" WHERE "Compid" = $1`,
      [compid]
    );
    const branchStateId = idRow.rows[0].next;

    // 4. Insert
    await client.query(
      `INSERT INTO "BRANCHOFFICE"
         ("BranchStateID","BranchAddress","BranchCity","BranchPincode","BranchState",
          "BGSTIN","BranchPhone","BranchEmail","BranchWebSite","BranchStatecode","Compid")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        branchStateId,
        body.BranchAddress  ? String(body.BranchAddress).trim()  : null,
        body.BranchCity     ? String(body.BranchCity).trim()     : null,
        body.BranchPincode  ? Number(body.BranchPincode) : null,
        bstate ?? null,
        body.BGSTIN         ? String(body.BGSTIN).toUpperCase().trim() : null,
        body.BranchPhone    ? String(body.BranchPhone).trim()    : null,
        body.BranchEmail    ? String(body.BranchEmail).toLowerCase().trim() : null,
        body.BranchWebSite  ? String(body.BranchWebSite).trim()  : null,
        body.BranchStatecode ? String(body.BranchStatecode).trim() : null,
        compid,
      ]
    );

    return { branchStateId, comname: comp.rows[0].comname };
  }).catch((err) => {
    const status = (err as { status?: number }).status;
    if (status) return { _err: err.message, _status: status };
    throw err;
  });

  if ("_err" in result) {
    res.status((result as { _status: number })._status).json({ error: (result as { _err: string })._err });
    return;
  }

  const { branchStateId, comname } = result as { branchStateId: number; comname: string };

  await logClientAction(userId, "branch_office.create", {
    branchStateId,
    compid,
  });

  res.status(201).json({
    BranchStateID:   branchStateId,
    BranchAddress:   body.BranchAddress  ? String(body.BranchAddress).trim()  : null,
    BranchCity:      body.BranchCity     ? String(body.BranchCity).trim()     : null,
    BranchPincode:   body.BranchPincode  ? Number(body.BranchPincode) : null,
    BranchState:     (body.BranchState as string | undefined)?.trim() ?? null,
    BGSTIN:          body.BGSTIN         ? String(body.BGSTIN).toUpperCase().trim() : null,
    BranchPhone:     body.BranchPhone    ? String(body.BranchPhone).trim()    : null,
    BranchEmail:     body.BranchEmail    ? String(body.BranchEmail).toLowerCase().trim() : null,
    BranchWebSite:   body.BranchWebSite  ? String(body.BranchWebSite).trim()  : null,
    BranchStatecode: body.BranchStatecode ? String(body.BranchStatecode).trim() : null,
    Compid:          compid,
    comname,
  });
});

/**
 * PATCH /api/branch-offices/:id
 * Body must include `Compid` for scoped lookup.
 */
router.patch("/branch-offices/:id", ...canWrite, async (req, res): Promise<void> => {
  const branchStateId = parseInt(req.params.id as string, 10);
  if (isNaN(branchStateId)) { res.status(400).json({ error: "id (BranchStateID) must be an integer" }); return; }

  const body   = req.body as Record<string, unknown>;
  const userId = req.clientUser!.id;

  const compid = Number(body.Compid);
  if (!body.Compid || isNaN(compid)) {
    res.status(400).json({ error: "Compid is required in the request body to identify the branch office" });
    return;
  }

  const WRITABLE = new Set([
    "BranchAddress","BranchCity","BranchPincode","BranchState",
    "BGSTIN","BranchPhone","BranchEmail","BranchWebSite","BranchStatecode",
  ]);
  const cols: string[] = [];
  const vals: unknown[] = [];

  for (const [key, val] of Object.entries(body)) {
    if (!WRITABLE.has(key)) continue;
    cols.push(key);
    vals.push(val === "" ? null : val);
  }

  if (cols.length === 0) {
    res.status(400).json({ error: "No writable fields provided" });
    return;
  }

  const err = validateBranchOfficeFields(body);
  if (err) { res.status(400).json({ error: err }); return; }

  // Load current row
  const current = await queryOne<Record<string, unknown>>(
    `SELECT * FROM "BRANCHOFFICE" WHERE "BranchStateID" = $1 AND "Compid" = $2`,
    [branchStateId, compid]
  );
  if (!current) { res.status(404).json({ error: "Branch office not found" }); return; }

  // Duplicate BranchState check (if changing state)
  if (cols.includes("BranchState")) {
    const newState = (body.BranchState as string | undefined)?.trim();
    if (newState) {
      const dup = await queryOne(
        `SELECT 1 FROM "BRANCHOFFICE"
         WHERE LOWER("BranchState") = LOWER($1) AND "Compid" = $2
           AND "BranchStateID" != $3`,
        [newState, compid, branchStateId]
      );
      if (dup) {
        res.status(409).json({ error: `A branch office for state "${newState}" already exists under this company` });
        return;
      }
    }
  }

  // Normalise BGSTIN/email values in cols
  const normalisedVals = vals.map((v, i) => {
    if (cols[i] === "BGSTIN"      && typeof v === "string") return v.toUpperCase().trim();
    if (cols[i] === "BranchEmail" && typeof v === "string") return v.toLowerCase().trim();
    return v;
  });

  const setClauses = cols.map((c, i) => `"${c}" = $${i + 1}`);
  normalisedVals.push(branchStateId, compid);

  await queryOne(
    `UPDATE "BRANCHOFFICE" SET ${setClauses.join(", ")}
     WHERE "BranchStateID" = $${normalisedVals.length - 1} AND "Compid" = $${normalisedVals.length}`,
    normalisedVals
  );

  await logClientAction(userId, "branch_office.update", {
    branchStateId,
    compid,
    changedFields: cols,
  });

  const updated = await queryOne<Record<string, unknown>>(
    `SELECT bo.*, c."comname"
     FROM "BRANCHOFFICE" bo
     LEFT JOIN "COMPANYMAST" c ON c."compid" = bo."Compid"
     WHERE bo."BranchStateID" = $1 AND bo."Compid" = $2`,
    [branchStateId, compid]
  );
  res.json(updated);
});

// ── Validation helpers ────────────────────────────────────────────────────────

function validateBranchFields(body: Record<string, unknown>): string | null {
  if ("Baddress" in body && body.Baddress) {
    if (String(body.Baddress).length > 100) return "Address must be 100 characters or fewer";
  }
  if ("BManager" in body && body.BManager) {
    if (String(body.BManager).length > 50) return "Manager name must be 50 characters or fewer";
  }
  if ("BPhone" in body && body.BPhone) {
    if (String(body.BPhone).length > 50) return "Phone must be 50 characters or fewer";
  }
  if ("remark" in body && body.remark) {
    if (String(body.remark).length > 100) return "Remark must be 100 characters or fewer";
  }
  if ("ESIZonecode" in body && body.ESIZonecode != null) {
    if (isNaN(Number(body.ESIZonecode))) return "ESIZonecode must be a number";
  }
  return null;
}

function validateBranchOfficeFields(body: Record<string, unknown>): string | null {
  if ("BranchAddress" in body && body.BranchAddress) {
    if (String(body.BranchAddress).length > 500) return "Address must be 500 characters or fewer";
  }
  if ("BranchCity" in body && body.BranchCity) {
    if (String(body.BranchCity).length > 50) return "City must be 50 characters or fewer";
  }
  if ("BranchState" in body && body.BranchState) {
    if (String(body.BranchState).length > 50) return "State must be 50 characters or fewer";
  }
  if ("BranchPincode" in body && body.BranchPincode) {
    const pin = String(body.BranchPincode);
    if (!PIN_RE.test(pin)) return "Pincode must be a valid 6-digit Indian PIN code";
  }
  if ("BGSTIN" in body && body.BGSTIN) {
    const g = String(body.BGSTIN).toUpperCase().trim();
    if (!GSTIN_RE.test(g)) return "GSTIN must be a valid 15-character Indian GSTIN (e.g. 27AABCT1234A1Z5)";
  }
  if ("BranchPhone" in body && body.BranchPhone) {
    if (String(body.BranchPhone).length > 50) return "Phone must be 50 characters or fewer";
  }
  if ("BranchEmail" in body && body.BranchEmail) {
    if (!EMAIL_RE.test(String(body.BranchEmail))) return "Email is not valid";
    if (String(body.BranchEmail).length > 50) return "Email must be 50 characters or fewer";
  }
  if ("BranchWebSite" in body && body.BranchWebSite) {
    if (String(body.BranchWebSite).length > 50) return "Website must be 50 characters or fewer";
  }
  if ("BranchStatecode" in body && body.BranchStatecode) {
    if (String(body.BranchStatecode).length > 20) return "State code must be 20 characters or fewer";
  }
  return null;
}

export default router;
