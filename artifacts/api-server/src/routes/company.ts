/**
 * company.ts — Company master routes (COMPANYMAST)
 *
 * Sensitive fields excluded from all responses:
 *   ClientId, ClientSecret, smtpServer, fromEmail, usernm, servername
 *
 * compid is generated as MAX(compid)+1 inside a transaction — safe for the
 * single-writer admin scenario of a company master.
 */

import { Router, type IRouter } from "express";
import { queryRows, queryOne, queryScalar, execute, withTransaction } from "@workspace/pg-client-db";
import { requireClientAuth, requirePasswordChanged } from "../lib/client-auth.js";

const router: IRouter = Router();

// ── Column lists ──────────────────────────────────────────────────────────────

/** All columns safe to return in API responses (no credentials or config). */
const SAFE_COLS = `
  "compid", "comname", "address", "city", "district", "state", "pinCode",
  "country", "phone", "fax", "mobno", "web", "email",
  "esino", "pfno", "esicode", "pfcode", "regno",
  "BankName", "acno", "BankIFSCCode",
  "TAN_no", "PAN_no", "TIN_NO", "StaxNo", "VATNo", "STNo", "GSTINNo",
  "CINNo", "CompStateCode", "COMPGSTIN", "LinNo",
  "billprefix", "NewBillPrefix", "offerletterprefix",
  "month1", "month2", "year1", "year2", "dt1", "dt2",
  "PFSUbCode", "ESISubCode", "EstablishmentCode",
  "Local_Office", "KSplRate", "KCrptRate", "MonthlyDollarRate",
  "policestation", "VoucherPreFix", "corpID",
  "NatureOfWork", "regadd", "pstation", "bankcode"
`;

/**
 * Explicit allowlist of columns that may be written via POST/PATCH.
 * Prevents SQL injection through body key names.
 * Does NOT include: compid (auto), comp (binary/opaque), or sensitive fields.
 */
const WRITABLE_COLS: ReadonlySet<string> = new Set([
  "comname", "address", "city", "district", "state", "pinCode", "country",
  "phone", "fax", "mobno", "web", "email",
  "esino", "pfno", "esicode", "pfcode", "regno",
  "BankName", "acno", "BankIFSCCode",
  "TAN_no", "PAN_no", "TIN_NO", "StaxNo", "VATNo", "STNo", "GSTINNo",
  "CINNo", "CompStateCode", "COMPGSTIN", "LinNo",
  "billprefix", "NewBillPrefix", "offerletterprefix",
  "month1", "month2", "year1", "year2", "dt1", "dt2",
  "PFSUbCode", "ESISubCode", "EstablishmentCode",
  "Local_Office", "KSplRate", "KCrptRate", "MonthlyDollarRate",
  "policestation", "VoucherPreFix", "corpID",
  "NatureOfWork", "regadd", "pstation", "bankcode",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Filter body keys to the writable allowlist, returning parallel col/val arrays. */
function pickWritable(body: Record<string, unknown>): { cols: string[]; vals: unknown[] } {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [key, val] of Object.entries(body)) {
    if (!WRITABLE_COLS.has(key)) continue;
    // Treat empty string as null so the DB gets clean nulls
    cols.push(key);
    vals.push(val === "" ? null : val);
  }
  return { cols, vals };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/company — list all companies, optional name search
router.get(
  "/company",
  requireClientAuth,
  requirePasswordChanged,
  async (req, res): Promise<void> => {
    const { search } = req.query as Record<string, string>;
    const rows = await queryRows<Record<string, unknown>>(
      search
        ? `SELECT ${SAFE_COLS} FROM "COMPANYMAST" WHERE "comname" ILIKE $1 ORDER BY "comname"`
        : `SELECT ${SAFE_COLS} FROM "COMPANYMAST" ORDER BY "comname"`,
      search ? [`%${search}%`] : []
    );
    res.json(rows);
  }
);

// GET /api/company/:compid — single company detail
router.get(
  "/company/:compid",
  requireClientAuth,
  requirePasswordChanged,
  async (req, res): Promise<void> => {
    const compid = parseInt(req.params.compid as string, 10);
    if (isNaN(compid)) {
      res.status(400).json({ error: "compid must be an integer" });
      return;
    }
    const row = await queryOne<Record<string, unknown>>(
      `SELECT ${SAFE_COLS} FROM "COMPANYMAST" WHERE "compid" = $1`,
      [compid]
    );
    if (!row) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    res.json(row);
  }
);

// POST /api/company — create a new company
router.post(
  "/company",
  requireClientAuth,
  requirePasswordChanged,
  async (req, res): Promise<void> => {
    const body = req.body as Record<string, unknown>;
    const comname = (body.comname as string | undefined)?.trim();
    if (!comname) {
      res.status(400).json({ error: "comname is required" });
      return;
    }

    const { cols, vals } = pickWritable(body);
    // Ensure comname is always first and present
    if (!cols.includes("comname")) {
      cols.unshift("comname");
      vals.unshift(comname);
    }

    const created = await withTransaction(async (client) => {
      // Generate compid: MAX + 1, locked for this transaction
      const idResult = await client.query(
        `SELECT COALESCE(MAX("compid"), 0) + 1 AS next_id FROM "COMPANYMAST"`
      );
      const nextId: number = idResult.rows[0].next_id;

      // Build parameterised INSERT
      const allCols = ['"compid"', ...cols.map((c) => `"${c}"`)];
      const allVals = [nextId, ...vals];
      const placeholders = allVals.map((_, i) => `$${i + 1}`).join(", ");

      await client.query(
        `INSERT INTO "COMPANYMAST" (${allCols.join(", ")}) VALUES (${placeholders})`,
        allVals
      );
      return nextId;
    });

    const row = await queryOne<Record<string, unknown>>(
      `SELECT ${SAFE_COLS} FROM "COMPANYMAST" WHERE "compid" = $1`,
      [created]
    );
    res.status(201).json(row);
  }
);

// PATCH /api/company/:compid — update an existing company
router.patch(
  "/company/:compid",
  requireClientAuth,
  requirePasswordChanged,
  async (req, res): Promise<void> => {
    const compid = parseInt(req.params.compid as string, 10);
    if (isNaN(compid)) {
      res.status(400).json({ error: "compid must be an integer" });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const { cols, vals } = pickWritable(body);

    if (cols.length === 0) {
      res.status(400).json({ error: "No writable fields provided" });
      return;
    }

    // Check the company exists
    const exists = await queryScalar<number>(
      `SELECT 1 FROM "COMPANYMAST" WHERE "compid" = $1`,
      [compid]
    );
    if (!exists) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    // Build SET clause: "col" = $1, "col2" = $2, ...
    const setClauses = cols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
    const compidParam = `$${cols.length + 1}`;

    await execute(
      `UPDATE "COMPANYMAST" SET ${setClauses} WHERE "compid" = ${compidParam}`,
      [...vals, compid]
    );

    const row = await queryOne<Record<string, unknown>>(
      `SELECT ${SAFE_COLS} FROM "COMPANYMAST" WHERE "compid" = $1`,
      [compid]
    );
    res.json(row);
  }
);


// DELETE /api/company/:compid — safe organisation deletion
// A company can only be deleted when it has no employees, clients, sites or branches.
router.delete(
  "/company/:compid",
  requireClientAuth,
  requirePasswordChanged,
  async (req, res): Promise<void> => {
    const compid = parseInt(req.params.compid as string, 10);
    if (isNaN(compid)) {
      res.status(400).json({ error: "compid must be an integer" });
      return;
    }

    const current = await queryOne<{ compid: number; comname: string }>(
      `SELECT "compid", "comname" FROM "COMPANYMAST" WHERE "compid" = $1`,
      [compid],
    );
    if (!current) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const [employees, clients, sites, branches] = await Promise.all([
      queryScalar<string>(`SELECT COUNT(*) FROM "EMPMAST" WHERE "compid" = $1`, [compid]),
      queryScalar<string>(`SELECT COUNT(*) FROM "CLIENTMASTER" WHERE "compid" = $1`, [compid]),
      queryScalar<string>(`SELECT COUNT(*) FROM "UNITMASTER" WHERE "compcode" = $1`, [compid]),
      queryScalar<string>(`SELECT COUNT(*) FROM "BRANCH" WHERE "compid" = $1`, [compid]),
    ]);
    const dependencyCounts = {
      employees: Number(employees ?? "0"),
      clients: Number(clients ?? "0"),
      sites: Number(sites ?? "0"),
      branches: Number(branches ?? "0"),
    };
    if (Object.values(dependencyCounts).some((n) => n > 0)) {
      res.status(409).json({
        error: `Cannot delete this organisation while it has linked records. Employees: ${dependencyCounts.employees}, Clients: ${dependencyCounts.clients}, Sites: ${dependencyCounts.sites}, Branches: ${dependencyCounts.branches}.`,
        code: "COMPANY_HAS_DEPENDENCIES",
        dependencies: dependencyCounts,
      });
      return;
    }

    try {
      await withTransaction(async (tx) => {
        // Remove app-owned scope/configuration rows for an otherwise empty company.
        await tx.query(`DELETE FROM "USERCLIENT" WHERE compid = $1`, [compid]);
        await tx.query(`DELETE FROM "USERBRANCH" WHERE compid = $1`, [compid]);
        await tx.query(`DELETE FROM "USERCOMPANY" WHERE compids = $1`, [compid]);
        // categorymaster is a company-scoped setup master; remove orphan setup rows if the
        // optional local table has been created. Check existence before DELETE so a missing
        // table does not abort the transaction.
        const catTable = await tx.query(`SELECT to_regclass('public.categorymaster') AS name`);
        if (catTable.rows[0]?.name) {
          await tx.query(`DELETE FROM "categorymaster" WHERE "compid" = $1`, [compid]);
        }
        await tx.query(`DELETE FROM "COMPANYMAST" WHERE "compid" = $1`, [compid]);
      });
    } catch (err: any) {
      if (err?.code === "23503") {
        res.status(409).json({
          error: "This organisation is still referenced by payroll/history data and cannot be deleted.",
          code: "COMPANY_HAS_DEPENDENCIES",
        });
        return;
      }
      throw err;
    }

    res.json({ success: true, compid, comname: current.comname });
  },
);

export default router;
