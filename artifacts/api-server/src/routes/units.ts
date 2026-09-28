/**
 * units.ts — Client Master CRUD routes (business Client stored in UNITMASTER)
 *
 * Source tables (payrollom_client only):
 *   "UNITMASTER"   — primary table; INSERT/UPDATE only here
 *   "COMPANYMAST"  — read for validation + display JOIN
 *   "ZONE_MASTER"  — read for validation + display JOIN
 *
 * Uniqueness rule (verified):
 *   unitcode is varchar(20) and GLOBALLY UNIQUE across all of UNITMASTER.
 *   Evidence: BILL, ATTENDANCE and 18 other child tables reference unitcode
 *   as a standalone column — never as (clientcode, unitcode) composite.
 *   Auto-generation: COALESCE(MAX(numeric unitcodes), 0) + 1 cast to text,
 *   executed inside a transaction to be concurrency-safe.
 *
 * Do NOT write to any SaaS tables or any table other than UNITMASTER.
 */

import { Router, type IRouter } from "express";
import multer from "multer";
import { queryRows, queryOne, queryScalar, execute, withTransaction } from "@workspace/pg-client-db";
import {
  requireClientAuth,
  requirePasswordChanged,
  requireClientPermission,
} from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";
import { isUnrestrictedRole, loadUserScope, isInScope } from "../lib/scope-guard.js";
import { createXlsx, parseFirstSheetXlsx } from "../lib/xlsx-lite.js";

const router: IRouter = Router();

// ── Middleware chains ─────────────────────────────────────────────────────────
const canRead  = [requireClientAuth, requirePasswordChanged, requireClientPermission("units", "read")];
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("units", "write")];
const canExport = [requireClientAuth, requirePasswordChanged, requireClientPermission("units", "export")];
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ── Validators ────────────────────────────────────────────────────────────────
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_RE  = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function parsePage(p?: string, ps?: string) {
  const page     = Math.max(1, parseInt(p  ?? "1",  10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(ps ?? "50", 10) || 50));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function parseOptionalInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : Math.round(n);
}

function parseOptionalFloat(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function parseOptionalDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  const normalised = normaliseImportDate(v);
  return normalised;
}

/**
 * Convert a Client import date into an ISO YYYY-MM-DD value.
 *
 * Excel stores real date cells as serial numbers (for example 46291 =
 * 2026-09-26). xlsx-lite intentionally exposes the raw cell value, so the
 * import layer must translate those serials before PostgreSQL receives them.
 * We also accept explicit ISO dates and unambiguous DD/MM/YYYY or DD-MM-YYYY
 * text entered by users. Invalid values return null and are rejected by
 * validation rather than failing later during INSERT.
 */
function normaliseImportDate(v: unknown): string | null {
  if (v == null) return null;
  const raw = String(v).trim();
  if (!raw) return null;

  // Excel 1900 date system. Using 1899-12-30 also accounts for Excel's
  // historical leap-year bug. Ignore any fractional time portion because
  // UNITMASTER contract/terminate fields are used as dates in the UI.
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (!Number.isFinite(serial) || serial <= 0 || serial > 2958465) return null;
    const wholeDays = Math.floor(serial);
    const utcMillis = Date.UTC(1899, 11, 30) + wholeDays * 86400000;
    const d = new Date(utcMillis);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  // Prefer strict, timezone-neutral parsing for the formats we intentionally
  // support instead of relying on JavaScript's implementation-dependent parser.
  let year: number, month: number, day: number;
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    year = Number(m[1]); month = Number(m[2]); day = Number(m[3]);
  } else {
    m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (!m) return null;
    day = Number(m[1]); month = Number(m[2]); year = Number(m[3]);
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Validate the writable core fields of a unit body.
 * Returns an error string or null.
 */
function validateUnitCore(
  body: Record<string, unknown>,
  requireCompany: boolean
): string | null {
  const name      = (body.Unitname  as string | undefined)?.trim();
  const compcode  = body.compcode;
  const clientcode= body.clientcode;
  const email     = (body.email     as string | undefined)?.trim();
  const pincode   = (body.pincode   as string | undefined)?.trim();
  const telephone = (body.telephone as string | undefined)?.trim();
  const contractdate  = body.contractdate;
  const terminatedate = body.terminatedate;

  if (!name)                                    return "Client name is required";
  if (name.length > 100)                        return "Client name must be 100 characters or fewer";
  if (requireCompany && compcode == null) return "compcode (parent company) is required";
  if (compcode   != null && isNaN(Number(compcode)))  return "compcode must be a number";
  if (clientcode != null && isNaN(Number(clientcode)))return "clientcode must be a number";
  if (body.branchcode != null && body.branchcode !== "" && isNaN(Number(body.branchcode)))
    return "branchcode must be a number";
  if (body.zonecode   != null && body.zonecode   !== "" && isNaN(Number(body.zonecode)))
    return "zonecode must be a number";
  if (body.StateID   && (body.StateID as string).length > 3)
    return "StateID must be 3 characters or fewer";
  if (pincode    && pincode.length    > 20)  return "pincode must be 20 characters or fewer";
  if (telephone  && telephone.length  > 50)  return "telephone must be 50 characters or fewer";
  if (email      && !EMAIL_RE.test(email))   return "email is not a valid address";
  if (email      && email.length      > 50)  return "email must be 50 characters or fewer";
  if (body.unitmanager  && (body.unitmanager  as string).length > 50)  return "unitmanager must be 50 characters or fewer";
  if (body.unitlocation && (body.unitlocation as string).length > 100) return "unitlocation must be 100 characters or fewer";
  if (body.unittype     && (body.unittype     as string).length > 50)  return "unittype must be 50 characters or fewer";
  if (body.category     && (body.category     as string).length > 10)  return "category must be 10 characters or fewer";
  if (body.billingname  && (body.billingname  as string).length > 50)  return "billingname must be 50 characters or fewer";
  if (body.billingadd   && (body.billingadd   as string).length > 100) return "billingadd must be 100 characters or fewer";
  if (body.billadd1     && (body.billadd1     as string).length > 100) return "billadd1 must be 100 characters or fewer";
  if (body.billadd2     && (body.billadd2     as string).length > 100) return "billadd2 must be 100 characters or fewer";
  if (body.pTax         && (body.pTax         as string).length > 50)  return "pTax must be 50 characters or fewer";
  if (body.zonegroup    && (body.zonegroup    as string).length > 100) return "zonegroup must be 100 characters or fewer";

  // Numeric rates must be >= 0
  for (const rateField of ["wf","challan","sCharge","sTax","CouponRate","BonusRate",
                            "gratuityRate","EMP_LWF","EMPR_LWF","LeaveAllRate","otRate",
                            "HrsPerDay","UniformRate","Bonus_Limit","gratuityDay"]) {
    const v = body[rateField];
    if (v != null && v !== "" && (isNaN(Number(v)) || Number(v) < 0))
      return `${rateField} must be a non-negative number`;
  }

  for (let i = 1; i <= 17; i++) {
    const label = body[`SalHead${i}`];
    const value = body[`SalHeadDefault${i}`];
    if (label != null && String(label).trim().length > 50)
      return `SalHead${i} must be 50 characters or fewer`;
    if (value != null && value !== "" && (isNaN(Number(value)) || Number(value) < 0))
      return `SalHeadDefault${i} must be a non-negative number`;
  }

  // Date validation. Client Excel imports may contain native Excel date
  // serials, so validate through the same normaliser used before INSERT.
  if (contractdate  && contractdate !== "" && normaliseImportDate(contractdate) == null)
    return "contractdate must be a valid date";
  if (terminatedate && terminatedate !== "" && normaliseImportDate(terminatedate) == null)
    return "terminatedate must be a valid date";

  return null;
}

// ── Writable columns (safe allow-list for PATCH) ──────────────────────────────
const WRITABLE_COLS = new Set([
  "Unitname","StateID","compcode","clientcode","branchcode","zonecode",
  "unitlocation","unitmanager","address","city","state","pincode","telephone",
  "email","unittype","zonegroup","unitnote","billingname","BillingZone",
  "segcode","billingadd","billadd1","billadd2",
  "contractdate","terminatedate",
  // Attendance
  "OT_Setting","OTpayMode","monthDays","otmonthdays","monthDaysG","otMonthDaysG",
  "pfmonthdays","EncmonthDays","EffmonthDays","HrsPerDay","Unit_InTime","Unit_OutTime",
  // Payroll
  "PF_Setting","PF_OnEnc","EsiOnOT","wf","challan","salarylimit","pTax",
  "SeperateOT","SeperateOTG","OTCal","OTIn","AddAmtInOT",
  // Compliance
  "IsBonus","BonusOn","BonusRate","Bonus_Limit","BonusTag",
  "IsGratuity","gratuityRate","gratuityDay","EMP_LWF","EMPR_LWF",
  "minWageApp","ESINewRule","ESIONATTREWARD",
  // Billing
  "sCharge","sTax","CouponRate","UniformRate","rent","messamt",
  // Shifts
  "chknShift","LeaveAllRate","otRate",
  // Misc active fields
  "category","SupCode","atmID","gAttPer","fooddedrate","Unitadminded",
  "pTax","IsshowSTaxShare","ChkPerDay","salarylimit",
  ...Array.from({ length: 17 }, (_, i) => `SalHead${i + 1}`),
  ...Array.from({ length: 17 }, (_, i) => `SalHeadDefault${i + 1}`),
]);


// ── Excel Import / Export definition ─────────────────────────────────────────
const CLIENT_IMPORT_COLUMNS = [
  "unitcode","Unitname","compcode","clientcode","zonecode","StateID",
  "unitlocation","unitmanager","address","city","state","pincode","telephone","email",
  "unittype","zonegroup","billingname","BillingZone","segcode","billingadd","billadd1","billadd2",
  "contractdate","terminatedate","category","salarylimit","PF_Setting","EsiOnOT",
  "IsBonus","BonusRate","Bonus_Limit","IsGratuity","gratuityRate","EMP_LWF","EMPR_LWF",
  "sCharge","sTax","CouponRate","UniformRate","LeaveAllRate","HrsPerDay",
  ...Array.from({ length: 17 }, (_, i) => `SalHead${i + 1}`),
  ...Array.from({ length: 17 }, (_, i) => `SalHeadDefault${i + 1}`),
] as const;

type ClientImportError = { row: number; unitcode: string; clientName: string; error: string };
type ValidClientImport = { row: number; data: Record<string, unknown> };

function excelCell(row: Record<string, string>, key: string): string {
  return String(row[key] ?? "").trim();
}

function normaliseClientImportRow(row: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CLIENT_IMPORT_COLUMNS) {
    const raw = excelCell(row, key);
    if (!raw) { out[key] = null; continue; }
    if (["compcode","clientcode","zonecode","BillingZone","segcode","salarylimit"].includes(key)) {
      out[key] = Number(raw);
    } else if (["BonusRate","Bonus_Limit","gratuityRate","EMP_LWF","EMPR_LWF","sCharge","sTax","CouponRate","UniformRate","LeaveAllRate","HrsPerDay"].includes(key) || /^SalHeadDefault\d+$/.test(key)) {
      out[key] = Number(raw);
    } else if (key === "contractdate" || key === "terminatedate") {
      // Preserve an invalid raw value so validation can report the exact row;
      // valid Excel serial/text dates are converted to ISO before INSERT.
      out[key] = normaliseImportDate(raw) ?? raw;
    } else {
      out[key] = raw;
    }
  }
  return out;
}

function appendUnitScopeFilter(
  userId: number,
  role: string,
  scope: Awaited<ReturnType<typeof loadUserScope>>,
  params: unknown[],
  conds: string[],
): void {
  if (isUnrestrictedRole(role)) return;
  if (scope.companies.length === 0 || scope.units.length === 0) {
    conds.push("FALSE");
    return;
  }
  const pairs: string[] = [];
  for (const item of scope.units) {
    params.push(item.compid);
    const cp = params.length;
    params.push(item.unitcode);
    const up = params.length;
    pairs.push(`(u."compcode" = $${cp} AND u."unitcode" = $${up})`);
  }
  conds.push(`(${pairs.join(" OR ")})`);
}

async function validateClientImportRows(rows: Array<Record<string, string>>, user: NonNullable<import("../lib/client-auth.js").ClientAuthUser>) {
  const valid: ValidClientImport[] = [];
  const errors: ClientImportError[] = [];
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();
  const scope = await loadUserScope(user.id, user.role);

  for (let i = 0; i < rows.length; i++) {
    const excelRow = i + 2;
    const raw = rows[i];
    const data = normaliseClientImportRow(raw);
    const unitcode = String(data.unitcode ?? "").trim();
    const clientName = String(data.Unitname ?? "").trim();
    const compcode = Number(data.compcode);

    const fail = (error: string) => errors.push({ row: excelRow, unitcode, clientName, error });
    if (!clientName) { fail("Client name (Unitname) is required"); continue; }
    if (!Number.isFinite(compcode) || compcode <= 0) { fail("Organization ID (compcode) is required and must be numeric"); continue; }
    if (unitcode && unitcode.length > 20) { fail("Client ID / unitcode must be 20 characters or fewer"); continue; }

    const coreErr = validateUnitCore(data, true);
    if (coreErr) { fail(coreErr); continue; }

    const compOk = await queryScalar<number>(`SELECT 1 FROM "COMPANYMAST" WHERE "compid" = $1`, [compcode]);
    if (!compOk) { fail(`Organization compcode=${compcode} does not exist`); continue; }
    if (!isUnrestrictedRole(user.role) && !isInScope(scope, compcode)) { fail("Organization is outside your assigned scope"); continue; }

    if (data.zonecode != null) {
      const zoneOk = await queryScalar<number>(`SELECT 1 FROM "ZONE_MASTER" WHERE "zonecode" = $1`, [Number(data.zonecode)]);
      if (!zoneOk) { fail(`Zone ${data.zonecode} does not exist`); continue; }
    }

    if (unitcode) {
      const lc = unitcode.toLowerCase();
      if (seenCodes.has(lc)) { fail("Duplicate Client ID / unitcode inside the Excel file"); continue; }
      seenCodes.add(lc);
      const codeExists = await queryScalar<number>(`SELECT 1 FROM "UNITMASTER" WHERE LOWER(TRIM("unitcode")) = LOWER($1)`, [unitcode]);
      if (codeExists) { fail(`Client ID / unitcode ${unitcode} already exists`); continue; }
    }

    const nameKey = `${compcode}|${clientName.toLowerCase()}`;
    if (seenNames.has(nameKey)) { fail("Duplicate Client name under the same Organization inside the Excel file"); continue; }
    seenNames.add(nameKey);
    const nameExists = await queryScalar<number>(`SELECT 1 FROM "UNITMASTER" WHERE "compcode" = $1 AND LOWER(TRIM("Unitname")) = LOWER($2)`, [compcode, clientName]);
    if (nameExists) { fail(`A Client named "${clientName}" already exists under Organization ${compcode}`); continue; }

    // A default value is meaningful only where a component name exists.
    for (let n = 1; n <= 17; n++) {
      const label = String(data[`SalHead${n}`] ?? "").trim();
      const value = data[`SalHeadDefault${n}`];
      if (!label && value != null) { fail(`SalHeadDefault${n} has a value but SalHead${n} has no component name`); break; }
    }
    if (errors.length && errors[errors.length - 1].row === excelRow) continue;
    valid.push({ row: excelRow, data });
  }
  return { valid, errors };
}

// Downloadable template. Existing Organizations/Zones must already exist; import never creates masters implicitly.
router.get("/units/import-template.xlsx", ...canWrite, async (_req, res): Promise<void> => {
  const workbook = createXlsx([...CLIENT_IMPORT_COLUMNS], [], "Clients");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="Client_Import_Template.xlsx"');
  res.send(workbook);
});

router.post("/units/import/validate", ...canWrite, importUpload.single("file"), async (req, res): Promise<void> => {
  if (!req.file?.buffer) { res.status(400).json({ error: "Excel file is required" }); return; }
  if (!/\.xlsx$/i.test(req.file.originalname || "")) { res.status(400).json({ error: "Please upload an .xlsx Excel file" }); return; }
  let rows: Array<Record<string, string>>;
  try { rows = parseFirstSheetXlsx(req.file.buffer); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Could not read Excel file" }); return; }
  if (!rows.length) { res.status(400).json({ error: "Excel file has no Client rows" }); return; }
  if (rows.length > 5000) { res.status(400).json({ error: "A maximum of 5,000 Clients can be imported at one time" }); return; }
  const missingHeaders = ["Unitname","compcode"].filter(h => !(h in (rows[0] ?? {})));
  if (missingHeaders.length) { res.status(400).json({ error: `Missing required template columns: ${missingHeaders.join(", ")}` }); return; }
  const unknownHeaders = Object.keys(rows[0] ?? {}).filter(h => !CLIENT_IMPORT_COLUMNS.includes(h as any));
  const result = await validateClientImportRows(rows, req.clientUser!);
  res.json({
    totalRows: rows.length,
    validCount: result.valid.length,
    errorCount: result.errors.length,
    errors: result.errors.slice(0, 500),
    hasMoreErrors: result.errors.length > 500,
    unknownHeaders,
    preview: result.valid.slice(0, 20).map(v => ({ row: v.row, unitcode: v.data.unitcode ?? "Auto", Unitname: v.data.Unitname, compcode: v.data.compcode })),
    note: "Organizations and Zones must already exist. Blank Client IDs are generated automatically during import. Salary component names/defaults are imported into Client Master.",
  });
});

router.post("/units/import", ...canWrite, importUpload.single("file"), async (req, res): Promise<void> => {
  if (!req.file?.buffer) { res.status(400).json({ error: "Excel file is required" }); return; }
  if (!/\.xlsx$/i.test(req.file.originalname || "")) { res.status(400).json({ error: "Please upload an .xlsx Excel file" }); return; }
  let rows: Array<Record<string, string>>;
  try { rows = parseFirstSheetXlsx(req.file.buffer); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Could not read Excel file" }); return; }
  if (!rows.length) { res.status(400).json({ error: "Excel file has no Client rows" }); return; }
  const result = await validateClientImportRows(rows, req.clientUser!);
  if (result.errors.length) {
    res.status(400).json({ error: "Import blocked because one or more rows failed validation", totalRows: rows.length, validCount: result.valid.length, errorCount: result.errors.length, errors: result.errors.slice(0, 500), hasMoreErrors: result.errors.length > 500 });
    return;
  }

  const user = req.clientUser!;
  await withTransaction(async (client) => {
    // Insert rows with explicit Client IDs first so auto-generated numeric IDs
    // always start above any explicit numeric IDs present in the same workbook.
    const ordered = [...result.valid].sort((a, b) => Number(Boolean(String(b.data.unitcode ?? "").trim())) - Number(Boolean(String(a.data.unitcode ?? "").trim())));
    for (const item of ordered) {
      const data = item.data;
      let unitcode = String(data.unitcode ?? "").trim();
      if (!unitcode) {
        const idRow = await client.query(`SELECT COALESCE(MAX(CASE WHEN "unitcode" ~ '^[0-9]+$' THEN CAST("unitcode" AS integer) ELSE 0 END), 0) + 1 AS next_id FROM "UNITMASTER"`);
        unitcode = String(idRow.rows[0].next_id);
      }

      const cols: string[] = ['"unitcode"'];
      const vals: unknown[] = [unitcode];
      const phs: string[] = ["$1"];
      let idx = 2;
      for (const key of CLIENT_IMPORT_COLUMNS) {
        if (key === "unitcode") continue;
        if (!WRITABLE_COLS.has(key)) continue;
        let value = data[key];
        if (/^SalHeadDefault\d+$/.test(key)) {
          const n = key.replace("SalHeadDefault", "");
          const label = String(data[`SalHead${n}`] ?? "").trim();
          if (!label) value = null;
        }
        cols.push(`"${key}"`); phs.push(`$${idx++}`); vals.push(value === "" ? null : value);
      }
      // Legacy UI does not currently assign branch on create; keep imported Client consistent.
      cols.push('"branchcode"'); phs.push(`$${idx++}`); vals.push(null);
      await client.query(`INSERT INTO "UNITMASTER" (${cols.join(", ")}) VALUES (${phs.join(", ")})`, vals);
    }
  });
  await logClientAction(user.id, "unit.import", { rows: result.valid.length });
  res.status(201).json({ success: true, imported: result.valid.length, message: `${result.valid.length} Client(s) imported successfully` });
});

router.get("/units/export.xlsx", ...canExport, async (req, res): Promise<void> => {
  const user = req.clientUser!;
  const { compcode, zonecode, search } = req.query as Record<string, string>;
  const p: unknown[] = [];
  const conds: string[] = [];
  if (compcode) { p.push(Number(compcode)); conds.push(`u."compcode" = $${p.length}`); }
  if (zonecode) { p.push(Number(zonecode)); conds.push(`u."zonecode" = $${p.length}`); }
  if (search) { p.push(`%${search}%`); conds.push(`(u."Unitname" ILIKE $${p.length} OR u."unitcode" ILIKE $${p.length})`); }
  const scope = await loadUserScope(user.id, user.role);
  appendUnitScopeFilter(user.id, user.role, scope, p, conds);
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT ${CLIENT_IMPORT_COLUMNS.map(c => `u."${c}"`).join(", ")} FROM "UNITMASTER" u ${where} ORDER BY u."compcode", u."Unitname"`, p,
  );
  const workbook = createXlsx([...CLIENT_IMPORT_COLUMNS], rows, "Clients");
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Clients_${stamp}.xlsx"`);
  await logClientAction(user.id, "unit.export", { rows: rows.length, filters: { compcode, zonecode, search } });
  res.send(workbook);
});

// ── GET /api/units ────────────────────────────────────────────────────────────
// Canonical salary-head labels for a brand-new Client.
// The labels are sourced from existing Client Master (UNITMASTER) data rather
// than hard-coded. For a selected Organization, the most commonly used label
// in each SalHead slot within that Organization wins; if the Organization has
// no label for a slot, the global Client Master value is used as fallback.
router.get("/units/salary-head-template", ...canRead, async (req, res): Promise<void> => {
  const requestedComp = req.query.compcode == null || req.query.compcode === ""
    ? null
    : Number(req.query.compcode);
  if (requestedComp != null && !Number.isInteger(requestedComp)) {
    res.status(400).json({ error: "compcode must be an integer" });
    return;
  }

  const userId = Number(req.clientUser!.id);
  const role = String(req.clientUser!.role ?? "");
  const scope = await loadUserScope(userId, role);
  if (requestedComp != null && !isUnrestrictedRole(role) && !scope.companies.includes(requestedComp)) {
    res.status(403).json({ error: "Organization is outside your assigned scope" });
    return;
  }

  const result: Record<string, string | null> = {};
  for (let i = 1; i <= 17; i++) {
    const col = `SalHead${i}`;
    let value: string | null = null;
    if (requestedComp != null) {
      const row = await queryOne<Record<string, unknown>>(
        `SELECT NULLIF(BTRIM("${col}"), '') AS value
           FROM "UNITMASTER"
          WHERE "compcode" = $1 AND NULLIF(BTRIM("${col}"), '') IS NOT NULL
          GROUP BY NULLIF(BTRIM("${col}"), '')
          ORDER BY COUNT(*) DESC, NULLIF(BTRIM("${col}"), '') ASC
          LIMIT 1`,
        [requestedComp],
      );
      value = row?.value == null ? null : String(row.value);
    }
    if (!value) {
      const row = await queryOne<Record<string, unknown>>(
        `SELECT NULLIF(BTRIM("${col}"), '') AS value
           FROM "UNITMASTER"
          WHERE NULLIF(BTRIM("${col}"), '') IS NOT NULL
          GROUP BY NULLIF(BTRIM("${col}"), '')
          ORDER BY COUNT(*) DESC, NULLIF(BTRIM("${col}"), '') ASC
          LIMIT 1`,
        [],
      );
      value = row?.value == null ? null : String(row.value);
    }
    result[col] = value;
  }

  res.json(result);
});

router.get("/units", ...canRead, async (req, res): Promise<void> => {
  const user = req.clientUser!;
  const {
    compcode, clientcode, branchcode, zonecode, search,
    page: pageStr, pageSize: pageSizeStr,
  } = req.query as Record<string, string>;

  const { page, pageSize, offset } = parsePage(pageStr, pageSizeStr);
  const p: unknown[] = [];
  const conds: string[] = [];

  if (compcode) {
    p.push(parseInt(compcode, 10));
    conds.push(`u."compcode" = $${p.length}`);
  }
  if (clientcode) {
    p.push(parseInt(clientcode, 10));
    conds.push(`u."clientcode" = $${p.length}`);
  }
  if (branchcode) {
    p.push(parseInt(branchcode, 10));
    conds.push(`u."branchcode" = $${p.length}`);
  }
  if (zonecode) {
    p.push(parseInt(zonecode, 10));
    conds.push(`u."zonecode" = $${p.length}`);
  }
  if (search) {
    p.push(`%${search}%`);
    conds.push(`(u."Unitname" ILIKE $${p.length} OR u."unitcode" ILIKE $${p.length})`);
  }

  const scope = await loadUserScope(user.id, user.role);
  appendUnitScopeFilter(user.id, user.role, scope, p, conds);
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const total = await queryScalar<string>(
    `SELECT COUNT(*) FROM "UNITMASTER" u ${where}`,
    [...p]
  );

  p.push(pageSize, offset);
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT u."unitcode", u."Unitname", u."StateID", u."compcode", u."clientcode",
            u."branchcode", u."zonecode", u."unitlocation", u."unitmanager",
            u."address", u."city", u."state", u."pincode",
            u."contractdate", u."terminatedate", u."unittype", u."category",
            c."Clientname",
            comp."comname",
            b."BranchName",
            z."zonename"
     FROM "UNITMASTER" u
     LEFT JOIN "CLIENTMASTER" c    ON c."clientcode" = u."clientcode"
     LEFT JOIN "COMPANYMAST"  comp ON comp."compid"  = u."compcode"
     LEFT JOIN "BRANCH"       b    ON b."BranchCode" = u."branchcode" AND b."compid" = u."compcode"
     LEFT JOIN "ZONE_MASTER"  z    ON z."zonecode"   = u."zonecode"
     ${where}
     ORDER BY u."Unitname"
     LIMIT $${p.length - 1} OFFSET $${p.length}`,
    p
  );

  res.json({ data: rows, total: parseInt(total ?? "0", 10), page, pageSize });
});

// ── GET /api/units/:unitcode ──────────────────────────────────────────────────
router.get("/units/:unitcode", ...canRead, async (req, res): Promise<void> => {
  const { unitcode } = req.params;

  const unit = await queryOne<Record<string, unknown>>(
    `SELECT u.*,
            c."Clientname",
            comp."comname",
            b."BranchName",
            z."zonename"
     FROM "UNITMASTER" u
     LEFT JOIN "CLIENTMASTER"  c    ON c."clientcode" = u."clientcode"
     LEFT JOIN "COMPANYMAST"   comp ON comp."compid"  = u."compcode"
     LEFT JOIN "BRANCH"        b    ON b."BranchCode" = u."branchcode" AND b."compid" = u."compcode"
     LEFT JOIN "ZONE_MASTER"   z    ON z."zonecode"   = u."zonecode"
     WHERE u."unitcode" = $1`,
    [unitcode]
  );

  if (!unit) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  if (!isUnrestrictedRole(req.clientUser!.role)) {
    const scope = await loadUserScope(req.clientUser!.id, req.clientUser!.role);
    if (!isInScope(scope, Number(unit.compcode), undefined, undefined, String(unit.unitcode))) {
      res.status(403).json({ error: "Access denied: Client is outside your assigned scope" }); return;
    }
  }

  res.json(unit);
});

// ── POST /api/units ───────────────────────────────────────────────────────────
router.post("/units", ...canWrite, async (req, res): Promise<void> => {
  const body   = req.body as Record<string, unknown>;
  const userId = req.clientUser!.id;

  const validErr = validateUnitCore(body, true);
  if (validErr) { res.status(400).json({ error: validErr }); return; }

  const name       = (body.Unitname as string).trim();
  const compcode   = Number(body.compcode);
  const clientcode = parseOptionalInt(body.clientcode);
  const branchcode = null;
  const zonecode   = parseOptionalInt(body.zonecode);

  // Parent company must exist
  const compExists = await queryScalar<number>(
    `SELECT 1 FROM "COMPANYMAST" WHERE "compid" = $1`, [compcode]
  );
  if (!compExists) {
    res.status(400).json({ error: `Company compcode=${compcode} does not exist` });
    return;
  }

  if (!isUnrestrictedRole(req.clientUser!.role)) {
    const scope = await loadUserScope(req.clientUser!.id, req.clientUser!.role);
    if (!isInScope(scope, compcode)) {
      res.status(403).json({ error: "Access denied: Organization is outside your assigned scope" });
      return;
    }
  }

  // Zone must exist if provided
  if (zonecode != null) {
    const zoneOk = await queryScalar<number>(
      `SELECT 1 FROM "ZONE_MASTER" WHERE "zonecode" = $1`, [zonecode]
    );
    if (!zoneOk) {
      res.status(400).json({ error: `Zone ${zonecode} does not exist in ZONE_MASTER` });
      return;
    }
  }

  // Duplicate unit name under same client
  const dupExists = await queryScalar<number>(
    `SELECT 1 FROM "UNITMASTER" WHERE "compcode" = $1 AND LOWER("Unitname") = LOWER($2)`,
    [compcode, name]
  );
  if (dupExists) {
    res.status(409).json({
      error: `A client named "${name}" already exists under this company`,
    });
    return;
  }

  // Build the row to insert
  const optStr  = (f: string, max?: number) => {
    const v = (body[f] as string | undefined)?.trim() || null;
    return (v && max && v.length > max) ? null : v;
  };

  const newUnitcode = await withTransaction(async (txClient) => {
    const idRow = await txClient.query(
      `SELECT COALESCE(MAX(
         CASE WHEN "unitcode" ~ '^[0-9]+$' THEN CAST("unitcode" AS integer) ELSE 0 END
       ), 0) + 1 AS next_id FROM "UNITMASTER"`
    );
    const nextId: number = idRow.rows[0].next_id;
    const uc = String(nextId);

    await txClient.query(
      `INSERT INTO "UNITMASTER" (
        "unitcode","Unitname","StateID","compcode","clientcode","branchcode","zonecode",
        "unitlocation","unitmanager","address","city","state","pincode","telephone",
        "email","unittype","zonegroup","unitnote","billingname","BillingZone","segcode",
        "billingadd","billadd1","billadd2",
        "contractdate","terminatedate",
        "OT_Setting","OTpayMode","monthDays","otmonthdays","monthDaysG","HrsPerDay",
        "PF_Setting","PF_OnEnc","EsiOnOT","wf","challan","salarylimit","pTax",
        "SeperateOT","IsBonus","BonusOn","BonusRate","Bonus_Limit",
        "IsGratuity","gratuityRate","gratuityDay","EMP_LWF","EMPR_LWF",
        "sCharge","sTax","CouponRate","UniformRate","LeaveAllRate","chknShift","category"
       ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,$14,
        $15,$16,$17,$18,$19,$20,$21,
        $22,$23,$24,
        $25,$26,
        $27,$28,$29,$30,$31,$32,
        $33,$34,$35,$36,$37,$38,$39,
        $40,$41,$42,$43,$44,
        $45,$46,$47,$48,$49,
        $50,$51,$52,$53,$54,$55,$56
       )`,
      [
        uc, name, optStr("StateID", 3), compcode, clientcode, branchcode, zonecode,
        optStr("unitlocation",100), optStr("unitmanager",50),
        optStr("address",250), optStr("city",100), optStr("state",100),
        optStr("pincode",20), optStr("telephone",50),
        optStr("email",50), optStr("unittype",50), optStr("zonegroup",100),
        (body.unitnote as string | undefined)?.trim() || null,
        optStr("billingname",50), parseOptionalInt(body.BillingZone), parseOptionalInt(body.segcode),
        optStr("billingadd",100), optStr("billadd1",100), optStr("billadd2",100),
        parseOptionalDate(body.contractdate), parseOptionalDate(body.terminatedate),
        optStr("OT_Setting",15), optStr("OTpayMode",10),
        parseOptionalInt(body.monthDays), parseOptionalFloat(body.otmonthdays),
        parseOptionalFloat(body.monthDaysG), parseOptionalFloat(body.HrsPerDay),
        optStr("PF_Setting",10), parseOptionalInt(body.PF_OnEnc),
        optStr("EsiOnOT",5), parseOptionalFloat(body.wf), parseOptionalFloat(body.challan),
        parseOptionalInt(body.salarylimit), optStr("pTax",50),
        optStr("SeperateOT",5), optStr("IsBonus",5), optStr("BonusOn",15),
        parseOptionalFloat(body.BonusRate), parseOptionalFloat(body.Bonus_Limit),
        optStr("IsGratuity",5), parseOptionalFloat(body.gratuityRate),
        parseOptionalFloat(body.gratuityDay), parseOptionalFloat(body.EMP_LWF),
        parseOptionalFloat(body.EMPR_LWF),
        parseOptionalFloat(body.sCharge), parseOptionalFloat(body.sTax),
        parseOptionalFloat(body.CouponRate), parseOptionalFloat(body.UniformRate),
        parseOptionalFloat(body.LeaveAllRate), parseOptionalInt(body.chknShift),
        optStr("category",10),
      ]
    );

    // Salary component labels already exist in legacy UNITMASTER (SalHead1..17).
    // Default amounts are additive columns introduced by migration 009. Keeping
    // the mapping slot-for-slot allows Employee onboarding to copy defaults into
    // EMPMAST.SalHead1..17 without changing the legacy payroll engine.
    const salaryCols: string[] = [];
    const salaryVals: unknown[] = [];
    for (let i = 1; i <= 17; i++) {
      const name = String(body[`SalHead${i}`] ?? "").trim();
      const rawDefault = body[`SalHeadDefault${i}`];
      const defaultValue = rawDefault == null || rawDefault === "" ? null : Number(rawDefault);
      if (defaultValue != null && (!Number.isFinite(defaultValue) || defaultValue < 0)) {
        throw new Error(`SalHeadDefault${i} must be a non-negative number`);
      }
      salaryCols.push(`"SalHead${i}" = $${salaryVals.length + 1}`);
      salaryVals.push(name || null);
      salaryCols.push(`"SalHeadDefault${i}" = $${salaryVals.length + 1}`);
      salaryVals.push(name ? defaultValue : null);
    }
    await txClient.query(
      `UPDATE "UNITMASTER" SET ${salaryCols.join(", ")} WHERE "unitcode" = $${salaryVals.length + 1}`,
      [...salaryVals, uc],
    );

    return uc;
  });

  await logClientAction(userId, "unit.create", {
    unitcode:  newUnitcode,
    Unitname:  name,
    compcode,
    clientcode,
    branchcode,
    zonecode,
  });

  const row = await queryOne<Record<string, unknown>>(
    `SELECT u.*, c."Clientname", comp."comname", b."BranchName", z."zonename"
     FROM "UNITMASTER" u
     LEFT JOIN "CLIENTMASTER"  c    ON c."clientcode" = u."clientcode"
     LEFT JOIN "COMPANYMAST"   comp ON comp."compid"  = u."compcode"
     LEFT JOIN "BRANCH"        b    ON b."BranchCode" = u."branchcode" AND b."compid" = u."compcode"
     LEFT JOIN "ZONE_MASTER"   z    ON z."zonecode"   = u."zonecode"
     WHERE u."unitcode" = $1`,
    [newUnitcode]
  );

  res.status(201).json(row);
});

// ── PATCH /api/units/:unitcode ────────────────────────────────────────────────
router.patch("/units/:unitcode", ...canWrite, async (req, res): Promise<void> => {
  const { unitcode } = req.params as Record<string, string>;
  const body   = req.body as Record<string, unknown>;
  const userId = req.clientUser!.id;

  // Build allowed column/value pairs from the allow-list
  const cols: string[] = [];
  const vals: unknown[] = [];

  for (const [key, val] of Object.entries(body)) {
    if (!WRITABLE_COLS.has(key)) continue;
    cols.push(key);
    vals.push(val === "" ? null : val);
  }

  if (cols.length === 0) {
    res.status(400).json({ error: "No writable fields provided" });
    return;
  }

  // Validate fields that are present
  const err = validateUnitCore({ ...body }, false);
  // Only validate Unitname presence if it's included in the patch
  if (cols.includes("Unitname")) {
    const name = (body.Unitname as string | undefined)?.trim();
    if (!name) { res.status(400).json({ error: "Client name cannot be empty" }); return; }
  } else if (err && err !== "Unitname is required" && err !== "compcode (parent company) is required") {
    res.status(400).json({ error: err });
    return;
  }

  // Load current row for existence check and cross-field validation
  const current = await queryOne<Record<string, unknown>>(
    `SELECT * FROM "UNITMASTER" WHERE "unitcode" = $1`,
    [unitcode]
  );
  if (!current) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  if (!isUnrestrictedRole(req.clientUser!.role)) {
    const allowed = await queryScalar<number>(
      `SELECT 1 FROM "USERUNIT" WHERE usercode = $1 AND compid = $2 AND unitcode = $3 AND is_active = TRUE`,
      [req.clientUser!.id, Number(current.compcode), unitcode],
    );
    if (!allowed) { res.status(403).json({ error: "Access denied: Client is outside your assigned scope" }); return; }
  }

  // Resolve final values for cross-field checks
  const finalCompcode   = cols.includes("compcode")   ? Number(body.compcode)   : Number(current.compcode);
  const finalZonecode   = cols.includes("zonecode")   ? parseOptionalInt(body.zonecode)   : (current.zonecode as number | null);
  const finalName       = cols.includes("Unitname")   ? (body.Unitname as string).trim() : (current.Unitname as string);

  // If changing company, validate it exists
  if (cols.includes("compcode") && !isNaN(finalCompcode)) {
    const ok = await queryScalar<number>(`SELECT 1 FROM "COMPANYMAST" WHERE "compid" = $1`, [finalCompcode]);
    if (!ok) { res.status(400).json({ error: `Company compcode=${finalCompcode} does not exist` }); return; }
    if (!isUnrestrictedRole(req.clientUser!.role)) {
      const scope = await loadUserScope(req.clientUser!.id, req.clientUser!.role);
      if (!isInScope(scope, finalCompcode)) { res.status(403).json({ error: "Access denied: Organization is outside your assigned scope" }); return; }
    }
  }

  // Zone must exist if provided
  if (finalZonecode != null && cols.includes("zonecode")) {
    const ok = await queryScalar<number>(`SELECT 1 FROM "ZONE_MASTER" WHERE "zonecode" = $1`, [finalZonecode]);
    if (!ok) { res.status(400).json({ error: `Zone ${finalZonecode} does not exist` }); return; }
  }

  // Duplicate client name under the same company (excluding self)
  if (cols.includes("Unitname") || cols.includes("compcode")) {
    const dup = await queryScalar<number>(
      `SELECT 1 FROM "UNITMASTER"
       WHERE "compcode" = $1 AND LOWER("Unitname") = LOWER($2) AND "unitcode" <> $3`,
      [finalCompcode, finalName, unitcode]
    );
    if (dup) {
      res.status(409).json({ error: `A client named "${finalName}" already exists under this company` });
      return;
    }
  }

  // Keep salary component name/default pairs consistent during PATCH.
  // Clearing a component name also clears its Client default. A default cannot
  // be saved for a component that has no final label.
  for (let i = 1; i <= 17; i++) {
    const labelKey = `SalHead${i}`;
    const defaultKey = `SalHeadDefault${i}`;
    const labelPos = cols.indexOf(labelKey);
    let defaultPos = cols.indexOf(defaultKey);

    const finalLabel = labelPos >= 0
      ? String(vals[labelPos] ?? "").trim()
      : String(current[labelKey] ?? "").trim();

    if (!finalLabel) {
      if (defaultPos >= 0) {
        vals[defaultPos] = null;
      } else if (labelPos >= 0) {
        cols.push(defaultKey);
        vals.push(null);
        defaultPos = cols.length - 1;
      }
    } else if (defaultPos >= 0 && vals[defaultPos] != null && vals[defaultPos] !== "") {
      const parsed = Number(vals[defaultPos]);
      if (!Number.isFinite(parsed) || parsed < 0) {
        res.status(400).json({ error: `${defaultKey} must be a non-negative number` });
        return;
      }
      vals[defaultPos] = parsed;
    }
  }

  // Normalise values in place (trim strings, uppercase where required)
  const normVals = vals.map((v, i) => {
    if (typeof v === "string") return v.trim() || null;
    return v;
  });

  const setClauses = cols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  await execute(
    `UPDATE "UNITMASTER" SET ${setClauses} WHERE "unitcode" = $${cols.length + 1}`,
    [...normVals, unitcode]
  );

  // Audit: field names only, no values
  const changedFields = cols.filter((c, i) => {
    const prev = current[c];
    const next = normVals[i];
    return String(prev ?? "") !== String(next ?? "");
  });

  await logClientAction(userId, "unit.update", {
    unitcode,
    compcode: finalCompcode,
    changedFields,
  });

  const row = await queryOne<Record<string, unknown>>(
    `SELECT u.*, c."Clientname", comp."comname", b."BranchName", z."zonename"
     FROM "UNITMASTER" u
     LEFT JOIN "CLIENTMASTER"  c    ON c."clientcode" = u."clientcode"
     LEFT JOIN "COMPANYMAST"   comp ON comp."compid"  = u."compcode"
     LEFT JOIN "BRANCH"        b    ON b."BranchCode" = u."branchcode" AND b."compid" = u."compcode"
     LEFT JOIN "ZONE_MASTER"   z    ON z."zonecode"   = u."zonecode"
     WHERE u."unitcode" = $1`,
    [unitcode]
  );

  res.json(row);
});


// ── DELETE /api/units/:unitcode ──────────────────────────────────────────────
// Delete a business Client stored in UNITMASTER only when no employees are assigned.
router.delete("/units/:unitcode", ...canWrite, async (req, res): Promise<void> => {
  const { unitcode } = req.params as Record<string, string>;
  const userId = req.clientUser!.id;

  const current = await queryOne<{ unitcode: string; Unitname: string; compcode: number | null }>(
    `SELECT "unitcode", "Unitname", "compcode" FROM "UNITMASTER" WHERE "unitcode" = $1`,
    [unitcode]
  );
  if (!current) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  if (!isUnrestrictedRole(req.clientUser!.role)) {
    const allowed = await queryScalar<number>(
      `SELECT 1 FROM "USERUNIT" WHERE usercode = $1 AND compid = $2 AND unitcode = $3 AND is_active = TRUE`,
      [req.clientUser!.id, Number(current.compcode), unitcode],
    );
    if (!allowed) { res.status(403).json({ error: "Access denied: Client is outside your assigned scope" }); return; }
  }

  // In the current Employee Master flow, selected Client is stored in EMPMAST.unitcode.
  const employeeCount = Number((await queryScalar<string>(
    `SELECT COUNT(*) FROM "EMPMAST" WHERE "unitcode" = $1`,
    [unitcode]
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
    await execute(`DELETE FROM "UNITMASTER" WHERE "unitcode" = $1`, [unitcode]);
  } catch (err: any) {
    if (err?.code === "23503") {
      res.status(409).json({
        error: "This client is still referenced by payroll, attendance, billing, or history data and cannot be deleted. Remove those dependencies first.",
        code: "CLIENT_HAS_DEPENDENCIES",
      });
      return;
    }
    throw err;
  }

  await logClientAction(userId, "unit.delete", {
    unitcode,
    compcode: current.compcode,
    Unitname: current.Unitname,
  });

  res.json({ success: true, unitcode });
});

export default router;
