/**
 * clients.ts — Client and site (unit) master routes
 *
 * Source tables: "CLIENTMASTER", "UNITMASTER" in payrollom_client
 * Column names preserved exactly from the legacy SQL Server schema.
 *
 * Uniqueness rule (verified from schema + dump analysis):
 *   clientcode is GLOBALLY unique across the entire CLIENTMASTER table.
 *   No composite (compid + clientcode) constraint exists. All 15+ child
 *   tables (UNITMASTER, BILL, COMPANYESI, etc.) reference clientcode alone.
 *
 * UI label: "Sites" for units; database source is always UNITMASTER.
 */

import { Router, type IRouter } from "express";
import { queryRows, queryOne, queryScalar, execute, withTransaction } from "@workspace/pg-client-db";
import {
  requireClientAuth,
  requirePasswordChanged,
  requireClientPermission,
} from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";

const router: IRouter = Router();

// ── Middleware stacks ─────────────────────────────────────────────────────────

const canRead  = [requireClientAuth, requirePasswordChanged, requireClientPermission("clients", "read")];
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("clients", "write")];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePage(p?: string, ps?: string) {
  const page     = Math.max(1, parseInt(p  ?? "1",  10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(ps ?? "50", 10) || 50));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Indian PAN: 5 uppercase letters, 4 digits, 1 uppercase letter */
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

function validateClientBody(body: Record<string, unknown>, requireCompid = true): string | null {
  const name   = (body.Clientname as string | undefined)?.trim();
  const pan    = (body.PANNo     as string | undefined)?.trim().toUpperCase();
  const vat    = (body.VatNo     as string | undefined)?.trim();
  const des    = (body.des       as string | undefined)?.trim();
  const compid = body.compid;

  if (!name)                              return "Clientname is required";
  if (name.length > 200)                 return "Clientname must be 200 characters or fewer";
  if (des    && des.length    > 500)     return "Description must be 500 characters or fewer";
  if (pan    && !PAN_RE.test(pan))       return "PANNo must be in format AAAAA9999A (e.g. ABCDE1234F)";
  if (vat    && vat.length    > 50)      return "VatNo must be 50 characters or fewer";
  if (requireCompid && compid == null)   return "compid (parent company) is required";
  if (compid != null && isNaN(Number(compid))) return "compid must be a number";
  return null;
}

// ─── CLIENTS ─────────────────────────────────────────────────────────────────

// GET /api/clients?compid=&search=&page=&pageSize=
router.get(
  "/clients",
  ...canRead,
  async (req, res): Promise<void> => {
    const { compid, search, page: pageStr, pageSize: pageSizeStr } =
      req.query as Record<string, string>;
    const { page, pageSize, offset } = parsePage(pageStr, pageSizeStr);
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (compid) {
      params.push(parseInt(compid, 10));
      conditions.push(`c."compid" = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`c."Clientname" ILIKE $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = await queryScalar<string>(
      `SELECT COUNT(*) FROM "CLIENTMASTER" c ${where}`,
      params
    );

    params.push(pageSize);
    params.push(offset);

    const rows = await queryRows<Record<string, unknown>>(
      `SELECT c."clientcode", c."Clientname", c."VatNo", c."PANNo", c."des", c."compid",
              comp."comname"
       FROM "CLIENTMASTER" c
       LEFT JOIN "COMPANYMAST" comp ON comp."compid" = c."compid"
       ${where}
       ORDER BY c."Clientname"
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ data: rows, total: parseInt(total ?? "0", 10), page, pageSize });
  }
);

// GET /api/clients/:clientcode
router.get(
  "/clients/:clientcode",
  ...canRead,
  async (req, res): Promise<void> => {
    const clientcode = parseInt(req.params.clientcode as string, 10);
    if (isNaN(clientcode)) {
      res.status(400).json({ error: "clientcode must be an integer" });
      return;
    }

    const client = await queryOne<Record<string, unknown>>(
      `SELECT c."clientcode", c."Clientname", c."VatNo", c."PANNo", c."des", c."compid",
              comp."comname", comp."city" AS "compCity", comp."state" AS "compState"
       FROM "CLIENTMASTER" c
       LEFT JOIN "COMPANYMAST" comp ON comp."compid" = c."compid"
       WHERE c."clientcode" = $1`,
      [clientcode]
    );
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    // Attach branch assignments for this client
    const branches = await queryRows<Record<string, unknown>>(
      `SELECT bc.id, bc.branchcode, bc.is_active, b."BranchName"
       FROM "BRANCHCLIENT" bc
       LEFT JOIN "BRANCH" b ON b."BranchCode" = bc.branchcode AND b."compid" = bc.compid
       WHERE bc.clientcode = $1
       ORDER BY b."BranchName"`,
      [clientcode]
    );

    // Attach units for this client
    const units = await queryRows<Record<string, unknown>>(
      `SELECT "clientcode","unitcode","Unitname","StateID","compcode","branchcode","zonecode",
              "unitlocation","unitmanager","address","city","state","pincode","telephone",
              "contractdate","terminatedate","unittype","zonegroup","BillingZone","email"
       FROM "UNITMASTER" WHERE "clientcode" = $1 ORDER BY "Unitname"`,
      [clientcode]
    );

    res.json({ ...client, branches, units });
  }
);

// POST /api/clients — create a new client
router.post(
  "/clients",
  ...canWrite,
  async (req, res): Promise<void> => {
    const body = req.body as Record<string, unknown>;
    const userId = req.clientUser!.id;

    const validErr = validateClientBody(body, true);
    if (validErr) {
      res.status(400).json({ error: validErr });
      return;
    }

    const name   = (body.Clientname as string).trim();
    const compid = Number(body.compid);
    const pan    = (body.PANNo as string | undefined)?.trim().toUpperCase() || null;
    const vat    = (body.VatNo as string | undefined)?.trim() || null;
    const des    = (body.des   as string | undefined)?.trim() || null;

    // Parent company must exist
    const compExists = await queryScalar<number>(
      `SELECT 1 FROM "COMPANYMAST" WHERE "compid" = $1`,
      [compid]
    );
    if (!compExists) {
      res.status(400).json({ error: `Company with compid=${compid} does not exist in COMPANYMAST` });
      return;
    }

    // Duplicate client name under the same company
    const nameExists = await queryScalar<number>(
      `SELECT 1 FROM "CLIENTMASTER"
       WHERE "compid" = $1 AND LOWER("Clientname") = LOWER($2)`,
      [compid, name]
    );
    if (nameExists) {
      res.status(409).json({ error: `A client named "${name}" already exists under this company` });
      return;
    }

    // Validate branch codes if provided
    const branchcodes: number[] = Array.isArray(body.branchcodes)
      ? (body.branchcodes as unknown[]).map(Number).filter((n) => !isNaN(n))
      : [];

    for (const bc of branchcodes) {
      const branchOk = await queryScalar(
        `SELECT 1 FROM "BRANCH" WHERE "BranchCode" = $1 AND "compid" = $2`, [bc, compid],
      );
      if (!branchOk) {
        res.status(400).json({ error: `Branch ${bc} does not belong to this company` });
        return;
      }
    }

    const created = await withTransaction(async (txClient) => {
      const idRow = await txClient.query(
        `SELECT COALESCE(MAX("clientcode"), 0) + 1 AS next_id FROM "CLIENTMASTER"`
      );
      const nextId: number = idRow.rows[0].next_id;

      await txClient.query(
        `INSERT INTO "CLIENTMASTER" ("clientcode","Clientname","VatNo","PANNo","des","compid")
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [nextId, name, vat, pan, des, compid]
      );

      // Save branch mappings
      for (const bc of branchcodes) {
        await txClient.query(
          `INSERT INTO "BRANCHCLIENT" (compid, branchcode, clientcode, created_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (compid, branchcode, clientcode) DO UPDATE
             SET is_active = TRUE, updated_by = $4, updated_at = NOW()`,
          [compid, bc, nextId, userId],
        );
      }

      return nextId;
    });

    await logClientAction(userId, "client.create", {
      clientcode: created,
      Clientname: name,
      compid,
      branchcodes,
    });

    const row = await queryOne<Record<string, unknown>>(
      `SELECT c."clientcode", c."Clientname", c."VatNo", c."PANNo", c."des", c."compid",
              comp."comname"
       FROM "CLIENTMASTER" c
       LEFT JOIN "COMPANYMAST" comp ON comp."compid" = c."compid"
       WHERE c."clientcode" = $1`,
      [created]
    );
    const branches = await queryRows(
      `SELECT bc.branchcode, bc.is_active, b."BranchName"
       FROM "BRANCHCLIENT" bc
       LEFT JOIN "BRANCH" b ON b."BranchCode" = bc.branchcode AND b."compid" = bc.compid
       WHERE bc.clientcode = $1 AND bc.is_active = TRUE`,
      [created],
    );
    res.status(201).json({ ...row, branches });
  }
);

// PATCH /api/clients/:clientcode — partial update of an existing client
router.patch(
  "/clients/:clientcode",
  ...canWrite,
  async (req, res): Promise<void> => {
    const clientcode = parseInt(req.params.clientcode as string, 10);
    if (isNaN(clientcode)) {
      res.status(400).json({ error: "clientcode must be an integer" });
      return;
    }

    const body   = req.body as Record<string, unknown>;
    const userId = req.clientUser!.id;

    // Build writable col/val list first — reject early if nothing to update
    const WRITABLE = new Set(["Clientname", "VatNo", "PANNo", "des", "compid"]);
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

    // Validate only fields that are present in the body (PATCH = partial update)
    if (cols.includes("Clientname")) {
      const name = (body.Clientname as string | undefined)?.trim();
      if (!name) { res.status(400).json({ error: "Clientname cannot be empty" }); return; }
      if (name.length > 200) { res.status(400).json({ error: "Clientname must be 200 characters or fewer" }); return; }
    }
    if (cols.includes("PANNo")) {
      const pan = (body.PANNo as string | undefined)?.trim().toUpperCase();
      if (pan && !PAN_RE.test(pan)) {
        res.status(400).json({ error: "PANNo must be in format AAAAA9999A (e.g. ABCDE1234F)" });
        return;
      }
    }
    if (cols.includes("VatNo")) {
      const vat = (body.VatNo as string | undefined)?.trim();
      if (vat && vat.length > 50) { res.status(400).json({ error: "VatNo must be 50 characters or fewer" }); return; }
    }
    if (cols.includes("des")) {
      const des = (body.des as string | undefined)?.trim();
      if (des && des.length > 500) { res.status(400).json({ error: "Description must be 500 characters or fewer" }); return; }
    }
    if (cols.includes("compid") && body.compid != null && isNaN(Number(body.compid))) {
      res.status(400).json({ error: "compid must be a number" }); return;
    }

    // Load current row for existence check and audit diff
    const current = await queryOne<{
      Clientname: string; VatNo: string | null; PANNo: string | null;
      des: string | null; compid: number | null;
    }>(
      `SELECT "Clientname","VatNo","PANNo","des","compid"
       FROM "CLIENTMASTER" WHERE "clientcode" = $1`,
      [clientcode]
    );
    if (!current) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    // Resolve final values (merge with current for cross-field validation)
    const finalName   = (cols.includes("Clientname") ? (body.Clientname as string).trim() : current.Clientname);
    const finalCompid = cols.includes("compid")      ? Number(body.compid)                 : current.compid;
    const finalPan    = cols.includes("PANNo")       ? ((body.PANNo as string | undefined)?.trim().toUpperCase() || null) : current.PANNo;

    // If changing compid, the new company must exist
    if (cols.includes("compid") && finalCompid != null) {
      const compExists = await queryScalar<number>(
        `SELECT 1 FROM "COMPANYMAST" WHERE "compid" = $1`,
        [finalCompid]
      );
      if (!compExists) {
        res.status(400).json({ error: `Company with compid=${finalCompid} does not exist in COMPANYMAST` });
        return;
      }
    }

    // Duplicate name under same company (excluding self)
    const nameConflict = await queryScalar<number>(
      `SELECT 1 FROM "CLIENTMASTER"
       WHERE "compid" = $1 AND LOWER("Clientname") = LOWER($2) AND "clientcode" <> $3`,
      [finalCompid, finalName, clientcode]
    );
    if (nameConflict) {
      res.status(409).json({ error: `A client named "${finalName}" already exists under this company` });
      return;
    }

    // Re-map PANNo to uppercase in the update cols
    const normalisedCols = cols.map((c) => c);
    const normalisedVals = vals.map((v, i) => {
      if (normalisedCols[i] === "PANNo" && typeof v === "string") return v.toUpperCase();
      if (normalisedCols[i] === "Clientname" && typeof v === "string") return v.trim();
      return v;
    });

    const setClauses = normalisedCols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
    const compidParam = `$${normalisedCols.length + 1}`;
    // Handle branch mapping update if branchcodes provided in body
    const newBranchcodes: number[] | undefined = Array.isArray(body.branchcodes)
      ? (body.branchcodes as unknown[]).map(Number).filter((n) => !isNaN(n))
      : undefined;

    if (newBranchcodes !== undefined) {
      for (const bc of newBranchcodes) {
        const branchOk = await queryScalar(
          `SELECT 1 FROM "BRANCH" WHERE "BranchCode" = $1 AND "compid" = $2`,
          [bc, finalCompid],
        );
        if (!branchOk) {
          res.status(400).json({ error: `Branch ${bc} does not belong to this company` });
          return;
        }
      }
    }

    await withTransaction(async (tx) => {
      if (normalisedCols.length > 0) {
        await tx.query(
          `UPDATE "CLIENTMASTER" SET ${setClauses} WHERE "clientcode" = ${compidParam}`,
          [...normalisedVals, clientcode]
        );
      }

      if (newBranchcodes !== undefined) {
        // Deactivate all existing branch mappings for this client
        await tx.query(
          `UPDATE "BRANCHCLIENT" SET is_active = FALSE, updated_by = $1, updated_at = NOW()
           WHERE clientcode = $2`,
          [userId, clientcode],
        );
        // Re-activate or insert requested branches
        for (const bc of newBranchcodes) {
          await tx.query(
            `INSERT INTO "BRANCHCLIENT" (compid, branchcode, clientcode, created_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (compid, branchcode, clientcode) DO UPDATE
               SET is_active = TRUE, updated_by = $4, updated_at = NOW()`,
            [finalCompid, bc, clientcode, userId],
          );
        }
      }
    });

    // Audit: record changed field names (no values logged)
    const changedFields = normalisedCols.filter((c, i) => {
      const prev = (current as Record<string, unknown>)[c];
      const next = normalisedVals[i];
      return String(prev ?? "") !== String(next ?? "");
    });
    if (newBranchcodes !== undefined) changedFields.push("branchcodes");

    await logClientAction(userId, "client.update", {
      clientcode,
      compid: finalCompid,
      changedFields,   // field names only — no values logged
    });

    const [row, branches] = await Promise.all([
      queryOne<Record<string, unknown>>(
        `SELECT c."clientcode", c."Clientname", c."VatNo", c."PANNo", c."des", c."compid",
                comp."comname"
         FROM "CLIENTMASTER" c
         LEFT JOIN "COMPANYMAST" comp ON comp."compid" = c."compid"
         WHERE c."clientcode" = $1`,
        [clientcode]
      ),
      queryRows(
        `SELECT bc.branchcode, bc.is_active, b."BranchName"
         FROM "BRANCHCLIENT" bc
         LEFT JOIN "BRANCH" b ON b."BranchCode" = bc.branchcode AND b."compid" = bc.compid
         WHERE bc.clientcode = $1 AND bc.is_active = TRUE`,
        [clientcode],
      ),
    ]);
    res.json({ ...row, branches });
  }
);


// DELETE /api/clients/:clientcode — delete only when no employees are assigned
router.delete(
  "/clients/:clientcode",
  ...canWrite,
  async (req, res): Promise<void> => {
    const clientcode = parseInt(req.params.clientcode as string, 10);
    if (isNaN(clientcode)) {
      res.status(400).json({ error: "clientcode must be an integer" });
      return;
    }

    const userId = req.clientUser!.id;
    const current = await queryOne<{ clientcode: number; Clientname: string; compid: number | null }>(
      `SELECT "clientcode", "Clientname", "compid" FROM "CLIENTMASTER" WHERE "clientcode" = $1`,
      [clientcode],
    );
    if (!current) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    // Client deletion is never allowed while even one employee is assigned.
    const employeeCount = Number((await queryScalar<string>(
      `SELECT COUNT(*) FROM "EMPMAST" WHERE "clientcode" = $1`,
      [clientcode],
    )) ?? "0");
    if (employeeCount > 0) {
      res.status(409).json({
        error: `Cannot delete this client because ${employeeCount} employee${employeeCount === 1 ? " is" : "s are"} assigned to it. Reassign or remove the employees first.`,
        code: "CLIENT_HAS_EMPLOYEES",
        employeeCount,
      });
      return;
    }

    try {
      await withTransaction(async (tx) => {
        // Scope rows are app-owned and safe to remove with the client.
        await tx.query(`DELETE FROM "USERCLIENT" WHERE clientcode = $1`, [clientcode]);
        await tx.query(`DELETE FROM "BRANCHCLIENT" WHERE clientcode = $1`, [clientcode]);
        // UNITMASTER is the client's site/configuration child. With no employees assigned,
        // remove its rows as part of deleting the parent client. Database FKs still protect
        // any legacy payroll dependencies we do not own.
        await tx.query(`DELETE FROM "UNITMASTER" WHERE "clientcode" = $1`, [clientcode]);
        await tx.query(`DELETE FROM "CLIENTMASTER" WHERE "clientcode" = $1`, [clientcode]);
      });
    } catch (err: any) {
      if (err?.code === "23503") {
        res.status(409).json({
          error: "This client is still referenced by payroll/history data and cannot be deleted. Remove those dependencies first.",
          code: "CLIENT_HAS_DEPENDENCIES",
        });
        return;
      }
      throw err;
    }

    await logClientAction(userId, "client.delete", {
      clientcode,
      compid: current.compid,
      Clientname: current.Clientname,
    });
    res.json({ success: true, clientcode });
  },
);

// ─── SITES (UNITMASTER) ───────────────────────────────────────────────────────
// "Sites" is the UI label; database source is UNITMASTER.

// GET /api/sites?clientcode=&compcode=&search=&page=&pageSize=
router.get(
  "/sites",
  ...canRead,
  async (req, res): Promise<void> => {
    const { clientcode, compcode, search, page: pageStr, pageSize: pageSizeStr } =
      req.query as Record<string, string>;
    const { page, pageSize, offset } = parsePage(pageStr, pageSizeStr);
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (clientcode) {
      params.push(parseInt(clientcode, 10));
      conditions.push(`u."clientcode" = $${params.length}`);
    }
    if (compcode) {
      params.push(parseInt(compcode, 10));
      conditions.push(`u."compcode" = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`u."Unitname" ILIKE $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = await queryScalar<string>(
      `SELECT COUNT(*) FROM "UNITMASTER" u ${where}`,
      params
    );

    params.push(pageSize);
    params.push(offset);

    const rows = await queryRows<Record<string, unknown>>(
      `SELECT u."clientcode", u."unitcode", u."Unitname", u."StateID", u."compcode",
              u."branchcode", u."zonecode", u."unitlocation", u."unitmanager",
              u."address", u."city", u."state", u."pincode", u."telephone",
              u."contractdate", u."terminatedate", u."unittype", u."zonegroup",
              u."BillingZone", u."email",
              c."Clientname"
       FROM "UNITMASTER" u
       LEFT JOIN "CLIENTMASTER" c ON c."clientcode" = u."clientcode"
       ${where}
       ORDER BY u."Unitname"
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ data: rows, total: parseInt(total ?? "0", 10), page, pageSize });
  }
);

// GET /api/sites/:unitcode
router.get(
  "/sites/:unitcode",
  ...canRead,
  async (req, res): Promise<void> => {
    const { unitcode } = req.params;

    const unit = await queryOne<Record<string, unknown>>(
      `SELECT u."clientcode", u."unitcode", u."Unitname", u."StateID", u."compcode",
              u."branchcode", u."zonecode", u."unitlocation", u."unitmanager",
              u."address", u."city", u."state", u."pincode", u."telephone",
              u."contractdate", u."terminatedate", u."unittype", u."zonegroup",
              u."billingname", u."BillingZone", u."segcode", u."email",
              u."billingadd", u."billadd1", u."billadd2",
              u."OT_Setting", u."OTpayMode", u."monthDays", u."otmonthdays",
              u."monthDaysG", u."pfmonthdays", u."PF_Setting", u."PF_OnEnc",
              u."EsiOnOT", u."wf", u."challan",
              c."Clientname",
              comp."comname"
       FROM "UNITMASTER" u
       LEFT JOIN "CLIENTMASTER" c    ON c."clientcode" = u."clientcode"
       LEFT JOIN "COMPANYMAST"  comp ON comp."compid"  = u."compcode"
       WHERE u."unitcode" = $1`,
      [unitcode]
    );

    if (!unit) {
      res.status(404).json({ error: "Unit not found" });
      return;
    }

    res.json(unit);
  }
);

export default router;
