/**
 * employees.ts — EMPMAST Employee Master CRUD routes
 *
 * Source tables:
 *   "EMPMAST"           — primary table; INSERT/UPDATE only here
 *   "COMPANYMAST"       — validation + display JOIN
 *   "CLIENTMASTER"      — validation + display JOIN
 *   "UNITMASTER"        — validation + display JOIN  (FK key: compcode, clientcode)
 *   "BRANCH"            — validation + display JOIN
 *   "DEPTMAST"          — display JOIN
 *   "DESIGNATIONMASTER" — display JOIN (varchar→int safe cast)
 *   "GRADEMASTER"       — display JOIN
 *   "categorymaster"    — display JOIN
 *
 * Logical key: EmpCode is the URL identifier.
 * Uniqueness enforced at (compid, EmpCode) on create —
 * the clustered index IX_EmpMast_Clustered is (compid, unitcode, EmpCode),
 * confirming compid-scoped uniqueness; EmpCode alone serves as the URL key
 * in this single-tenant deployment.
 *
 * Sensitive fields are masked in all responses unless the caller has
 * workers:export permission: adharcardno, PAN_no, acno, UANNo, UANBankAcc.
 *
 * Do NOT write to any SaaS table or any table other than EMPMAST.
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

const router: IRouter = Router();

const canRead   = [requireClientAuth, requirePasswordChanged, requireClientPermission("workers", "read")];
const canWrite  = [requireClientAuth, requirePasswordChanged, requireClientPermission("workers", "write")];

// ── Regex validators ─────────────────────────────────────────────────────────
const PAN_RE    = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE   = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^\d{10}$/;
const UAN_RE    = /^\d{12}$/;

// ── Safe CAST: designation is varchar, DESIGNATIONMASTER.DESICODE is integer ─
const DESIG_JOIN = `
  LEFT JOIN "DESIGNATIONMASTER" desig
    ON desig."DESICODE" = (
      CASE WHEN e."designation" ~ '^[0-9]+$'
           THEN e."designation"::integer
           ELSE NULL
      END
    )
`;

const LOOKUP_JOINS = `
  LEFT JOIN "CLIENTMASTER"  c    ON c."clientcode"  = e."clientcode"
  LEFT JOIN "UNITMASTER"    u    ON u."unitcode"     = e."unitcode"
  ${DESIG_JOIN}
  LEFT JOIN "DEPTMAST"      dept ON dept."deptcode"  = e."deptcode"
  LEFT JOIN "GRADEMASTER"   g    ON g."GradeCode"    = e."GradeCode"
  LEFT JOIN "BRANCH"        b    ON b."BranchCode"   = e."branchcode"  AND b."compid" = e."compid"
  LEFT JOIN "ZONE_MASTER"   z    ON z."zonecode"     = e."zonecode"
  LEFT JOIN "COMPANYMAST"   comp ON comp."compid"    = e."compid"
  LEFT JOIN LATERAL (
    SELECT cm."catcode", cm."catname", cm."catdescription", cm."compid"
    FROM "categorymaster" cm
    WHERE cm."catcode" = e."catcode"::text AND cm."compid" = e."compid"::text
    ORDER BY cm."catname"
    LIMIT 1
  ) cat ON TRUE
`;

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

// ── Columns that must never be sent to the client unless caller has export ────
const SENSITIVE_COLS = ["adharcardno", "PAN_no", "acno", "UANNo", "UANBankAcc", "tokanno"];

// ── Computed/procedure columns — strip from all responses and forbid writes ──
const COMPUTED_COLS = new Set([
  "INCSC1","INCSC2","INCSC3","INCSC4","INCSC5","INCSC6","INCSC7",
  "INCSC8","INCSC9","INCSC10","INCSC11","INCSC12","INCSC13","INCSC14",
  "INCSC15","INCSC16","INCSC17","ARROTMDAY","POSSALL","ESINewRule",
]);

// ── System columns — never written by this route ─────────────────────────────
const SYSTEM_COLS = new Set([
  "ID","SrNo","RecordInsertByUserID","RecordInsertDate",
  "RecordUpdateByUserID","RecordUpdateDate","upduser","upddatetime",
  ...COMPUTED_COLS,
]);

// ── Whitelisted writable columns ──────────────────────────────────────────────
const WRITABLE_COLS = new Set([
  // Identity
  "CardNo","oldEmpcode","ropcod","EmpDeptCode",
  // Personal
  "EmpName","FHName","cmbFH","mothername","DOB","MAD","FDOB","MDOB",
  "Sex","Married","SDOB","SpouseName","children","BlodGroup","Nationality",
  "MobNo","emailID","emailidcompany",
  // Assignment
  "compid","clientcode","unitcode","branchcode","zonecode","locationcode",
  "deptcode","designation","GradeCode","catcode","subCatcode","BillCatCode",
  "focode","Divcode","StateID","Location","emplocation","nShift","shift","weeklyoff",
  // Service
  "workstatus","DOJ","RDOJ","applicationdate","applicationno","interviewdate",
  "modeofpay","OTmodeofpay","newEmp","IsRejoin","resg_det","IsPFSettlement",
  // Bank
  "bankcode","SavingBankName","NameInSavingBank","NameInBank","BankBranchName",
  "acno","Savingacno","SavingIFSCCode","MICRCode","UTR",
  "UANBankName","UANBankAcc","UANBankIFSC",
  // Statutory IDs
  "adharcardno","PAN_no","UANNo","tokanno","voterIDNo",
  "NameOnAdhar","NameOnPAN","IsKYC","IsUAN","IsOldUan",
  // PF
  "APPLICABLE","IsPension","PFWageEligibility","pf","VPF","VPFRate",
  "opt_pflimit","PFLimit","IsPFLimitFix","IsPFonFull","pf_arear","emp_bf",
  "PFBanAcc","PFBankIFSC","chkUnitPFAplicable","EmpPFZoneCode","IsAbry",
  "pfDate","IsIWReturn",
  // ESI
  "esi","ESILimit","CHK_ESIMUST","EsiDate","IsESIOnLTA","IsESIOnSpl",
  // PT / LWF
  "IsPtax","IsLWF","LWFID","LwfDate","PTaxDate","PTax",
  // Salary
  "basic","dailywages","hra","vda","cca","cea","conv","gunall","washall",
  "cycleall","foodAll","medical","MedicalAll","AddAmt","OutSAll","CarWashAll",
  "ATMAmt","ExGratia","OTAmt","ReimburseAmt","LTA","Gross","egi","bonus",
  "incometax","sCharge","ConvDed","allowences","othall","specialAll",
  "prodAll","powderAll","consolidateAll","UnfAll","driverAll","gardeningAll",
  "acmdAll","EduAll","TelAll","Misc","Fuel","Travel","House","Peon","Water",
  "taAll","Att_Reward","gSLIDed","SuspensAllow","NightShiftAllow","splDed",
  "bondDed","SecDep","washAllNew","LIC","Sumassured",
  "ctc","grossCTC","ctcRate","HRAper","pfamount","esiamount","ctcamount",
  "pfdedAmt","esidedamt","vpfamt","SalHead1","SalHead2","SalHead3","SalHead4",
  "SalHead5","SalHead6","SalHead7","SalHead8","SalHead9","SalHead10",
  "SalHead11","SalHead12","SalHead13","SalHead14","SalHead15","SalHead16","SalHead17",
  // Salary opts
  "FixRate","FixRateApp","IsPerDayRate","IsConvPerDay","PerDayRate","EmpMday",
  "opt_basic","opt_hra","opt_conv","opt_washall","opt_medical","opt_bonus",
  "opt_othall","opt_outsall","opt_carwashall","opt_allowences","opt_misc",
  "opt_fuel","opt_travel","opt_house","opt_peon","opt_water",
  // ESI component flags
  "IsBasicESI","IsHraESI","IsConvESI","IsProESI","IsPowdESI","IswashESI",
  "IsMediESI","IsConsoESI","IsSplESI","IsUnfESI","IsDriverESI","IsGardESI",
  "IsAcmdESI","IsAttAllESI","IsBonusESI","IsLeaveESI",
  // Periodic flags
  "IsBasicPer","IsHraPer","IsConvPer","IsProPer","IsPowdPer","IswashPer",
  "IsMediPer","IsConsoPer","IsSplPer","IsUnfPer","IsDriverPer","IsGardPer",
  "IsAcmdPer","IsAttAllPer","IsBonusPer","IsLeavePer",
  // PF head flags
  "chkPFHead1","chkPFHead2","chkPFHead3","chkPFHead4","chkPFHead5",
  "chkPFHead6","chkPFHead7","chkPFHead8","chkPFHead9","chkPFHead10",
  "chkPFHead11","chkPFHead12","chkPFHead13","chkPFHead14","chkPFHead15",
  "chkPFHead16","chkPFHead17",
  // OT head flags
  "chkOTHead1","chkOTHead2","chkOTHead3","chkOTHead4","chkOTHead5",
  "chkOTHead6","chkOTHead7","chkOTHead8","chkOTHead9","chkOTHead10",
  "CHK_OTRATE",
  // Leave / bonus / OT flags
  "IsAllowOT","IsBonus","medicalelig","EnrollMentAmt","EnrollAmtDr",
  "pf_arear","oth_arear","Wash_Arrear","IDIssueYesNo","Witness_name",
  "FH_Name_Witness","Witness_Address","IsLeave","IsTPADed","IsWashDed",
  "bonusOn","bonusRate","bonusLimit","EmpMBonus","IsBonusRateApp",
  "bonusRate","bonusLimit","bList",
  // Address
  "ref","contnoref","addref1","addref2","localadd1","localadd2",
  "contnolocal","localpin","LOCALSTATE","localDist","PERMANENTSTATE","permanentDist",
  // Documents
  "IDProof","IDProofNo","IDProofExpDate","IDProofName","vID",
  "Doc1Type","Doc1No","Doc2Type","Doc2No","Doc1Name",
  "PIssueDate","PValidDate","police","police_Vari","pVCode",
  "pSARA_Trng","PSARA_Detail","RepCode","RepName",
  "GMC","GMCNo","GPANo","GTLNo","DomicileOfHariyana",
  // Misc
  "othdet1","othdet2","category","IsPension","Nationality",
  "ESIWAGE_AREAR","RESTARR","SArrPFLimit","opt_SArrpflimit","updreason",
  "cpftest","LTAArr","medicalArr",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────
function parsePage(p?: string, ps?: string) {
  const page     = Math.max(1, parseInt(p  ?? "1",  10) || 1);
  const pageSize = Math.min(500, Math.max(1, parseInt(ps ?? "50", 10) || 50));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function maskRow(
  emp: Record<string, unknown>,
  canExport: boolean,
): Record<string, unknown> {
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

function stripComputed(emp: Record<string, unknown>): Record<string, unknown> {
  for (const f of COMPUTED_COLS) delete emp[f];
  return emp;
}

function parseOptDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : (v as string);
}

function validateEmployee(
  body: Record<string, unknown>,
  isCreate: boolean,
): string | null {
  // ── Required on create ────────────────────────────────────────────────────
  if (isCreate) {
    if (!String(body.EmpCode ?? "").trim()) return "EmpCode is required";
    if (String(body.EmpCode).trim().length > 25) return "EmpCode must be ≤25 characters";
    if (body.compid == null || body.compid === "") return "compid (company) is required";
    if (isNaN(Number(body.compid))) return "compid must be a number";
    if (!body.DOJ) return "DOJ (date of joining) is required";
    if (!String(body.workstatus ?? "").trim()) return "workstatus is required";
  }

  // ── EmpName always required if provided or creating ───────────────────────
  if (isCreate && !String(body.EmpName ?? "").trim()) return "EmpName is required";
  if (body.EmpName != null && String(body.EmpName).trim() === "") return "EmpName cannot be empty";
  if (body.EmpName && String(body.EmpName).length > 50) return "EmpName must be ≤50 characters";

  // ── Date validations ──────────────────────────────────────────────────────
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

  // ── Format validations ────────────────────────────────────────────────────
  if (body.MobNo && body.MobNo !== "") {
    const mob = String(body.MobNo).replace(/\s/g, "");
    if (!MOBILE_RE.test(mob)) return "MobNo must be exactly 10 digits";
  }
  if (body.emailID && body.emailID !== "") {
    if (!EMAIL_RE.test(String(body.emailID))) return "emailID is not a valid email address";
    if (String(body.emailID).length > 50) return "emailID must be ≤50 characters";
  }
  if (body.PAN_no && body.PAN_no !== "") {
    if (!PAN_RE.test(String(body.PAN_no).toUpperCase())) return "PAN_no must be in format AAAAA9999A";
  }
  if (body.adharcardno && body.adharcardno !== "") {
    const a = String(body.adharcardno).replace(/[\s-]/g, "");
    if (!/^\d{12}$/.test(a)) return "adharcardno must be exactly 12 digits";
  }
  if (body.UANNo && body.UANNo !== "") {
    if (!UAN_RE.test(String(body.UANNo))) return "UANNo must be exactly 12 digits";
  }
  if (body.SavingIFSCCode && body.SavingIFSCCode !== "") {
    if (!IFSC_RE.test(String(body.SavingIFSCCode))) return "SavingIFSCCode is not a valid IFSC code";
  }
  if (body.UANBankIFSC && body.UANBankIFSC !== "") {
    if (!IFSC_RE.test(String(body.UANBankIFSC))) return "UANBankIFSC is not a valid IFSC code";
  }
  if (body.PFBankIFSC && body.PFBankIFSC !== "") {
    if (!IFSC_RE.test(String(body.PFBankIFSC))) return "PFBankIFSC is not a valid IFSC code";
  }

  // ── Numeric salary fields ≥ 0 ────────────────────────────────────────────
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

  // ── Conditional: bank details required for Bank payment mode ─────────────
  const payMode = String(body.modeofpay ?? "").trim().toLowerCase();
  if (payMode === "bank") {
    if (!String(body.acno ?? "").trim()) return "acno (bank account number) is required for Bank payment mode";
    if (!String(body.SavingIFSCCode ?? "").trim()) return "SavingIFSCCode (IFSC) is required for Bank payment mode";
    if (!String(body.NameInBank ?? "").trim()) return "NameInBank is required for Bank payment mode";
  }

  // ── Conditional: UAN required when PF applicable ─────────────────────────
  const pfApplicable = String(body.APPLICABLE ?? "").trim().toLowerCase();
  if (pfApplicable === "true" || pfApplicable === "yes" || pfApplicable === "1") {
    if (!String(body.UANNo ?? "").trim()) return "UANNo is required when PF is applicable";
  }

  return null;
}

// ── Build dynamic SET clause for PATCH ───────────────────────────────────────
function buildSetClause(
  body: Record<string, unknown>,
  startIdx: number,
): { setCols: string[]; vals: unknown[] } {
  const setCols: string[] = [];
  const vals: unknown[] = [];
  let idx = startIdx;

  for (const [key, val] of Object.entries(body)) {
    if (!WRITABLE_COLS.has(key)) continue;
    if (SYSTEM_COLS.has(key)) continue;
    setCols.push(`"${key}" = $${idx}`);
    vals.push(val === "" ? null : val);
    idx++;
  }
  return { setCols, vals };
}

// ── GET /api/employees — list ─────────────────────────────────────────────────
router.get("/employees", ...canRead, async (req, res): Promise<void> => {
  const {
    compid, clientcode, unitcode, branchcode, workstatus, search,
    page: pageStr, pageSize: pageSizeStr,
  } = req.query as Record<string, string>;
  const { page, pageSize, offset } = parsePage(pageStr, pageSizeStr);
  const p: unknown[] = [];
  const conds: string[] = [];

  if (compid)     { p.push(parseInt(compid, 10));     conds.push(`e."compid"      = $${p.length}`); }
  if (clientcode) { p.push(parseInt(clientcode, 10)); conds.push(`e."clientcode"  = $${p.length}`); }
  if (unitcode)   { p.push(unitcode);                 conds.push(`e."unitcode"    = $${p.length}`); }
  if (branchcode) { p.push(parseInt(branchcode, 10)); conds.push(`e."branchcode"  = $${p.length}`); }
  if (workstatus) { p.push(workstatus);               conds.push(`e."workstatus"  = $${p.length}`); }
  if (search) {
    p.push(`%${search}%`);
    conds.push(`(e."EmpCode" ILIKE $${p.length} OR e."EmpName" ILIKE $${p.length} OR e."MobNo" ILIKE $${p.length})`);
  }

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const total = await queryScalar<string>(
    `SELECT COUNT(*) FROM "EMPMAST" e ${where}`, [...p]
  );

  p.push(pageSize, offset);
  const rows = await queryRows<Record<string, unknown>>(
    `SELECT ${LIST_SELECT}
     FROM "EMPMAST" e
     ${LOOKUP_JOINS}
     ${where}
     ORDER BY e."compid", e."unitcode", e."EmpCode"
     LIMIT $${p.length - 1} OFFSET $${p.length}`,
    p
  );

  const u = req.clientUser!;
  const canExport = u.role === "Admin" ||
    u.permissions.includes("workers:export") || u.permissions.includes("workers:all");

  res.json({
    data: rows.map((r) => maskRow(r, canExport)),
    total: parseInt(total ?? "0", 10),
    page,
    pageSize,
  });
});

const DETAIL_JOINS_SELECT = `
  c."Clientname", u."Unitname", desig."DESINAME", dept."Deptname",
  g."GradeName", b."BranchName", z."zonename", comp."comname", cat."catname"
`;

// ── GET /api/employees/:empCode — detail ──────────────────────────────────────
router.get("/employees/:empCode", ...canRead, async (req, res): Promise<void> => {
  const empCode = req.params.empCode;

  const emp = await queryOne<Record<string, unknown>>(
    `SELECT e.*, ${DETAIL_JOINS_SELECT}
     FROM "EMPMAST" e
     ${LOOKUP_JOINS}
     WHERE e."EmpCode" = $1
     LIMIT 1`,
    [empCode]
  );

  if (!emp) { res.status(404).json({ error: "Employee not found" }); return; }

  stripComputed(emp);

  const u = req.clientUser!;
  const canExport = u.role === "Admin" ||
    u.permissions.includes("workers:export") || u.permissions.includes("workers:all");

  res.json(maskRow(emp, canExport));
});

// ── POST /api/employees — create ──────────────────────────────────────────────
router.post("/employees", ...canWrite, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const user = req.clientUser!;

  // ── 1. Field-level validation ─────────────────────────────────────────────
  const fieldErr = validateEmployee(body, true);
  if (fieldErr) { res.status(400).json({ error: fieldErr }); return; }

  const empCode = String(body.EmpCode).trim();
  const compid  = Number(body.compid);

  // ── 2. Relationship validation ────────────────────────────────────────────
  const compExists = await queryScalar<string>(
    `SELECT 1 FROM "COMPANYMAST" WHERE "compid" = $1`, [compid]
  );
  if (!compExists) { res.status(400).json({ error: "Company not found" }); return; }

  if (body.clientcode != null && body.clientcode !== "") {
    const clientExists = await queryScalar<string>(
      `SELECT 1 FROM "CLIENTMASTER" WHERE "clientcode" = $1 AND "compid" = $2`,
      [Number(body.clientcode), compid]
    );
    if (!clientExists) { res.status(400).json({ error: "Client not found or does not belong to the selected company" }); return; }
  }

  if (body.unitcode != null && body.unitcode !== "") {
    const unitExists = await queryScalar<string>(
      `SELECT 1 FROM "UNITMASTER" WHERE "unitcode" = $1 AND "compcode" = $2`,
      [String(body.unitcode), compid]
    );
    if (!unitExists) { res.status(400).json({ error: "Unit not found or does not belong to the selected company" }); return; }

    if (body.clientcode != null && body.clientcode !== "") {
      const unitClientMatch = await queryScalar<string>(
        `SELECT 1 FROM "UNITMASTER" WHERE "unitcode" = $1 AND "clientcode" = $2`,
        [String(body.unitcode), Number(body.clientcode)]
      );
      if (!unitClientMatch) { res.status(400).json({ error: "Unit does not belong to the selected client" }); return; }
    }
  }

  if (body.branchcode != null && body.branchcode !== "") {
    const branchExists = await queryScalar<string>(
      `SELECT 1 FROM "BRANCH" WHERE "BranchCode" = $1 AND "compid" = $2`,
      [Number(body.branchcode), compid]
    );
    if (!branchExists) { res.status(400).json({ error: "Branch not found or does not belong to the selected company" }); return; }
  }

  if (body.deptcode != null && body.deptcode !== "") {
    const deptExists = await queryScalar<string>(
      `SELECT 1 FROM "DEPTMAST" WHERE "deptcode" = $1`, [String(body.deptcode)]
    );
    if (!deptExists) { res.status(400).json({ error: "Department not found" }); return; }
  }

  if (body.GradeCode != null && body.GradeCode !== "") {
    const gradeExists = await queryScalar<string>(
      `SELECT 1 FROM "GRADEMASTER" WHERE "GradeCode" = $1`, [Number(body.GradeCode)]
    );
    if (!gradeExists) { res.status(400).json({ error: "Grade not found" }); return; }
  }

  if (body.catcode != null && body.catcode !== "") {
    const catExists = await queryScalar<string>(
      `SELECT 1 FROM "categorymaster" WHERE "catcode" = $1 AND "compid" = $2::text`, [String(body.catcode), String(body.compid)]
    );
    if (!catExists) { res.status(400).json({ error: "Category not found" }); return; }
  }

  if (body.designation != null && body.designation !== "") {
    const desigVal = String(body.designation);
    if (/^\d+$/.test(desigVal)) {
      const desigExists = await queryScalar<string>(
        `SELECT 1 FROM "DESIGNATIONMASTER" WHERE "DESICODE" = $1`, [parseInt(desigVal, 10)]
      );
      if (!desigExists) { res.status(400).json({ error: "Designation not found" }); return; }
    }
  }

  // ── 3. Uniqueness check: (compid, EmpCode) ───────────────────────────────
  const duplicate = await queryScalar<string>(
    `SELECT 1 FROM "EMPMAST" WHERE "compid" = $1 AND "EmpCode" = $2`,
    [compid, empCode]
  );
  if (duplicate) {
    res.status(409).json({ error: `Employee code '${empCode}' already exists under this company` });
    return;
  }

  // ── 4. Build INSERT ────────────────────────────────────────────────────────
  await withTransaction(async (client) => {
    const cols: string[]    = ['"EmpCode"', '"compid"', '"RecordInsertByUserID"', '"RecordInsertDate"'];
    const vals: unknown[]   = [empCode, compid, user.id, new Date()];
    const placeholders: string[] = ["$1", "$2", "$3", "$4"];
    let idx = 5;

    for (const [key, val] of Object.entries(body)) {
      if (key === "EmpCode" || key === "compid") continue;
      if (!WRITABLE_COLS.has(key) || SYSTEM_COLS.has(key)) continue;
      cols.push(`"${key}"`);
      placeholders.push(`$${idx}`);
      vals.push(val === "" ? null : val);
      idx++;
    }

    await client.query(
      `INSERT INTO "EMPMAST" (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`,
      vals
    );
  });

  // ── 5. Fetch and return created row ───────────────────────────────────────
  const created = await queryOne<Record<string, unknown>>(
    `SELECT ${LIST_SELECT} FROM "EMPMAST" e ${LOOKUP_JOINS} WHERE e."EmpCode" = $1 AND e."compid" = $2`,
    [empCode, compid]
  );
  if (created) stripComputed(created);

  // ── 6. Audit log (no sensitive values) ───────────────────────────────────
  const changedFields = Object.keys(body).filter(
    (k) => !["adharcardno","PAN_no","acno","UANNo","UANBankAcc","tokanno"].includes(k)
  );
  await logClientAction(user.id, "employee.create", {
    empCode,
    compid,
    clientcode: body.clientcode ?? null,
    unitcode:   body.unitcode   ?? null,
    fields:     changedFields,
  });

  res.status(201).json(created ?? { EmpCode: empCode });
});

// ── PATCH /api/employees/:empCode — update ────────────────────────────────────
router.patch("/employees/:empCode", ...canWrite, async (req, res): Promise<void> => {
  const empCode = req.params.empCode;
  const body    = req.body as Record<string, unknown>;
  const user    = req.clientUser!;

  // ── 1. Load existing row ──────────────────────────────────────────────────
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT * FROM "EMPMAST" WHERE "EmpCode" = $1 LIMIT 1`, [empCode]
  );
  if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }

  const compid = Number(existing.compid);

  // ── 2. Field-level validation ─────────────────────────────────────────────
  // Merge body with existing for conditional checks
  const merged = { ...existing, ...body };
  const fieldErr = validateEmployee(merged, false);
  if (fieldErr) { res.status(400).json({ error: fieldErr }); return; }

  // ── 3. Relationship validation on changed fields ──────────────────────────
  if (body.clientcode != null && body.clientcode !== "") {
    const newCompid = body.compid != null ? Number(body.compid) : compid;
    const clientExists = await queryScalar<string>(
      `SELECT 1 FROM "CLIENTMASTER" WHERE "clientcode" = $1 AND "compid" = $2`,
      [Number(body.clientcode), newCompid]
    );
    if (!clientExists) { res.status(400).json({ error: "Client not found or does not belong to the selected company" }); return; }
  }

  if (body.unitcode != null && body.unitcode !== "") {
    const newCompid = body.compid != null ? Number(body.compid) : compid;
    const unitExists = await queryScalar<string>(
      `SELECT 1 FROM "UNITMASTER" WHERE "unitcode" = $1 AND "compcode" = $2`,
      [String(body.unitcode), newCompid]
    );
    if (!unitExists) { res.status(400).json({ error: "Unit not found or does not belong to the selected company" }); return; }
  }

  if (body.branchcode != null && body.branchcode !== "") {
    const newCompid = body.compid != null ? Number(body.compid) : compid;
    const branchExists = await queryScalar<string>(
      `SELECT 1 FROM "BRANCH" WHERE "BranchCode" = $1 AND "compid" = $2`,
      [Number(body.branchcode), newCompid]
    );
    if (!branchExists) { res.status(400).json({ error: "Branch not found or does not belong to the selected company" }); return; }
  }

  if (body.deptcode != null && body.deptcode !== "") {
    const deptExists = await queryScalar<string>(
      `SELECT 1 FROM "DEPTMAST" WHERE "deptcode" = $1`, [String(body.deptcode)]
    );
    if (!deptExists) { res.status(400).json({ error: "Department not found" }); return; }
  }

  if (body.GradeCode != null && body.GradeCode !== "") {
    const gradeExists = await queryScalar<string>(
      `SELECT 1 FROM "GRADEMASTER" WHERE "GradeCode" = $1`, [Number(body.GradeCode)]
    );
    if (!gradeExists) { res.status(400).json({ error: "Grade not found" }); return; }
  }

  if (body.catcode != null && body.catcode !== "") {
    const catExists = await queryScalar<string>(
      `SELECT 1 FROM "categorymaster" WHERE "catcode" = $1 AND "compid" = $2::text`, [String(body.catcode), String(body.compid)]
    );
    if (!catExists) { res.status(400).json({ error: "Category not found" }); return; }
  }

  // ── 4. Build and execute UPDATE ───────────────────────────────────────────
  const { setCols, vals } = buildSetClause(body, 3);

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

  // Always stamp update metadata
  setCols.push(`"RecordUpdateByUserID" = $1`, `"RecordUpdateDate" = $2`);
  await execute(
    `UPDATE "EMPMAST" SET ${setCols.join(", ")} WHERE "EmpCode" = $${vals.length + 3}`,
    [user.id, new Date(), ...vals, empCode]
  );

  // ── 5. Return updated row ─────────────────────────────────────────────────
  const updated = await queryOne<Record<string, unknown>>(
    `SELECT ${LIST_SELECT} FROM "EMPMAST" e ${LOOKUP_JOINS} WHERE e."EmpCode" = $1 LIMIT 1`,
    [empCode]
  );
  if (updated) stripComputed(updated);

  const u = req.clientUser!;
  const canExport = u.role === "Admin" ||
    u.permissions.includes("workers:export") || u.permissions.includes("workers:all");

  // ── 6. Audit log ─────────────────────────────────────────────────────────
  const changedFields = Object.keys(body).filter(
    (k) => !["adharcardno","PAN_no","acno","UANNo","UANBankAcc","tokanno"].includes(k)
  );
  await logClientAction(user.id, "employee.update", {
    empCode,
    compid,
    fields: changedFields,
  });

  res.json(updated ? maskRow(updated, canExport) : { EmpCode: empCode });
});

export default router;
