/**
 * workers.ts — EMPMAST Employee Master — full CRUD
 *
 * Source tables (read/write only EMPMAST; all others read-only for validation):
 *   "EMPMAST"           — INSERT + UPDATE here only
 *   "COMPANYMAST"       — validation
 *   "CLIENTMASTER"      — validation + display JOIN
 *   "UNITMASTER"        — validation + display JOIN
 *   "BRANCH"            — validation + display JOIN
 *   "DEPTMAST"          — validation + display JOIN
 *   "DESIGNATIONMASTER" — display JOIN (varchar → int safe cast)
 *   "GRADEMASTER"       — validation + display JOIN
 *   "categorymaster"    — validation + display JOIN (catcode varchar vs int cast)
 *
 * Logical key (verified from DDL clustered index ix_EMPMAST_IX_EmpMast_Clustered):
 *   Clustered index: (compid, unitcode, EmpCode)
 *   EmpCode is NOT globally unique — uniqueness is (compid, EmpCode).
 *   All duplicate checks, lookups, and edits use (compid, EmpCode).
 *   EmpCode is used as the URL parameter in this single-tenant deployment.
 *
 * Sensitive fields masked in all GET responses unless caller has workers:export:
 *   adharcardno, PAN_no, acno, UANNo, UANBankAcc, tokanno
 *   Never logged in audit trail.
 *
 * Computed/procedure fields (never written, stripped from responses):
 *   INCSC1–17, ARROTMDAY, POSSALL, ESINewRule
 */

import { Router, type IRouter } from "express";
import multer from "multer";
import {
  queryRows, queryOne, queryScalar, execute, withTransaction,
} from "@workspace/pg-client-db";
import {
  requireClientAuth,
  requirePasswordChanged,
  requireClientPermission,
} from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";
import {
  isUnrestrictedRole,
  assertWorkerScope,
  buildWorkerScopeFilter,
  loadUserScope,
  isInScope,
} from "../lib/scope-guard.js";
import { verifyBankVerificationToken } from "../lib/bank-verification-token.js";
import { verifyStatutoryVerificationToken } from "../lib/statutory-verification-token.js";
import type { ClientAuthUser } from "../lib/client-auth.js";
import { createXlsx, parseFirstSheetXlsx } from "../lib/xlsx-lite.js";

const router: IRouter = Router();

const canRead  = [requireClientAuth, requirePasswordChanged, requireClientPermission("workers", "read")];
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("workers", "write")];
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ── Regex validators ──────────────────────────────────────────────────────────
const PAN_RE    = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE   = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\d{10}$/;
const UAN_RE    = /^\d{12}$/;

// ── Safe CAST for designation FK (EMPMAST.designation = varchar, DESIGNATIONMASTER.DESICODE = int) ─
const DESIG_JOIN = `
  LEFT JOIN "DESIGNATIONMASTER" desig
    ON desig."DESICODE" = (
      CASE WHEN e."designation" ~ '^[0-9]+$'
           THEN e."designation"::integer
           ELSE NULL
      END
    )
`;

// ── Joins for list and detail ─────────────────────────────────────────────────
const LOOKUP_JOINS = `
  LEFT JOIN "CLIENTMASTER"   c    ON c."clientcode"  = e."clientcode"
  LEFT JOIN "UNITMASTER"     u    ON u."unitcode"     = e."unitcode"
  ${DESIG_JOIN}
  LEFT JOIN "DEPTMAST"       dept ON dept."deptcode"  = e."deptcode"
  LEFT JOIN "GRADEMASTER"    g    ON g."GradeCode"    = e."GradeCode"
  LEFT JOIN "BRANCH"         b    ON b."BranchCode"   = e."branchcode" AND b."compid" = e."compid"
  LEFT JOIN "ZONE_MASTER"    z    ON z."zonecode"     = e."zonecode"
  LEFT JOIN "COMPANYMAST"    comp ON comp."compid"    = e."compid"
  LEFT JOIN LATERAL (
    SELECT cm."catcode", cm."catname", cm."catdescription", cm."compid"
    FROM "categorymaster" cm
    WHERE cm."catcode" = e."catcode"::text AND cm."compid" = e."compid"::text
    ORDER BY cm."catname"
    LIMIT 1
  ) cat ON TRUE
`;

// ── Columns returned in list ──────────────────────────────────────────────────
const LIST_SELECT = `
  e."EmpCode", e."EmpName", e."compid", e."clientcode", e."unitcode",
  e."branchcode", e."deptcode", e."designation", e."GradeCode", e."catcode",
  e."DOJ", e."RDOJ", e."workstatus", e."modeofpay",
  e."basic", e."hra", e."vda", e."conv", e."Gross", e."ctc",
  e."adharcardno", e."PAN_no", e."UANNo",
  e."Sex", e."DOB", e."MobNo", e."emailID",
  e."acno", e."bankcode", e."NameInBank", e."SavingIFSCCode",
  e."tokanno", e."APPLICABLE",
  c."Clientname",
  u."Unitname",
  desig."DESINAME",
  dept."Deptname",
  g."GradeName",
  b."BranchName",
  z."zonename",
  comp."comname",
  cat."catname"
`;

// ── Sensitive columns — masked unless workers:export ─────────────────────────
const SENSITIVE_COLS = ["adharcardno", "PAN_no", "acno", "UANNo", "UANBankAcc", "tokanno"];

// ── Computed/procedure columns — always stripped from responses ───────────────
const COMPUTED_COLS = new Set([
  "INCSC1","INCSC2","INCSC3","INCSC4","INCSC5","INCSC6","INCSC7",
  "INCSC8","INCSC9","INCSC10","INCSC11","INCSC12","INCSC13","INCSC14",
  "INCSC15","INCSC16","INCSC17","ARROTMDAY","POSSALL","ESINewRule",
]);

// ── System columns — never written ────────────────────────────────────────────
const SYSTEM_COLS = new Set([
  "ID","SrNo","RecordInsertByUserID","RecordInsertDate",
  "RecordUpdateByUserID","RecordUpdateDate","upduser","upddatetime",
  ...COMPUTED_COLS,
]);

// ── Whitelisted writable columns ──────────────────────────────────────────────
const WRITABLE_COLS = new Set([
  "CardNo","oldEmpcode","ropcod","EmpDeptCode",
  "EmpName","FHName","cmbFH","mothername","DOB","MAD","FDOB","MDOB",
  "Sex","Married","SDOB","SpouseName","children","BlodGroup","Nationality",
  "MobNo","emailID","emailidcompany",
  "compid","clientcode","unitcode","branchcode","zonecode","locationcode",
  "deptcode","designation","GradeCode","catcode","subCatcode","BillCatCode",
  "focode","Divcode","StateID","Location","emplocation","nShift","shift","weeklyoff",
  "workstatus","DOJ","RDOJ","applicationdate","applicationno","interviewdate",
  "modeofpay","OTmodeofpay","newEmp","IsRejoin","resg_det","IsPFSettlement",
  "bankcode","SavingBankName","NameInSavingBank","NameInBank","BankBranchName",
  "acno","Savingacno","SavingIFSCCode","MICRCode","UTR",
  "UANBankName","UANBankAcc","UANBankIFSC",
  "adharcardno","PAN_no","UANNo","tokanno","voterIDNo",
  "NameOnAdhar","NameOnPAN","IsKYC","IsUAN","IsOldUan",
  "APPLICABLE","IsPension","PFWageEligibility","pf","VPF","VPFRate",
  "opt_pflimit","PFLimit","IsPFLimitFix","IsPFonFull","pf_arear","emp_bf",
  "PFBanAcc","PFBankIFSC","chkUnitPFAplicable","EmpPFZoneCode","IsAbry",
  "pfDate","IsIWReturn",
  "esi","ESILimit","CHK_ESIMUST","EsiDate","IsESIOnLTA","IsESIOnSpl",
  "IsPtax","IsLWF","LWFID","LwfDate","PTaxDate","PTax",
  "basic","dailywages","hra","vda","cca","cea","conv","gunall","washall",
  "cycleall","foodAll","medical","MedicalAll","AddAmt","OutSAll","CarWashAll",
  "ATMAmt","ExGratia","OTAmt","ReimburseAmt","LTA","Gross","egi","bonus",
  "incometax","sCharge","ConvDed","allowences","othall","specialAll",
  "prodAll","powderAll","consolidateAll","UnfAll","driverAll","gardeningAll",
  "acmdAll","EduAll","TelAll","Misc","Fuel","Travel","House","Peon","Water",
  "taAll","Att_Reward","gSLIDed","SuspensAllow","NightShiftAllow","splDed",
  "bondDed","SecDep","washAllNew","LIC","Sumassured",
  "ctc","grossCTC","ctcRate","HRAper","pfamount","esiamount","ctcamount",
  "pfdedAmt","esidedamt","vpfamt",
  "SalHead1","SalHead2","SalHead3","SalHead4","SalHead5","SalHead6",
  "SalHead7","SalHead8","SalHead9","SalHead10","SalHead11","SalHead12",
  "SalHead13","SalHead14","SalHead15","SalHead16","SalHead17",
  "FixRate","FixRateApp","IsPerDayRate","IsConvPerDay","PerDayRate","EmpMday",
  "opt_basic","opt_hra","opt_conv","opt_washall","opt_medical","opt_bonus",
  "opt_othall","opt_outsall","opt_carwashall","opt_allowences","opt_misc",
  "opt_fuel","opt_travel","opt_house","opt_peon","opt_water",
  "IsBasicESI","IsHraESI","IsConvESI","IsProESI","IsPowdESI","IswashESI",
  "IsMediESI","IsConsoESI","IsSplESI","IsUnfESI","IsDriverESI","IsGardESI",
  "IsAcmdESI","IsAttAllESI","IsBonusESI","IsLeaveESI",
  "IsBasicPer","IsHraPer","IsConvPer","IsProPer","IsPowdPer","IswashPer",
  "IsMediPer","IsConsoPer","IsSplPer","IsUnfPer","IsDriverPer","IsGardPer",
  "IsAcmdPer","IsAttAllPer","IsBonusPer","IsLeavePer",
  "chkPFHead1","chkPFHead2","chkPFHead3","chkPFHead4","chkPFHead5",
  "chkPFHead6","chkPFHead7","chkPFHead8","chkPFHead9","chkPFHead10",
  "chkPFHead11","chkPFHead12","chkPFHead13","chkPFHead14","chkPFHead15",
  "chkPFHead16","chkPFHead17",
  "chkOTHead1","chkOTHead2","chkOTHead3","chkOTHead4","chkOTHead5",
  "chkOTHead6","chkOTHead7","chkOTHead8","chkOTHead9","chkOTHead10",
  "CHK_OTRATE",
  "IsAllowOT","IsBonus","medicalelig","EnrollMentAmt","EnrollAmtDr",
  "pf_arear","oth_arear","Wash_Arrear","IDIssueYesNo","Witness_name",
  "FH_Name_Witness","Witness_Address","IsLeave","IsTPADed","IsWashDed",
  "bonusOn","bonusRate","bonusLimit","EmpMBonus","IsBonusRateApp","bList",
  "ref","contnoref","addref1","addref2","localadd1","localadd2",
  "contnolocal","localpin","LOCALSTATE","localDist","permanentpin","PERMANENTSTATE","permanentDist",
  "IDProof","IDProofNo","IDProofExpDate","IDProofName","vID",
  "Doc1Type","Doc1No","Doc2Type","Doc2No","Doc1Name",
  "PIssueDate","PValidDate","police","police_Vari","pVCode",
  "pSARA_Trng","PSARA_Detail","RepCode","RepName",
  "GMC","GMCNo","GPANo","GTLNo","DomicileOfHariyana",
  "othdet1","othdet2","category","Nationality",
  "ESIWAGE_AREAR","RESTARR","SArrPFLimit","opt_SArrpflimit","updreason",
  "cpftest","LTAArr","medicalArr",
]);



// ── Employee Excel import/export configuration ───────────────────────────────
// Template intentionally contains practical onboarding fields, not every legacy
// EMPMAST column. Verification status is always server-controlled: an Aadhaar,
// UAN or ESIC number imported from Excel is NOT treated as verified.
const EMPLOYEE_IMPORT_COLUMNS = [
  "EmpCode","EmpName","FHName","mothername","DOB","Sex","Married","MobNo","emailID",
  "compid","unitcode","deptcode","designation","GradeCode","catcode",
  "DOJ","RDOJ","workstatus","modeofpay",
  "SavingBankName","NameInBank","acno","SavingIFSCCode",
  "adharcardno","NameOnAdhar","PAN_no","NameOnPAN",
  "APPLICABLE","UANNo","pfDate","CHK_ESIMUST","tokanno","EsiDate",
  "IsPtax","PTaxDate","IsLWF","LwfDate",
  "localadd1","localadd2","localDist","LOCALSTATE","localpin",
  "permanentDist","PERMANENTSTATE","permanentpin",
  "IsRejoin","oldEmpcode",
  ...Array.from({ length: 17 }, (_, i) => `SalHead${i + 1}`),
] as const;

const IMPORT_DATE_FIELDS = new Set(["DOB","DOJ","RDOJ","pfDate","EsiDate","PTaxDate","LwfDate"]);
const IMPORT_NUMERIC_FIELDS = new Set([
  "compid","GradeCode", ...Array.from({ length: 17 }, (_, i) => `SalHead${i + 1}`),
]);

function normalizeExcelDate(v: string): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 1 && serial < 100000) {
      const epoch = Date.UTC(1899, 11, 30);
      const d = new Date(epoch + Math.floor(serial) * 86400000);
      return d.toISOString().slice(0, 10);
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

function normalizeImportRow(row: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of EMPLOYEE_IMPORT_COLUMNS) {
    let raw = String(row[key] ?? "").trim();
    if (!raw) continue;
    if (IMPORT_DATE_FIELDS.has(key)) raw = normalizeExcelDate(raw);
    if (IMPORT_NUMERIC_FIELDS.has(key)) {
      const n = Number(raw);
      out[key] = Number.isFinite(n) ? n : raw;
    } else {
      out[key] = raw;
    }
  }
  // Import never carries verification proof. Aadhaar/UAN/ESIC numbers may be
  // present, but verification must be completed from the employee screen later.
  out.IsKYC = "No";
  return out;
}

type ImportError = { row: number; empCode: string; error: string };
type ValidImportRow = { row: number; data: Record<string, unknown> };

async function validateEmployeeImportRows(
  rawRows: Array<Record<string, string>>,
  user: ClientAuthUser,
): Promise<{ valid: ValidImportRow[]; errors: ImportError[] }> {
  const [companyRows, unitRows, deptRows, desigRows, gradeRows, catRows, existingRows, scope] = await Promise.all([
    queryRows<{ compid: number }>(`SELECT "compid" FROM "COMPANYMAST" WHERE "compid" IS NOT NULL`),
    queryRows<Record<string, unknown>>(`SELECT "compcode", "unitcode", ${Array.from({length:17},(_,i)=>`"SalHead${i+1}"`).join(", ")}, ${Array.from({length:17},(_,i)=>`"SalHeadDefault${i+1}"`).join(", ")} FROM "UNITMASTER"`),
    queryRows<{ deptcode: string }>(`SELECT "deptcode" FROM "DEPTMAST"`),
    queryRows<{ DESICODE: number; is_active?: boolean }>(`SELECT "DESICODE", COALESCE("is_active", TRUE) AS is_active FROM "DESIGNATIONMASTER"`),
    queryRows<{ GradeCode: number }>(`SELECT "GradeCode" FROM "GRADEMASTER"`),
    queryRows<{ catcode: string; compid: string }>(`SELECT "catcode", "compid" FROM "categorymaster"`),
    queryRows<{ compid: number; EmpCode: string }>(`SELECT "compid", "EmpCode" FROM "EMPMAST"`),
    loadUserScope(user.id, user.role),
  ]);
  const companies = new Set(companyRows.map(r => Number(r.compid)));
  const units = new Map<string, Record<string, unknown>>();
  for (const r of unitRows) units.set(`${Number(r.compcode)}|${String(r.unitcode ?? "").trim().toLowerCase()}`, r);
  const depts = new Set(deptRows.map(r => String(r.deptcode).trim().toLowerCase()));
  const desigs = new Map(desigRows.map(r => [Number(r.DESICODE), r.is_active !== false]));
  const grades = new Set(gradeRows.map(r => Number(r.GradeCode)));
  const cats = new Set(catRows.map(r => `${String(r.compid)}|${String(r.catcode).trim().toLowerCase()}`));
  const existing = new Set(existingRows.map(r => `${Number(r.compid)}|${String(r.EmpCode).trim().toLowerCase()}`));
  const seen = new Set<string>();
  const valid: ValidImportRow[] = [];
  const errors: ImportError[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNo = i + 2;
    const body = normalizeImportRow(rawRows[i]);
    const empCode = String(body.EmpCode ?? "").trim();
    const fail = (error: string) => errors.push({ row: rowNo, empCode, error });
    const fieldErr = validateWorker(body, true);
    if (fieldErr) { fail(fieldErr); continue; }
    const compid = Number(body.compid);
    if (!companies.has(compid)) { fail("Company not found"); continue; }
    const unitcode = String(body.unitcode ?? "").trim();
    // Employee import mirrors the Add Employee Client dropdown: the Excel row
    // supplies compid + unitcode, and that pair must resolve to an existing
    // UNITMASTER record. Nothing is created from Excel and no UI dropdown is
    // mutated during import.
    if (!unitcode) { fail("Client/Unit Code is required for employee import"); continue; }
    const unit = units.get(`${compid}|${unitcode.toLowerCase()}`);
    if (!unit) { fail("Client/Unit not found under the selected company"); continue; }
    if (!isInScope(scope, compid, undefined, undefined, unitcode)) { fail("Organization/Client is outside the user's assigned scope"); continue; }
    if (body.deptcode && !depts.has(String(body.deptcode).trim().toLowerCase())) { fail("Department not found"); continue; }
    if (body.designation != null && body.designation !== "") {
      const d = Number(body.designation);
      if (!Number.isInteger(d) || !desigs.has(d)) { fail("Designation not found"); continue; }
      if (!desigs.get(d)) { fail("Designation is inactive"); continue; }
    }
    if (body.GradeCode != null && body.GradeCode !== "" && !grades.has(Number(body.GradeCode))) { fail("Grade not found"); continue; }
    if (body.catcode && !cats.has(`${compid}|${String(body.catcode).trim().toLowerCase()}`)) { fail("Category not found for the selected company"); continue; }
    const key = `${compid}|${empCode.toLowerCase()}`;
    if (seen.has(key)) { fail("Duplicate Employee Code within the uploaded file"); continue; }
    if (existing.has(key)) { fail("Employee Code already exists under this company"); continue; }
    seen.add(key);
    if (["1","true","yes"].includes(String(body.CHK_ESIMUST ?? "").toLowerCase()) && !String(body.tokanno ?? "").trim()) { fail("ESIC/IP number is required when ESI is applicable"); continue; }
    if (["1","true","yes"].includes(String(body.IsRejoin ?? "").toLowerCase())) {
      const old = String(body.oldEmpcode ?? "").trim();
      if (!old || old.toLowerCase() === empCode.toLowerCase()) { fail("Rejoinee requires a different Previous Employee Code"); continue; }
      const prior = await queryOne<Record<string, unknown>>(`SELECT * FROM "EMPMAST" WHERE LOWER(TRIM("EmpCode"))=LOWER($1) AND "compid"=$2 ORDER BY "RecordInsertDate" DESC NULLS LAST LIMIT 1`, [old, compid]);
      if (!prior) { fail("Previous employee record not found for rejoinee"); continue; }
      const status = String(prior.workstatus ?? "").trim().toUpperCase();
      const exit = firstNonEmptyValue(prior, ["DOL","ResignDate","ResignationDate","LeavingDate","RelievingDate","LastWorkingDate","DateOfLeaving"]);
      if (!exit.value && !new Set(["L","LEFT","R","RESIGNED","T","TERMINATED","SEPARATED","EXITED"]).has(status)) { fail("Previous employee does not have confirmed separation evidence"); continue; }
    }
    // Resolve salary exactly the same way as normal Employee creation:
    // - UNITMASTER.SalHeadN decides whether slot N is applicable for this Client.
    // - An Excel SalHeadN value overrides the Client default for this employee.
    // - A blank Excel value inherits UNITMASTER.SalHeadDefaultN.
    // - If the Client does not use slot N, ignore any Excel value for that slot.
    for (let n = 1; n <= 17; n++) {
      const valueKey = `SalHead${n}`;
      const componentName = String(unit[`SalHead${n}`] ?? "").trim();
      if (!componentName) {
        delete body[valueKey];
        continue;
      }
      const supplied = body[valueKey];
      if (supplied == null || supplied === "") {
        const clientDefault = unit[`SalHeadDefault${n}`];
        if (clientDefault != null && clientDefault !== "") body[valueKey] = clientDefault;
      }
    }
    valid.push({ row: rowNo, data: body });
  }
  return { valid, errors };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePage(p?: string, ps?: string) {
  const page     = Math.max(1, parseInt(p  ?? "1",  10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(ps ?? "50", 10) || 50));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function maskRow(emp: Record<string, unknown>, canExport: boolean): Record<string, unknown> {
  if (canExport) return emp;
  const m = { ...emp };
  for (const f of SENSITIVE_COLS) {
    if (m[f] == null) continue;
    const s = String(m[f]).replace(/[\s-]/g, "");
    if (f === "adharcardno") {
      m[f] = s.length >= 4 ? "XXXXXXXX" + s.slice(-4) : "****";
    } else if (f === "PAN_no") {
      m[f] = s.length >= 5 ? "XXXXX" + s.slice(-5) : "****";
    } else {
      m[f] = s.length >= 4 ? "XXXX-" + s.slice(-4) : "****";
    }
  }
  return m;
}

function stripComputed(emp: Record<string, unknown>): void {
  for (const f of COMPUTED_COLS) delete emp[f];
}

function canExportCheck(req: import("express").Request): boolean {
  const u = req.clientUser!;
  return (
    u.role === "Admin" ||
    u.permissions.includes("workers:export") ||
    u.permissions.includes("workers:all")
  );
}

function canViewFullAadhaar(req: import("express").Request): boolean {
  const u = req.clientUser!;
  return (
    u.role === "Admin" ||
    u.permissions.includes("workers:write") ||
    u.permissions.includes("workers:all") ||
    u.permissions.includes("workers:export")
  );
}

function firstNonEmptyValue(emp: Record<string, unknown>, keys: string[]): { field: string | null; value: string | null } {
  for (const field of keys) {
    const raw = emp[field];
    if (raw == null) continue;
    const value = String(raw).trim();
    if (value && value !== "0000-00-00" && value !== "1900-01-01") return { field, value };
  }
  return { field: null, value: null };
}

function validateWorker(body: Record<string, unknown>, isCreate: boolean, changedFields?: Set<string>): string | null {
  if (isCreate) {
    if (!String(body.EmpCode ?? "").trim())             return "EmpCode is required";
    if (String(body.EmpCode).trim().length > 25)        return "EmpCode must be ≤25 characters";
    if (body.compid == null || body.compid === "")       return "compid (company) is required";
    if (isNaN(Number(body.compid)))                      return "compid must be a number";
    if (!body.DOJ)                                       return "DOJ (date of joining) is required";
    if (!String(body.workstatus ?? "").trim())           return "workstatus is required";
    if (!String(body.EmpName ?? "").trim())              return "EmpName is required";
  }
  if (body.EmpName != null && String(body.EmpName).trim() === "") return "EmpName cannot be empty";
  if (body.EmpName && String(body.EmpName).length > 50) return "EmpName must be ≤50 characters";

  if (body.DOB && body.DOB !== "" && isNaN(new Date(body.DOB as string).getTime()))
    return "DOB is not a valid date";
  if (body.DOJ && body.DOJ !== "" && isNaN(new Date(body.DOJ as string).getTime()))
    return "DOJ is not a valid date";
  if (body.DOB && body.DOJ && body.DOB !== "" && body.DOJ !== "") {
    if (new Date(body.DOJ as string) <= new Date(body.DOB as string))
      return "DOJ must be after DOB";
  }
  if (body.RDOJ && body.RDOJ !== "" && isNaN(new Date(body.RDOJ as string).getTime()))
    return "RDOJ is not a valid date";

  if (body.MobNo && body.MobNo !== "") {
    const mob = String(body.MobNo).replace(/\s/g, "");
    if (!MOBILE_RE.test(mob)) return "MobNo must be exactly 10 digits";
  }
  if (body.emailID && body.emailID !== "") {
    if (!EMAIL_RE.test(String(body.emailID)))  return "emailID is not a valid email address";
    if (String(body.emailID).length > 50)       return "emailID must be ≤50 characters";
  }
  if (body.PAN_no && body.PAN_no !== "") {
    if (!PAN_RE.test(String(body.PAN_no).toUpperCase())) return "PAN_no must be in format AAAAA9999A";
  }
  if (body.adharcardno && body.adharcardno !== "") {
    const a = String(body.adharcardno).replace(/[\s-]/g, "");
    // Accept: 12 digits (manual entry) OR QR-verified masked reference (XXXXXXXXNNNN)
    if (!/^\d{12}$/.test(a) && !/^X{8}\d{4}$/i.test(a)) {
      return "adharcardno must be 12 digits or a QR-verified masked reference";
    }
  }
  if (body.UANNo && body.UANNo !== "") {
    if (!UAN_RE.test(String(body.UANNo))) return "UANNo must be exactly 12 digits";
  }
  // On PATCH, validate IFSC-format fields only when that specific field is being changed.
  // This prevents unrelated bank-detail updates from being blocked by legacy values
  // already stored in UANBankIFSC/PFBankIFSC.
  const shouldValidateField = (field: string) => isCreate || !changedFields || changedFields.has(field);
  if (shouldValidateField("SavingIFSCCode") && body.SavingIFSCCode && body.SavingIFSCCode !== "") {
    if (!IFSC_RE.test(String(body.SavingIFSCCode).trim().toUpperCase())) return "SavingIFSCCode is not a valid IFSC code";
  }
  if (shouldValidateField("UANBankIFSC") && body.UANBankIFSC && body.UANBankIFSC !== "") {
    if (!IFSC_RE.test(String(body.UANBankIFSC).trim().toUpperCase())) return "UANBankIFSC is not a valid IFSC code";
  }
  if (shouldValidateField("PFBankIFSC") && body.PFBankIFSC && body.PFBankIFSC !== "") {
    if (!IFSC_RE.test(String(body.PFBankIFSC).trim().toUpperCase())) return "PFBankIFSC is not a valid IFSC code";
  }

  const numericFields = [
    "basic","hra","vda","conv","cca","cea","Gross","ctc","grossCTC",
    "pf","esi","VPF","VPFRate","PFLimit","ESILimit",
    "medical","MedicalAll","washall","LTA","EduAll","TelAll",
  ];
  for (const f of numericFields) {
    const v = body[f];
    if (v != null && v !== "" && (isNaN(Number(v)) || Number(v) < 0))
      return `${f} must be a non-negative number`;
  }

  const payMode = String(body.modeofpay ?? "").trim().toLowerCase();
  if (payMode === "bank") {
    if (!String(body.acno          ?? "").trim()) return "acno (bank account number) is required for Bank payment mode";
    if (!String(body.SavingIFSCCode ?? "").trim()) return "SavingIFSCCode (IFSC) is required for Bank payment mode";
    if (!String(body.NameInBank    ?? "").trim()) return "NameInBank is required for Bank payment mode";
  }

  const pfApplicable = String(body.APPLICABLE ?? "").trim().toLowerCase();
  if (pfApplicable === "true" || pfApplicable === "yes" || pfApplicable === "1") {
    if (!String(body.UANNo ?? "").trim()) return "UANNo is required when PF is applicable";
  }

  return null;
}

function buildSetClause(
  body: Record<string, unknown>,
  startIdx: number,
): { setCols: string[]; vals: unknown[] } {
  const setCols: string[] = [];
  const vals:    unknown[] = [];
  let idx = startIdx;
  for (const [key, val] of Object.entries(body)) {
    if (!WRITABLE_COLS.has(key) || SYSTEM_COLS.has(key)) continue;
    setCols.push(`"${key}" = $${idx}`);
    vals.push(val === "" ? null : val);
    idx++;
  }
  return { setCols, vals };
}



// ── GET /api/workers/counts ───────────────────────────────────────────────────
router.get("/workers/counts", ...canRead, async (req, res): Promise<void> => {
  const { compid, clientcode, unitcode } = req.query as Record<string, string>;
  const user = req.clientUser!;
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (compid)      { params.push(parseInt(compid, 10));      conditions.push(`"compid" = $${params.length}`);      }
  if (clientcode)  { params.push(parseInt(clientcode, 10));  conditions.push(`"clientcode" = $${params.length}`);  }
  if (unitcode)    { params.push(unitcode);                  conditions.push(`"unitcode" = $${params.length}`);    }

  // HR Manager scope enforcement
  const { extraConds, params: scopedParams } = await buildWorkerScopeFilter(user.id, user.role, params);
  const allConds = [...conditions, ...extraConds];
  const where = allConds.length > 0 ? `WHERE ${allConds.join(" AND ")}` : "";

  const rows = await queryRows<{ workstatus: string | null; cnt: string }>(
    `SELECT "workstatus", COUNT(*)::text AS cnt FROM "EMPMAST" e ${where} GROUP BY "workstatus"`,
    scopedParams
  );

  const counts: Record<string, number> = { total: 0 };
  for (const r of rows) {
    const key = (r.workstatus ?? "unknown").toLowerCase().replace(/\s+/g, "_");
    const n   = parseInt(r.cnt, 10);
    counts[key] = n;
    counts.total += n;
  }
  res.json(counts);
});

// ── GET /api/workers ──────────────────────────────────────────────────────────
router.get("/workers", ...canRead, async (req, res): Promise<void> => {
  const {
    compid, clientcode, unitcode, branchcode, workstatus, search,
    page: pageStr, pageSize: pageSizeStr,
  } = req.query as Record<string, string>;
  const { page, pageSize, offset } = parsePage(pageStr, pageSizeStr);
  const user = req.clientUser!;
  const p: unknown[] = [];
  const conds: string[] = [];

  if (compid)      { p.push(parseInt(compid, 10));      conds.push(`e."compid"     = $${p.length}`); }
  if (clientcode)  { p.push(parseInt(clientcode, 10));  conds.push(`e."clientcode" = $${p.length}`); }
  if (unitcode)    { p.push(unitcode);                   conds.push(`e."unitcode"   = $${p.length}`); }
  if (branchcode)  { p.push(parseInt(branchcode, 10));  conds.push(`e."branchcode" = $${p.length}`); }
  if (workstatus)  { p.push(workstatus);                 conds.push(`e."workstatus" = $${p.length}`); }
  if (search) {
    p.push(`%${search}%`);
    conds.push(`(e."EmpCode" ILIKE $${p.length} OR e."EmpName" ILIKE $${p.length} OR e."MobNo" ILIKE $${p.length})`);
  }

  // HR Manager scope enforcement
  const { extraConds, params: scopedP } = await buildWorkerScopeFilter(user.id, user.role, p);
  const allConds = [...conds, ...extraConds];
  const where = allConds.length ? `WHERE ${allConds.join(" AND ")}` : "";
  const total = await queryScalar<string>(`SELECT COUNT(*) FROM "EMPMAST" e ${where}`, [...scopedP]);

  scopedP.push(pageSize, offset);
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT ${LIST_SELECT}
     FROM "EMPMAST" e
     ${LOOKUP_JOINS}
     ${where}
     ORDER BY e."compid", e."unitcode", e."EmpCode"
     LIMIT $${scopedP.length - 1} OFFSET $${scopedP.length}`,
    scopedP
  );

  const canExp = canExportCheck(req);
  res.json({
    data: rows.map((r) => maskRow(r, canExp)),
    total: parseInt(total ?? "0", 10),
    page,
    pageSize,
  });
});


// ── GET /api/workers/import-template.xlsx ────────────────────────────────────
router.get("/workers/import-template.xlsx", ...canWrite, async (_req, res): Promise<void> => {
  const workbook = createXlsx([...EMPLOYEE_IMPORT_COLUMNS], [], "Employees");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="Employee_Import_Template.xlsx"');
  res.send(workbook);
});

// ── POST /api/workers/import/validate ─────────────────────────────────────────
router.post("/workers/import/validate", ...canWrite, importUpload.single("file"), async (req, res): Promise<void> => {
  if (!req.file?.buffer) { res.status(400).json({ error: "Excel file is required" }); return; }
  if (!/\.xlsx$/i.test(req.file.originalname || "")) { res.status(400).json({ error: "Please upload an .xlsx Excel file" }); return; }
  let rows: Array<Record<string, string>>;
  try { rows = parseFirstSheetXlsx(req.file.buffer); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Could not read Excel file" }); return; }
  if (!rows.length) { res.status(400).json({ error: "Excel file has no employee rows" }); return; }
  if (rows.length > 5000) { res.status(400).json({ error: "A maximum of 5,000 employees can be imported at one time" }); return; }

  const unknownHeaders = Object.keys(rows[0] ?? {}).filter(h => !EMPLOYEE_IMPORT_COLUMNS.includes(h as any));
  const missingHeaders = ["EmpCode","EmpName","compid","unitcode","DOJ","workstatus"].filter(h => !(h in (rows[0] ?? {})));
  if (missingHeaders.length) {
    res.status(400).json({ error: `Missing required template columns: ${missingHeaders.join(", ")}` }); return;
  }

  const result = await validateEmployeeImportRows(rows, req.clientUser!);
  res.json({
    totalRows: rows.length,
    validCount: result.valid.length,
    errorCount: result.errors.length,
    errors: result.errors.slice(0, 500),
    hasMoreErrors: result.errors.length > 500,
    unknownHeaders,
    preview: result.valid.slice(0, 20).map(v => ({
      row: v.row,
      EmpCode: v.data.EmpCode,
      EmpName: v.data.EmpName,
      compid: v.data.compid,
      unitcode: v.data.unitcode ?? null,
      salaryValues: Object.fromEntries(Array.from({ length: 17 }, (_, i) => {
        const key = `SalHead${i + 1}`;
        return [key, v.data[key] ?? null];
      })),
    })),
    note: "Imported Aadhaar/UAN/ESIC numbers remain unverified until verification is completed from the employee screen.",
  });
});

// ── POST /api/workers/import ──────────────────────────────────────────────────
router.post("/workers/import", ...canWrite, importUpload.single("file"), async (req, res): Promise<void> => {
  if (!req.file?.buffer) { res.status(400).json({ error: "Excel file is required" }); return; }
  if (!/\.xlsx$/i.test(req.file.originalname || "")) { res.status(400).json({ error: "Please upload an .xlsx Excel file" }); return; }
  let rows: Array<Record<string, string>>;
  try { rows = parseFirstSheetXlsx(req.file.buffer); }
  catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : "Could not read Excel file" }); return; }
  if (!rows.length) { res.status(400).json({ error: "Excel file has no employee rows" }); return; }
  if (rows.length > 5000) { res.status(400).json({ error: "A maximum of 5,000 employees can be imported at one time" }); return; }

  const result = await validateEmployeeImportRows(rows, req.clientUser!);
  if (result.errors.length) {
    res.status(400).json({
      error: "Import blocked because one or more rows failed validation",
      totalRows: rows.length,
      validCount: result.valid.length,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 500),
      hasMoreErrors: result.errors.length > 500,
    });
    return;
  }

  const user = req.clientUser!;
  await withTransaction(async (client) => {
    for (const item of result.valid) {
      const body = item.data;
      const empCode = String(body.EmpCode).trim();
      const compid = Number(body.compid);
      const cols: string[] = ['"EmpCode"','"compid"','"RecordInsertByUserID"','"RecordInsertDate"'];
      const vals: unknown[] = [empCode, compid, user.id, new Date()];
      const phs: string[] = ["$1","$2","$3","$4"];
      let idx = 5;
      for (const [key, val] of Object.entries(body)) {
        if (key === "EmpCode" || key === "compid" || key === "IsKYC") continue;
        if (!WRITABLE_COLS.has(key) || SYSTEM_COLS.has(key)) continue;
        cols.push(`"${key}"`); phs.push(`$${idx++}`); vals.push(val === "" ? null : val);
      }
      // Excel import never establishes identity/statutory verification.
      if (String(body.adharcardno ?? "").trim()) {
        cols.push('"IsKYC"'); phs.push(`$${idx++}`); vals.push("No");
      }
      if (String(body.UANNo ?? "").trim()) {
        cols.push('"uan_verification_status"','"uan_verified_at"','"uan_verification_provider"','"uan_verification_reference"');
        phs.push(`$${idx++}`,`$${idx++}`,`$${idx++}`,`$${idx++}`); vals.push("PENDING", null, null, null);
      }
      if (String(body.tokanno ?? "").trim()) {
        cols.push('"esic_verification_status"','"esic_verified_at"','"esic_verification_provider"','"esic_verification_reference"');
        phs.push(`$${idx++}`,`$${idx++}`,`$${idx++}`,`$${idx++}`); vals.push("PENDING", null, null, null);
      }
      await client.query(`INSERT INTO "EMPMAST" (${cols.join(", ")}) VALUES (${phs.join(", ")})`, vals);
    }
  });

  await logClientAction(user.id, "worker.import", { rows: result.valid.length });
  res.status(201).json({ success: true, imported: result.valid.length, message: `${result.valid.length} employees imported successfully. Identity/statutory numbers remain pending verification.` });
});

// ── GET /api/workers/export.xlsx ──────────────────────────────────────────────
router.get("/workers/export.xlsx", ...canRead, async (req, res): Promise<void> => {
  if (!canExportCheck(req)) { res.status(403).json({ error: "Forbidden: requires workers:export" }); return; }
  const { compid, clientcode, unitcode, branchcode, workstatus, search } = req.query as Record<string, string>;
  const user = req.clientUser!;
  const p: unknown[] = [];
  const conds: string[] = [];
  if (compid)      { p.push(parseInt(compid, 10));     conds.push(`e."compid" = $${p.length}`); }
  if (clientcode)  { p.push(parseInt(clientcode, 10)); conds.push(`e."clientcode" = $${p.length}`); }
  if (unitcode)    { p.push(unitcode);                  conds.push(`e."unitcode" = $${p.length}`); }
  if (branchcode)  { p.push(parseInt(branchcode, 10)); conds.push(`e."branchcode" = $${p.length}`); }
  if (workstatus)  { p.push(workstatus);                conds.push(`e."workstatus" = $${p.length}`); }
  if (search) { p.push(`%${search}%`); conds.push(`(e."EmpCode" ILIKE $${p.length} OR e."EmpName" ILIKE $${p.length} OR e."MobNo" ILIKE $${p.length})`); }
  const scoped = await buildWorkerScopeFilter(user.id, user.role, p);
  const allConds = [...conds, ...scoped.extraConds];
  const where = allConds.length ? `WHERE ${allConds.join(" AND ")}` : "";
  const exportCols = [...EMPLOYEE_IMPORT_COLUMNS, "uan_verification_status", "esic_verification_status"];
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT ${exportCols.map(c => `e."${c}"`).join(", ")} FROM "EMPMAST" e ${where} ORDER BY e."compid", e."unitcode", e."EmpCode"`,
    scoped.params,
  );
  const workbook = createXlsx(exportCols, rows, "Employees");
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Employees_${stamp}.xlsx"`);
  await logClientAction(user.id, "worker.export", { rows: rows.length, filters: { compid, clientcode, unitcode, branchcode, workstatus, search } });
  res.send(workbook);
});

// ── GET /api/workers/rejoin-check?empCode=... ──────────────────────────────────
// Used only during Add Employee. Returns the prior EMPMAST row for an exact
// employee-code match so HR can reuse stable personal/KYC/bank/statutory data.
// A record is treated as a prior employment only when there is separation
// evidence: a real exit/resignation/relieving date or an explicit separated
// status. Merely being INACTIVE/SUSPENDED is not enough.
// The old record is never changed. A rejoinee must be saved as a new EMPMAST
// row with a different Employee Code; the old code is retained in oldEmpcode.
router.get("/workers/rejoin-check", ...canWrite, async (req, res): Promise<void> => {
  const empCode = String(req.query.empCode ?? "").trim();
  if (!empCode) { res.status(400).json({ error: "Employee ID is required" }); return; }

  const emp = await queryOne<Record<string, unknown>>(
    `SELECT * FROM "EMPMAST" WHERE LOWER(TRIM("EmpCode")) = LOWER($1) ORDER BY "RecordInsertDate" DESC NULLS LAST LIMIT 1`,
    [empCode]
  );

  if (!emp) { res.json({ found: false }); return; }

  const inScope = await assertWorkerScope(
    req, res,
    Number(emp.compid),
    emp.branchcode != null ? Number(emp.branchcode) : undefined,
    emp.clientcode != null ? Number(emp.clientcode) : undefined,
    emp.unitcode != null ? String(emp.unitcode) : undefined,
  );
  if (!inScope) return;

  stripComputed(emp);
  const status = String(emp.workstatus ?? "").trim().toUpperCase();
  const separatedStatuses = new Set(["L", "LEFT", "R", "RESIGNED", "T", "TERMINATED", "SEPARATED", "EXITED"]);
  const exit = firstNonEmptyValue(emp, [
    "DOL",
    "ResignDate",
    "ResignationDate",
    "LeavingDate",
    "RelievingDate",
    "LastWorkingDate",
    "DateOfLeaving",
  ]);
  const hasExitDate = !!exit.value;
  const isRejoinee = hasExitDate || separatedStatuses.has(status);
  const activeStatuses = new Set(["A", "ACTIVE"]);
  const active = activeStatuses.has(status) && !isRejoinee;

  await logClientAction(req.clientUser!.id, "worker.rejoin_check", {
    empCode: String(emp.EmpCode ?? empCode),
    found: true,
    isRejoinee,
    exitDateField: exit.field,
    exitDate: exit.value,
  });

  // canWrite is required for this endpoint because it can return fields that are
  // normally masked in read-only views and are needed to repopulate onboarding.
  res.json({
    found: true,
    isRejoinee,
    active,
    previousEmpCode: emp.EmpCode,
    exitDateField: exit.field,
    exitDate: exit.value,
    separationReason: emp.resg_det ?? null,
    employee: emp,
  });
});

// ── GET /api/workers/:EmpCode ─────────────────────────────────────────────────
router.get("/workers/:EmpCode", ...canRead, async (req, res): Promise<void> => {
  const { EmpCode } = req.params;

  const emp = await queryOne<Record<string, unknown>>(
    `SELECT e.*,
       c."Clientname", u."Unitname", desig."DESINAME", dept."Deptname",
       g."GradeName",  b."BranchName", z."zonename",   comp."comname",
       cat."catname"
     FROM "EMPMAST" e
     ${LOOKUP_JOINS}
     WHERE e."EmpCode" = $1
     LIMIT 1`,
    [EmpCode]
  );

  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

  // Scope check for restricted roles
  const inScope = await assertWorkerScope(
    req, res,
    Number(emp.compid),
    emp.branchcode != null ? Number(emp.branchcode) : undefined,
    emp.clientcode != null ? Number(emp.clientcode) : undefined,
    emp.unitcode != null ? String(emp.unitcode) : undefined,
  );
  if (!inScope) return;

  stripComputed(emp);
  const visible = maskRow(emp, canExportCheck(req));
  // Client requirement: HR/Admin employee-management screens must show the
  // complete Aadhaar number that was actually entered, including in PF/ESI.
  // Other sensitive fields continue to follow the existing masking policy.
  if (canViewFullAadhaar(req) && emp.adharcardno != null) {
    visible.adharcardno = emp.adharcardno;
  }
  res.json(visible);
});

// ── POST /api/workers — create ────────────────────────────────────────────────
router.post("/workers", ...canWrite, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const user = req.clientUser!;

  // 1. Field validation
  const fieldErr = validateWorker(body, true);
  if (fieldErr) { res.status(400).json({ error: fieldErr }); return; }

  const empCode = String(body.EmpCode).trim();
  const compid  = Number(body.compid);

  const isRejoin = ["1", "true", "yes"].includes(String(body.IsRejoin ?? "").trim().toLowerCase());
  const oldEmpCode = String(body.oldEmpcode ?? "").trim();
  if (isRejoin) {
    if (!oldEmpCode) {
      res.status(400).json({ error: "Previous Employee Code is required for a rejoinee" });
      return;
    }
    if (oldEmpCode.toLowerCase() === empCode.toLowerCase()) {
      res.status(400).json({ error: "Rejoinee must have a new Employee Code different from the previous Employee Code" });
      return;
    }
  }


  // 2. Relationship validation
  const compExists = await queryScalar<string>(
    `SELECT 1 FROM "COMPANYMAST" WHERE "compid" = $1`, [compid]
  );
  if (!compExists) { res.status(400).json({ error: "Company not found" }); return; }

  // Scope enforcement: HR Manager can only create workers within their scope
  const scopeOk = await assertWorkerScope(
    req, res,
    compid,
    body.branchcode != null && body.branchcode !== "" ? Number(body.branchcode) : undefined,
    body.clientcode != null && body.clientcode !== "" ? Number(body.clientcode) : undefined,
    body.unitcode != null && body.unitcode !== "" ? String(body.unitcode) : undefined,
  );
  if (!scopeOk) return;

  if (body.clientcode != null && body.clientcode !== "") {
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "CLIENTMASTER" WHERE "clientcode" = $1 AND "compid" = $2`,
      [Number(body.clientcode), compid]
    );
    if (!ok) { res.status(400).json({ error: "Client not found or does not belong to the selected company" }); return; }
  }

  if (body.branchcode != null && body.branchcode !== "") {
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "BRANCH" WHERE "BranchCode" = $1 AND "compid" = $2`,
      [Number(body.branchcode), compid]
    );
    if (!ok) { res.status(400).json({ error: "Branch not found or does not belong to the selected company" }); return; }
  }

  if (body.unitcode != null && body.unitcode !== "") {
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "UNITMASTER" WHERE "unitcode" = $1 AND "compcode" = $2`,
      [String(body.unitcode), compid]
    );
    if (!ok) { res.status(400).json({ error: "Unit not found or does not belong to the selected company" }); return; }

    if (body.clientcode != null && body.clientcode !== "") {
      const match = await queryScalar<string>(
        `SELECT 1 FROM "UNITMASTER" WHERE "unitcode" = $1 AND "clientcode" = $2`,
        [String(body.unitcode), Number(body.clientcode)]
      );
      if (!match) { res.status(400).json({ error: "Unit does not belong to the selected client" }); return; }
    }

    // Cross-check: unit must belong to the selected branch
    if (body.branchcode != null && body.branchcode !== "") {
      const branchMatch = await queryScalar<string>(
        `SELECT 1 FROM "UNITMASTER" WHERE "unitcode" = $1 AND "branchcode" = $2`,
        [String(body.unitcode), Number(body.branchcode)]
      );
      if (!branchMatch) { res.status(400).json({ error: "Unit does not belong to the selected branch" }); return; }
    }
  }

  if (body.deptcode != null && body.deptcode !== "") {
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "DEPTMAST" WHERE "deptcode" = $1`, [String(body.deptcode)]
    );
    if (!ok) { res.status(400).json({ error: "Department not found" }); return; }
  }

  if (body.GradeCode != null && body.GradeCode !== "") {
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "GRADEMASTER" WHERE "GradeCode" = $1`, [Number(body.GradeCode)]
    );
    if (!ok) { res.status(400).json({ error: "Grade not found" }); return; }
  }

  if (body.catcode != null && body.catcode !== "") {
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "categorymaster" WHERE "catcode" = $1 AND "compid" = $2::text`, [String(body.catcode), String(body.compid)]
    );
    if (!ok) { res.status(400).json({ error: "Category not found" }); return; }
  }

  if (body.designation != null && body.designation !== "") {
    const dv = String(body.designation);
    if (/^\d+$/.test(dv)) {
      const ok = await queryScalar<string>(
        `SELECT 1 FROM "DESIGNATIONMASTER" WHERE "DESICODE" = $1`, [parseInt(dv, 10)]
      );
      if (!ok) { res.status(400).json({ error: "Designation not found" }); return; }
    }
  }

  // 3. Uniqueness check — logical key (compid, EmpCode)
  const dup = await queryScalar<string>(
    `SELECT 1 FROM "EMPMAST" WHERE "compid" = $1 AND "EmpCode" = $2`,
    [compid, empCode]
  );
  if (dup) {
    res.status(409).json({ error: `Employee code '${empCode}' already exists under this company` });
    return;
  }

  // 4. Validate optional pre-create bank verification proof.
  // Verification columns remain server-controlled and are never accepted directly from the client.
  let preverifiedBank: { beneficiaryName: string | null } | null = null;
  const bankVerificationToken = typeof body.bankVerificationToken === "string"
    ? body.bankVerificationToken.trim()
    : "";
  if (bankVerificationToken) {
    try {
      const proof = verifyBankVerificationToken(bankVerificationToken);
      const accountNumber = String(body.acno ?? "").trim();
      const ifsc = String(body.SavingIFSCCode ?? "").trim().toUpperCase();
      if (proof.accountNumber !== accountNumber || proof.ifsc !== ifsc) {
        res.status(400).json({ error: "Bank details changed after verification. Verify the bank account again." });
        return;
      }
      preverifiedBank = { beneficiaryName: proof.beneficiaryName };
    } catch (err: unknown) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Invalid bank verification proof" });
      return;
    }
  }

  // 4b. Validate UAN / ESIC verification proofs for new employee onboarding.
  const pfRequired = ["true","yes","1"].includes(String(body.APPLICABLE ?? "").trim().toLowerCase());
  const esiRequired = ["true","yes","1"].includes(String(body.CHK_ESIMUST ?? "").trim().toLowerCase());
  const statutoryProofs: Array<{kind:"uan"|"esic"; provider:string; referenceId:string}> = [];
  for (const [kind, required, valueKey, tokenKey] of [
    ["uan", pfRequired, "UANNo", "uanVerificationToken"],
    ["esic", esiRequired, "tokanno", "esicVerificationToken"],
  ] as const) {
    if (!required) continue;
    const value = String(body[valueKey] ?? "").replace(/\s/g, "");
    const token = String(body[tokenKey] ?? "").trim();
    if (!token) { res.status(400).json({ error: `${kind.toUpperCase()} must be verified before employee registration` }); return; }
    try {
      const proof = verifyStatutoryVerificationToken(token);
      if (proof.kind !== kind || proof.value !== value || proof.userId !== user.id) throw new Error(`${kind.toUpperCase()} details changed after verification. Verify again.`);
      statutoryProofs.push({ kind, provider: proof.provider, referenceId: proof.referenceId });
    } catch (err) { res.status(400).json({ error: err instanceof Error ? err.message : `Invalid ${kind.toUpperCase()} verification proof` }); return; }
  }

  // 5. INSERT into EMPMAST only
  await withTransaction(async (client) => {
    const cols:   string[] = ['"EmpCode"', '"compid"', '"RecordInsertByUserID"', '"RecordInsertDate"'];
    const vals:   unknown[] = [empCode, compid, user.id, new Date()];
    const phs:    string[] = ["$1", "$2", "$3", "$4"];
    let idx = 5;

    for (const [key, val] of Object.entries(body)) {
      if (key === "EmpCode" || key === "compid" || key === "bankVerificationToken" || key === "aadhaarFaceVerificationId" || key === "uanVerificationToken" || key === "esicVerificationToken") continue;
      if (!WRITABLE_COLS.has(key) || SYSTEM_COLS.has(key)) continue;
      cols.push(`"${key}"`);
      phs.push(`$${idx}`);
      vals.push(val === "" ? null : val);
      idx++;
    }

    if (preverifiedBank) {
      cols.push('"isAcctVarify"', '"VerifiedBeneficiaryName"');
      phs.push(`$${idx}`, `$${idx + 1}`);
      vals.push(1, preverifiedBank.beneficiaryName);
      idx += 2;
    }

    for (const proof of statutoryProofs) {
      const prefix = proof.kind === "uan" ? "uan" : "esic";
      cols.push(`"${prefix}_verification_status"`, `"${prefix}_verified_at"`, `"${prefix}_verification_provider"`, `"${prefix}_verification_reference"`);
      phs.push(`$${idx}`, `$${idx+1}`, `$${idx+2}`, `$${idx+3}`);
      vals.push("VERIFIED", new Date(), proof.provider, proof.referenceId); idx += 4;
    }

    await client.query(
      `INSERT INTO "EMPMAST" (${cols.join(", ")}) VALUES (${phs.join(", ")})`,
      vals
    );
  });

  // 5. Fetch and return created row
  const created = await queryOne<Record<string, unknown>>(
    `SELECT ${LIST_SELECT} FROM "EMPMAST" e ${LOOKUP_JOINS}
     WHERE e."EmpCode" = $1 AND e."compid" = $2`,
    [empCode, compid]
  );
  if (created) stripComputed(created);

  if (body.aadhaarFaceVerificationId) {
    await execute(`UPDATE aadhaar_face_sessions SET emp_code=$2 WHERE id=$1 AND user_id=$3`,
      [String(body.aadhaarFaceVerificationId), empCode, user.id]);
  }

  // 6. Audit log — never log sensitive values
  const loggedFields = Object.keys(body).filter((k) => !SENSITIVE_COLS.includes(k) && k !== "aadhaarFaceVerificationId");
  await logClientAction(user.id, "worker.create", {
    empCode,
    compid,
    clientcode: body.clientcode ?? null,
    unitcode:   body.unitcode   ?? null,
    fields:     loggedFields,
  });

  res.status(201).json(created ?? { EmpCode: empCode });
});

// ── PATCH /api/workers/:EmpCode — update ──────────────────────────────────────
router.patch("/workers/:EmpCode", ...canWrite, async (req, res): Promise<void> => {
  const { EmpCode } = req.params;
  const body = req.body as Record<string, unknown>;
  const user = req.clientUser!;

  // 1. Load existing row — 404 if missing
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT * FROM "EMPMAST" WHERE "EmpCode" = $1 LIMIT 1`, [EmpCode]
  );
  if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }

  const compid = Number(existing.compid);


  // Scope enforcement on existing employee
  const scopeOk = await assertWorkerScope(
    req, res,
    compid,
    existing.branchcode != null ? Number(existing.branchcode) : undefined,
    existing.clientcode != null ? Number(existing.clientcode) : undefined,
    existing.unitcode != null ? String(existing.unitcode) : undefined,
  );
  if (!scopeOk) return;

  // 2. Field validation — merge body onto existing for conditional checks
  const merged = { ...existing, ...body };
  const fieldErr = validateWorker(merged, false, new Set(Object.keys(body)));
  if (fieldErr) { res.status(400).json({ error: fieldErr }); return; }

  // 3. Relationship validation on changed fields
  if (body.clientcode != null && body.clientcode !== "") {
    const newCompid = body.compid != null ? Number(body.compid) : compid;
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "CLIENTMASTER" WHERE "clientcode" = $1 AND "compid" = $2`,
      [Number(body.clientcode), newCompid]
    );
    if (!ok) { res.status(400).json({ error: "Client not found or does not belong to the selected company" }); return; }
  }

  if (body.branchcode != null && body.branchcode !== "") {
    const newCompid = body.compid != null ? Number(body.compid) : compid;
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "BRANCH" WHERE "BranchCode" = $1 AND "compid" = $2`,
      [Number(body.branchcode), newCompid]
    );
    if (!ok) { res.status(400).json({ error: "Branch not found or does not belong to the selected company" }); return; }
  }

  if (body.unitcode != null && body.unitcode !== "") {
    const newCompid = body.compid != null ? Number(body.compid) : compid;
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "UNITMASTER" WHERE "unitcode" = $1 AND "compcode" = $2`,
      [String(body.unitcode), newCompid]
    );
    if (!ok) { res.status(400).json({ error: "Unit not found or does not belong to the selected company" }); return; }

    // Cross-check: if branchcode supplied, unit must belong to it
    const effectiveBranch = body.branchcode ?? existing.branchcode;
    if (effectiveBranch != null && effectiveBranch !== "") {
      const branchMatch = await queryScalar<string>(
        `SELECT 1 FROM "UNITMASTER" WHERE "unitcode" = $1 AND "branchcode" = $2`,
        [String(body.unitcode), Number(effectiveBranch)]
      );
      if (!branchMatch) { res.status(400).json({ error: "Unit does not belong to the selected branch" }); return; }
    }
  }

  // Designation FK check (mirror of POST)
  if (body.designation != null && body.designation !== "") {
    const dv = String(body.designation);
    if (/^\d+$/.test(dv)) {
      const ok = await queryScalar<string>(
        `SELECT 1 FROM "DESIGNATIONMASTER" WHERE "DESICODE" = $1`, [parseInt(dv, 10)]
      );
      if (!ok) { res.status(400).json({ error: "Designation not found" }); return; }
    }
  }

  if (body.deptcode != null && body.deptcode !== "") {
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "DEPTMAST" WHERE "deptcode" = $1`, [String(body.deptcode)]
    );
    if (!ok) { res.status(400).json({ error: "Department not found" }); return; }
  }

  if (body.GradeCode != null && body.GradeCode !== "") {
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "GRADEMASTER" WHERE "GradeCode" = $1`, [Number(body.GradeCode)]
    );
    if (!ok) { res.status(400).json({ error: "Grade not found" }); return; }
  }

  if (body.catcode != null && body.catcode !== "") {
    const ok = await queryScalar<string>(
      `SELECT 1 FROM "categorymaster" WHERE "catcode" = $1 AND "compid" = $2::text`, [String(body.catcode), String(body.compid)]
    );
    if (!ok) { res.status(400).json({ error: "Category not found" }); return; }
  }

  // 4. Dynamic SET clause
  const { setCols, vals } = buildSetClause(body, 3);

  // Bank verification is invalidated whenever the stored account number or IFSC changes.
  // The verification fields themselves are not client-writable.
  const bankDetailsChanged =
    (body.acno !== undefined && String(body.acno ?? "").trim() !== String(existing.acno ?? "").trim()) ||
    (body.SavingIFSCCode !== undefined && String(body.SavingIFSCCode ?? "").trim().toUpperCase() !== String(existing.SavingIFSCCode ?? "").trim().toUpperCase());
  if (bankDetailsChanged) {
    setCols.push(`"isAcctVarify" = 0`, `"VerifiedBeneficiaryName" = NULL`);
  }
  if (setCols.length === 0) {
    res.status(400).json({ error: "No writable fields provided" });
    return;
  }

  // Stamp update metadata at fixed positions $1, $2
  setCols.push(`"RecordUpdateByUserID" = $1`, `"RecordUpdateDate" = $2`);
  await execute(
    `UPDATE "EMPMAST" SET ${setCols.join(", ")} WHERE "EmpCode" = $${vals.length + 3}`,
    [user.id, new Date(), ...vals, EmpCode]
  );

  // 5. Return updated row
  const updated = await queryOne<Record<string, unknown>>(
    `SELECT ${LIST_SELECT} FROM "EMPMAST" e ${LOOKUP_JOINS}
     WHERE e."EmpCode" = $1 LIMIT 1`,
    [EmpCode]
  );
  if (updated) stripComputed(updated);

  // 6. Audit log
  const loggedFields = Object.keys(body).filter((k) => !SENSITIVE_COLS.includes(k) && k !== "aadhaarFaceVerificationId");
  await logClientAction(user.id, "worker.update", {
    empCode: EmpCode,
    compid,
    fields: loggedFields,
  });

  res.json(updated ? maskRow(updated, canExportCheck(req)) : { EmpCode });
});


// ── DELETE /api/workers/:EmpCode — permanent employee deletion ───────────────
// compid is supplied by the detail UI to disambiguate employee codes that may
// exist under more than one company. PostgreSQL FK constraints remain the final
// safety net: if payroll/history tables reference the employee, deletion is blocked.
router.delete("/workers/:EmpCode", ...canWrite, async (req, res): Promise<void> => {
  const { EmpCode } = req.params;
  const compidParam = String(req.query.compid ?? "").trim();
  const params: unknown[] = [EmpCode];
  let where = `"EmpCode" = $1`;
  if (compidParam) {
    const parsed = Number(compidParam);
    if (!Number.isInteger(parsed)) { res.status(400).json({ error: "compid must be an integer" }); return; }
    params.push(parsed);
    where += ` AND "compid" = $2`;
  }

  const existing = await queryOne<Record<string, unknown>>(
    `SELECT "EmpCode", "EmpName", "compid", "branchcode", "clientcode" FROM "EMPMAST" WHERE ${where} LIMIT 1`,
    params,
  );
  if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }

  const compid = Number(existing.compid);
  const scopeOk = await assertWorkerScope(
    req, res, compid,
    existing.branchcode != null ? Number(existing.branchcode) : undefined,
    existing.clientcode != null ? Number(existing.clientcode) : undefined,
    existing.unitcode != null ? String(existing.unitcode) : undefined,
  );
  if (!scopeOk) return;

  try {
    await withTransaction(async (tx) => {
      // Remove the employee login account together with the employee master row.
      await tx.query(
        `DELETE FROM app_users WHERE role = 'Employee' AND employee_code = $1 AND compid = $2`,
        [EmpCode, compid],
      );
      await tx.query(
        `DELETE FROM "EMPMAST" WHERE "EmpCode" = $1 AND "compid" = $2`,
        [EmpCode, compid],
      );
    });
  } catch (err: any) {
    if (err?.code === "23503") {
      res.status(409).json({
        error: "This employee has linked payroll, attendance or history records and cannot be permanently deleted. Mark the employee inactive instead.",
        code: "EMPLOYEE_HAS_DEPENDENCIES",
      });
      return;
    }
    throw err;
  }

  await logClientAction(req.clientUser!.id, "worker.delete", { empCode: EmpCode, compid });
  res.json({ success: true, EmpCode, compid });
});

export default router;
