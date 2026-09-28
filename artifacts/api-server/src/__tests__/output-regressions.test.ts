/* =====================================================================
 * DEFERRED — Phase 5+ migration pending
 *
 * All describe blocks in this file are skipped because the routes they
 * test have been intentionally removed from the router in Phase 4.
 * They will be re-enabled once the corresponding routes are migrated
 * to payrollom_client (Phase 5 = attendance/payroll, Phase 6 = billing,
 * Phase 7 = compliance, Phase 8 = reports).
 * ===================================================================== */
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import {
  db,
  complianceRulesTable,
  payrollBatchesTable,
  payrollRecordsTable,
  payrollLineItemsTable,
  workersTable,
  salaryStructuresTable,
  workerStatutoryProfilesTable,
  legalEntitiesTable,
  exportLogsTable,
  sitesTable,
} from "@workspace/db";
import { calculatePayroll, buildStateRulesFromDb } from "../lib/payroll-calc";
import app from "../app";

// Integration tests for the payroll output module (bank files, payslips,
// compliance reports, invoices). These run against a seeded database
// (tenant slug "nexus" — run `pnpm --filter @workspace/scripts run seed` first).
//
// They lock in the fragile money invariants that were previously only checked
// by hand: locked-only gating, bank-file exclusion + reconciliation, the
// download header total matching the sum of detail lines, finance:export RBAC,
// and PF-report wage reconciliation.
const CREDS = {
  admin: { username: "admin@nexusstaffing.com", password: "Admin@123" },
  payrollMgr: { username: "payroll@nexusstaffing.com", password: "Payroll@123" },
  financeExec: { username: "finance@nexusstaffing.com", password: "Finance@123" },
  financeMgr: { username: "finance.mgr@nexusstaffing.com", password: "FinMgr@123" },
  compliance: { username: "compliance@nexusstaffing.com", password: "Comply@123" },
  auditor: { username: "auditor@nexusstaffing.com", password: "Audit@123" },
} as const;

type RoleKey = keyof typeof CREDS;

const tokens: Partial<Record<RoleKey, string>> = {};

async function login(role: RoleKey): Promise<string> {
  const cached = tokens[role];
  if (cached) return cached;
  const res = await request(app)
    .post("/api/auth/login")
    .send({ ...CREDS[role] });
  expect(res.status, `login ${role} failed: ${res.text}`).toBe(200);
  expect(res.body.token).toBeTruthy();
  const token = res.body.token as string;
  tokens[role] = token;
  return token;
}

function auth(token: string) {
  return `Bearer ${token}`;
}

let lockedBatchId: string;
let draftBatchId: string;

beforeAll(async () => {
  const token = await login("admin");

  // Resolve the seeded locked (June) and draft (May) batches by status. The
  // seed also includes an earlier locked batch (April 2026, deliberately left
  // without compliance export logs), so pick the *latest-month* locked batch —
  // the June-specific assertions below depend on it.
  const batchesRes = await request(app)
    .get("/api/payroll/batches")
    .set("Authorization", auth(token));
  expect(batchesRes.status, `batches list: ${batchesRes.text}`).toBe(200);
  const batches: Array<{ id: string; status: string; month: string }> =
    batchesRes.body;

  const locked = batches
    .filter((b) => b.status === "locked")
    .sort((a, b) => b.month.localeCompare(a.month))[0];
  const draft = batches.find((b) => b.status === "draft");
  expect(locked, "expected a seeded locked batch").toBeTruthy();
  expect(draft, "expected a seeded draft batch").toBeTruthy();
  lockedBatchId = locked!.id;
  draftBatchId = draft!.id;
});

describe.skip("locked-gating: outputs are rejected for non-locked batches", () => {
  it("bank-file generation returns 400 on a draft batch", async () => {
    const token = await login("financeMgr"); // has finance:export
    const res = await request(app)
      .post("/api/bank-files")
      .set("Authorization", auth(token))
      .send({ batchId: draftBatchId, bankName: "SBI", format: "txt" });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/locked/i);
  });

  it("payslip generation returns 400 on a draft batch", async () => {
    const token = await login("payrollMgr"); // has payroll:approve
    const res = await request(app)
      .post("/api/payslips/generate")
      .set("Authorization", auth(token))
      .send({ batchId: draftBatchId });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/locked/i);
  });

  it("pf compliance report returns 400 on a draft batch", async () => {
    const token = await login("compliance");
    const res = await request(app)
      .get("/api/compliance/pf-report")
      .query({ batchId: draftBatchId })
      .set("Authorization", auth(token));
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/locked/i);
  });

  it("esi/pt/lwf compliance reports return 400 on a draft batch", async () => {
    const token = await login("compliance");
    for (const path of [
      "/api/compliance/esi-report",
      "/api/compliance/pt-report",
      "/api/compliance/lwf-report",
    ]) {
      const res = await request(app)
        .get(path)
        .query({ batchId: draftBatchId })
        .set("Authorization", auth(token));
      expect(res.status, `${path} should be 400`).toBe(400);
      expect(String(res.body.error)).toMatch(/locked/i);
    }
  });

  it("min-wage exceptions report returns 400 on a draft batch", async () => {
    const token = await login("compliance");
    const res = await request(app)
      .get("/api/compliance/min-wage-exceptions")
      .query({ batchId: draftBatchId })
      .set("Authorization", auth(token));
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/locked/i);
  });
});

describe.skip("bank-file generation: excludes unbanked workers and reconciles", () => {
  it("readiness reports the unbanked workers as missing", async () => {
    const token = await login("financeMgr");
    const res = await request(app)
      .get(`/api/bank-files/readiness/${lockedBatchId}`)
      .set("Authorization", auth(token));
    expect(res.status).toBe(200);
    expect(res.body.batchStatus).toBe("locked");
    // Seed: NX019 + NX020 have no bank details on file.
    expect(res.body.missingCount).toBeGreaterThanOrEqual(2);
    expect(res.body.readyCount).toBe(res.body.totalWorkers - res.body.missingCount);
    expect(res.body.totalWorkers).toBe(res.body.readyCount + res.body.missingCount);
    const missingCodes = (res.body.missing as Array<{ employeeCode: string }>).map(
      (m) => m.employeeCode,
    );
    expect(missingCodes).toContain("NX019");
    expect(missingCodes).toContain("NX020");
  });

  it("generation reconciles: bankTotal + excludedAmount == payrollNetTotal", async () => {
    const token = await login("financeMgr");
    const res = await request(app)
      .post("/api/bank-files")
      .set("Authorization", auth(token))
      .send({ batchId: lockedBatchId, bankName: "SBI", format: "txt" });
    expect(res.status, res.text).toBe(201);

    const recon = res.body.reconciliation;
    expect(recon).toBeTruthy();
    expect(recon.reconciled).toBe(true);
    expect(recon.excludedCount).toBeGreaterThanOrEqual(2);
    expect(
      Math.abs(recon.bankTotal + recon.excludedAmount - recon.payrollNetTotal),
    ).toBeLessThan(0.01);
    expect(res.body.reconciliationStatus).toBe("reconciled");
    // The file only disburses banked workers, so worker count is reduced.
    expect(res.body.workerCount).toBeGreaterThan(0);
  });

  it("readiness payrollNetTotal matches the generated file's payrollNetTotal", async () => {
    const token = await login("financeMgr");
    const readiness = await request(app)
      .get(`/api/bank-files/readiness/${lockedBatchId}`)
      .set("Authorization", auth(token));
    const gen = await request(app)
      .post("/api/bank-files")
      .set("Authorization", auth(token))
      .send({ batchId: lockedBatchId, bankName: "SBI", format: "txt" });
    expect(gen.status).toBe(201);
    expect(
      Math.abs(
        Number(gen.body.payrollNetTotal) - Number(readiness.body.payrollNetTotal),
      ),
    ).toBeLessThan(0.01);
    expect(gen.body.workerCount).toBe(readiness.body.readyCount);
  });
});

describe.skip("bank-file download: header total == sum of detail lines", () => {
  async function generate(
    bankName: string,
    format: string,
  ): Promise<{ id: string; totalAmount: string; workerCount: number }> {
    const token = await login("financeMgr");
    const res = await request(app)
      .post("/api/bank-files")
      .set("Authorization", auth(token))
      .send({ batchId: lockedBatchId, bankName, format });
    expect(res.status, res.text).toBe(201);
    return res.body;
  }

  it("SBI TXT: H-line total equals the sum of D-line amounts and stored total", async () => {
    const token = await login("financeMgr");
    const file = await generate("SBI", "txt");
    const res = await request(app)
      .get(`/api/bank-files/${file.id}/download`)
      .set("Authorization", auth(token));
    expect(res.status).toBe(200);

    const lines = res.text.split("\n").filter((l) => l.length > 0);
    const header = lines.find((l) => l.startsWith("H|"))!;
    const detail = lines.filter((l) => l.startsWith("D|"));
    expect(header).toBeTruthy();

    const headerParts = header.split("|");
    const headerCount = Number(headerParts[3]);
    const headerTotal = Number(headerParts[4]);

    const detailSum =
      Math.round(detail.reduce((s, l) => s + Number(l.split("|")[3]), 0) * 100) /
      100;

    expect(detail.length).toBe(headerCount);
    expect(detail.length).toBe(file.workerCount);
    expect(Math.abs(headerTotal - detailSum)).toBeLessThan(0.01);
    expect(Math.abs(headerTotal - Number(file.totalAmount))).toBeLessThan(0.01);

    // Unbanked workers must not appear in the disbursement file.
    expect(res.text).not.toContain("NX019");
    expect(res.text).not.toContain("NX020");
  });

  it("HDFC CSV: sum of the Amount column equals the stored total", async () => {
    const token = await login("financeMgr");
    const file = await generate("HDFC Bank", "csv");
    const res = await request(app)
      .get(`/api/bank-files/${file.id}/download`)
      .set("Authorization", auth(token));
    expect(res.status).toBe(200);

    const rows = res.text.split("\n").filter((l) => l.length > 0);
    const dataRows = rows.slice(1); // drop the column-header row
    expect(dataRows.length).toBe(file.workerCount);
    // Amount (INR) is column index 5 in the CSV layout.
    const sum =
      Math.round(
        dataRows.reduce((s, l) => s + Number(l.split(",")[5]), 0) * 100,
      ) / 100;
    expect(Math.abs(sum - Number(file.totalAmount))).toBeLessThan(0.01);
    expect(res.text).not.toContain("NX019");
    expect(res.text).not.toContain("NX020");
  });
});

describe.skip("finance:export RBAC gates bank-file endpoints", () => {
  // DEF-ROLE-05 (ROLE-ACTIVITY-03): Finance Executive was granted finance:export.
  // FE can now generate and download bank files. Payroll Manager lacks finance:export
  // and remains blocked. These tests reflect the corrected RBAC design.

  it("Payroll Manager (no finance:export) is forbidden from generating", async () => {
    const token = await login("payrollMgr");
    const res = await request(app)
      .post("/api/bank-files")
      .set("Authorization", auth(token))
      .send({ batchId: lockedBatchId, bankName: "SBI", format: "txt" });
    expect(res.status).toBe(403);
  });

  it("Payroll Manager (no finance:export) is forbidden from downloading", async () => {
    // Generate a file as the manager, then attempt download as payroll manager.
    const mgrToken = await login("financeMgr");
    const gen = await request(app)
      .post("/api/bank-files")
      .set("Authorization", auth(mgrToken))
      .send({ batchId: lockedBatchId, bankName: "SBI", format: "txt" });
    expect(gen.status).toBe(201);

    const pmToken = await login("payrollMgr");
    const res = await request(app)
      .get(`/api/bank-files/${gen.body.id}/download`)
      .set("Authorization", auth(pmToken));
    expect(res.status).toBe(403);
  });

  it("Finance Executive (has finance:export) can generate and download", async () => {
    const token = await login("financeExec");
    const gen = await request(app)
      .post("/api/bank-files")
      .set("Authorization", auth(token))
      .send({ batchId: lockedBatchId, bankName: "SBI", format: "txt" });
    expect(gen.status).toBe(201);
    const dl = await request(app)
      .get(`/api/bank-files/${gen.body.id}/download`)
      .set("Authorization", auth(token));
    expect(dl.status).toBe(200);
  });

  it("Finance Manager (has finance:export) can generate and download", async () => {
    const token = await login("financeMgr");
    const gen = await request(app)
      .post("/api/bank-files")
      .set("Authorization", auth(token))
      .send({ batchId: lockedBatchId, bankName: "SBI", format: "txt" });
    expect(gen.status).toBe(201);
    const dl = await request(app)
      .get(`/api/bank-files/${gen.body.id}/download`)
      .set("Authorization", auth(token));
    expect(dl.status).toBe(200);
  });

  it("unauthenticated requests are rejected", async () => {
    const res = await request(app)
      .post("/api/bank-files")
      .send({ batchId: lockedBatchId, bankName: "SBI", format: "txt" });
    expect(res.status).toBe(401);
  });
});

describe.skip("admin-managed state rules: compliance_rules drive payroll output", () => {
  // The Horizon client (client-003) holds the Maharashtra workers. We create a
  // fresh, recalculatable June batch scoped to that client, then prove that
  // editing the Maharashtra PT rule via the admin endpoint changes the next
  // calculation's PT figures.
  const HORIZON_CLIENT_ID = "client-003";

  // Rules created by this test are tagged so we can remove them and keep the
  // test idempotent across reruns (compliance rules are append-only via the API).
  const TEST_RULE_MARKER = "__output-regressions admin-managed rule test__";

  async function deleteTestRules(): Promise<void> {
    await db
      .delete(complianceRulesTable)
      .where(
        and(
          eq(complianceRulesTable.state, "Maharashtra"),
          eq(complianceRulesTable.notes, TEST_RULE_MARKER),
        ),
      );
  }

  async function createAndCalcBatch(token: string): Promise<string> {
    // Transition June attendance for this client to "locked" so the batch is
    // calculatable (seed leaves June attendance "approved").
    const lock = await request(app)
      .post("/api/attendance/approve")
      .set("Authorization", auth(token))
      .send({ month: "2026-06", clientId: HORIZON_CLIENT_ID });
    expect(lock.status, `lock attendance: ${lock.text}`).toBe(200);

    // Reuse an existing non-locked batch for this month/client if one is present
    // (the create endpoint rejects a second active batch), otherwise create one.
    // This keeps the test idempotent across reruns without a fresh re-seed.
    const list = await request(app)
      .get("/api/payroll/batches")
      .query({ month: "2026-06", clientId: HORIZON_CLIENT_ID })
      .set("Authorization", auth(token));
    expect(list.status, `list batches: ${list.text}`).toBe(200);
    const reusable = (list.body as Array<{ id: string; status: string }>).find(
      (b) => b.status !== "locked",
    );

    let batchId: string;
    if (reusable) {
      batchId = reusable.id;
    } else {
      const create = await request(app)
        .post("/api/payroll/batches")
        .set("Authorization", auth(token))
        .send({ name: "MH rule test batch", month: "2026-06", clientId: HORIZON_CLIENT_ID });
      expect(create.status, `create batch: ${create.text}`).toBe(201);
      batchId = create.body.id as string;
    }

    const calc = await request(app)
      .post(`/api/payroll/batches/${batchId}/calculate`)
      .set("Authorization", auth(token));
    expect(calc.status, `calculate: ${calc.text}`).toBe(200);
    return batchId;
  }

  async function maharashtraPt(token: string, batchId: string): Promise<number> {
    const res = await request(app)
      .get(`/api/payroll/batches/${batchId}/records`)
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(200);
    const rows: Array<{ employeeCode: string; pt: string; grossPay: string }> = res.body;
    // NX016 is a Maharashtra monthly worker with gross well above the top PT slab.
    const nx016 = rows.find((r) => r.employeeCode === "NX016");
    expect(nx016, "expected NX016 in records").toBeTruthy();
    return Number(nx016!.pt);
  }

  it("editing a state's PT rule changes PT on the next calculation", async () => {
    const token = await login("admin"); // has compliance:write + payroll:write

    // Remove any leftover rules from a prior run so the baseline is the seeded
    // Maharashtra PT slab (top slab ₹200) regardless of how often this runs.
    await deleteTestRules();
    try {
      const batchId = await createAndCalcBatch(token);
      const ptBefore = await maharashtraPt(token, batchId);
      expect(ptBefore).toBe(200); // seeded MH top slab

      // Admin raises the Maharashtra top PT slab, effective for the batch month.
      const newRule = await request(app)
        .post("/api/compliance/rules")
        .set("Authorization", auth(token))
        .send({
          state: "Maharashtra",
          type: "pt",
          name: "Maharashtra PT (revised)",
          effectiveFrom: "2026-06-01",
          notes: TEST_RULE_MARKER,
          configJson: {
            slabs: [
              { upTo: 7500, amount: 0 },
              { upTo: 10000, amount: 175 },
              { upTo: null, amount: 300 },
            ],
          },
        });
      expect(newRule.status, newRule.text).toBe(201);

      // Recalculate the same batch — output must reflect the new rule.
      const recalc = await request(app)
        .post(`/api/payroll/batches/${batchId}/calculate`)
        .set("Authorization", auth(token));
      expect(recalc.status, recalc.text).toBe(200);
      const ptAfter = await maharashtraPt(token, batchId);
      expect(ptAfter).toBe(300);
    } finally {
      // Keep the database clean so reruns (and other tests) see seed state.
      await deleteTestRules();
    }
  });
});

describe.skip("invoice annexure: worker line items reconcile with the invoice header", () => {
  // Seed creates three June invoices (inv-c1-june / inv-c2-june / inv-c3-june),
  // each with per-worker invoiceLineItems. The annexure endpoint sums the
  // line-item totalAmounts and must reconcile (variance 0) against the invoice
  // header totalAmount — a mismatch silently bills the client the wrong figure.
  // Only the approved invoice is checked here: the annexure is a client-facing
  // reconciliation view, so draft invoices (inv-c2-june / inv-c3-june) are now
  // rejected with 400 — covered by the draft-guard suite below.
  const SEEDED_INVOICE_IDS = ["inv-c1-june"];

  for (const invoiceId of SEEDED_INVOICE_IDS) {
    it(`${invoiceId}: annexure computedTotal == invoice.totalAmount (reconciled, variance 0)`, async () => {
      const token = await login("financeMgr");
      const res = await request(app)
        .get(`/api/invoices/${invoiceId}/annexure`)
        .set("Authorization", auth(token));
      expect(res.status, res.text).toBe(200);

      const { invoice, lineItems, reconciliation } = res.body as {
        invoice: { totalAmount: string };
        lineItems: Array<{ totalAmount: string }>;
        reconciliation: {
          computedTotal: number;
          invoiceTotal: number;
          reconciled: boolean;
          variance: number;
        };
      };

      expect(lineItems.length).toBeGreaterThan(0);
      expect(reconciliation.reconciled).toBe(true);
      expect(reconciliation.variance).toBe(0);
      expect(
        Math.abs(reconciliation.computedTotal - reconciliation.invoiceTotal),
      ).toBeLessThan(0.01);

      // The reported invoiceTotal must match the persisted invoice header, and
      // the computedTotal must independently equal the sum of the line items.
      expect(
        Math.abs(reconciliation.invoiceTotal - Number(invoice.totalAmount)),
      ).toBeLessThan(0.01);
      const lineSum =
        Math.round(
          lineItems.reduce((s, li) => s + Number(li.totalAmount), 0) * 100,
        ) / 100;
      expect(Math.abs(lineSum - reconciliation.computedTotal)).toBeLessThan(0.01);
    });
  }
});

describe.skip("invoice export: draft invoices cannot be sent to the client", () => {
  // The client-facing CSV export is a final billing document. Seed marks
  // inv-c1-june as "approved" and inv-c2-june / inv-c3-june as "draft".
  // A draft invoice may be mis-calculated, so its export must be blocked (400)
  // until it has been approved — mirroring the locked-batch gate on other
  // money outputs (bank files, payslips).
  const DRAFT_INVOICE_ID = "inv-c2-june";
  const APPROVED_INVOICE_ID = "inv-c1-june";

  it("rejects exporting a draft invoice with a 400", async () => {
    const token = await login("financeMgr");
    const res = await request(app)
      .get(`/api/invoices/${DRAFT_INVOICE_ID}/export`)
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(400);
    expect(res.text.toLowerCase()).toContain("draft");
  });

  it("allows exporting an approved invoice", async () => {
    const token = await login("financeMgr");
    const res = await request(app)
      .get(`/api/invoices/${APPROVED_INVOICE_ID}/export`)
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(200);
    expect(res.text).toContain("Invoice Number");
    expect(res.text).toContain("Employee Code");
  });

  // The annexure is the sibling client-facing view: it returns full per-worker
  // line-item detail and reconciliation, so it must be gated on approval the
  // same way as the CSV export — a draft annexure leaks unvetted figures.
  it("rejects the annexure for a draft invoice with a 400", async () => {
    const token = await login("financeMgr");
    const res = await request(app)
      .get(`/api/invoices/${DRAFT_INVOICE_ID}/annexure`)
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(400);
    expect(res.text.toLowerCase()).toContain("draft");
    // No line-item detail may leak in the error response.
    expect(res.body.lineItems).toBeUndefined();
    expect(res.body.reconciliation).toBeUndefined();
  });

  it("allows the annexure for an approved invoice", async () => {
    const token = await login("financeMgr");
    const res = await request(app)
      .get(`/api/invoices/${APPROVED_INVOICE_ID}/annexure`)
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(200);
    expect(res.body.lineItems.length).toBeGreaterThan(0);
    expect(res.body.reconciliation.reconciled).toBe(true);
  });
});

describe.skip("invoice draft preview: internal pre-approval review of line items", () => {
  // Finance staff must be able to verify a draft invoice's worker-wise line
  // items BEFORE approving it, without unblocking the client-facing annexure.
  // The draft-preview endpoint requires clients:write (the approve permission,
  // stronger than finance:read) and is logged with a distinct exportType so
  // audit can tell internal previews apart from client-facing annexure pulls.
  const DRAFT_INVOICE_ID = "inv-c2-june";
  const APPROVED_INVOICE_ID = "inv-c1-june";

  it("finance manager (clients:write) can preview a draft invoice's line items", async () => {
    const token = await login("financeMgr");
    const res = await request(app)
      .get(`/api/invoices/${DRAFT_INVOICE_ID}/draft-preview`)
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(200);
    expect(res.body.internalPreview).toBe(true);
    expect(res.body.lineItems.length).toBeGreaterThan(0);
    expect(res.body.reconciliation).toBeTruthy();
    // Line items must reconcile against the draft header the same way the
    // annexure does post-approval, so staff review the real figures.
    const lineSum = res.body.lineItems.reduce(
      (s: number, li: { totalAmount: string }) => s + Number(li.totalAmount), 0);
    expect(Math.abs(lineSum - res.body.reconciliation.computedTotal)).toBeLessThan(0.01);
  });

  it("rejects the draft preview for a user without clients:write (403)", async () => {
    const token = await login("compliance"); // has payroll:read but no clients:write
    const res = await request(app)
      .get(`/api/invoices/${DRAFT_INVOICE_ID}/draft-preview`)
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(403);
    expect(res.body.lineItems).toBeUndefined();
  });

  it("rejects the draft preview for a non-draft invoice (400)", async () => {
    const token = await login("financeMgr");
    const res = await request(app)
      .get(`/api/invoices/${APPROVED_INVOICE_ID}/draft-preview`)
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(400);
    expect(res.body.lineItems).toBeUndefined();
  });

  it("client-facing annexure and CSV export remain blocked (400) for the same draft", async () => {
    const token = await login("financeMgr");
    const annex = await request(app)
      .get(`/api/invoices/${DRAFT_INVOICE_ID}/annexure`)
      .set("Authorization", auth(token));
    expect(annex.status, annex.text).toBe(400);
    const csv = await request(app)
      .get(`/api/invoices/${DRAFT_INVOICE_ID}/export`)
      .set("Authorization", auth(token));
    expect(csv.status, csv.text).toBe(400);
  });

  it("export log records the internal preview with a distinct exportType", async () => {
    const token = await login("financeMgr");
    const res = await request(app)
      .get(`/api/invoices/${DRAFT_INVOICE_ID}/draft-preview`)
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(200);

    const logs = await db.select().from(exportLogsTable)
      .where(eq(exportLogsTable.exportType, "invoice_draft_internal_preview"));
    const entry = logs.find((l) => (JSON.parse(l.filters ?? "{}") as { invoiceId?: string }).invoiceId === DRAFT_INVOICE_ID);
    expect(entry, "expected an invoice_draft_internal_preview export-log entry").toBeTruthy();
    // Must never be logged as a client-facing annexure pull.
    expect(entry!.exportType).not.toBe("invoice_annexure");
    expect(entry!.exportType).not.toBe("invoice_export");
  });
});

describe.skip("invoice generation: billing rule + GST produce reconcilable totals", () => {
  // Generating an invoice from a locked batch must apply the client's seeded
  // billing rule (% on gross) and 18% GST so that
  // subtotal = gross + serviceFee and total = subtotal + gst, and the
  // per-worker line items sum back to the header total.
  const CLIENT_1 = "client-001"; // seeded "Service Charge 10%" billing rule
  const SERVICE_FEE_RATE = 0.1;
  const GST_RATE = 0.18;

  it("applies the 10% service fee + 18% GST and the annexure reconciles", async () => {
    const token = await login("admin"); // has clients:write

    const gen = await request(app)
      .post("/api/invoices")
      .set("Authorization", auth(token))
      .send({ clientId: CLIENT_1, batchId: lockedBatchId, month: "2026-06" });
    expect(gen.status, gen.text).toBe(201);

    const inv = gen.body as {
      id: string;
      grossPayTotal: string;
      serviceFeeTotal: string;
      subtotal: string;
      gst: string;
      totalAmount: string;
      workerCount: number;
    };

    const gross = Number(inv.grossPayTotal);
    const serviceFee = Number(inv.serviceFeeTotal);
    const subtotal = Number(inv.subtotal);
    const gst = Number(inv.gst);
    const total = Number(inv.totalAmount);

    expect(gross).toBeGreaterThan(0);
    expect(inv.workerCount).toBeGreaterThan(0);

    // Billing rule (10% on gross) was applied to the service fee. Headers sum
    // per-worker rounded rows, so allow a small rounding drift across workers
    // rather than demanding an exact top-down round(gross * rate).
    const rateDrift = inv.workerCount * 0.01;
    expect(
      Math.abs(serviceFee - gross * SERVICE_FEE_RATE),
    ).toBeLessThanOrEqual(rateDrift);
    // subtotal = gross + service fee (exact, both are bottom-up sums).
    expect(Math.abs(subtotal - (gross + serviceFee))).toBeLessThan(0.01);
    // GST is ~18% of the subtotal (per-worker rounding tolerance).
    expect(
      Math.abs(gst - subtotal * GST_RATE),
    ).toBeLessThanOrEqual(rateDrift);
    // total = subtotal + GST (exact).
    expect(Math.abs(total - (subtotal + gst))).toBeLessThan(0.01);

    // The annexure is blocked for drafts, so approve the freshly generated
    // invoice first (admin has clients:write), then verify it reconciles.
    const approve = await request(app)
      .post(`/api/invoices/${inv.id}/approve`)
      .set("Authorization", auth(token));
    expect(approve.status, approve.text).toBe(200);

    // The generated annexure line items must reconcile to the header total.
    const annexure = await request(app)
      .get(`/api/invoices/${inv.id}/annexure`)
      .set("Authorization", auth(token));
    expect(annexure.status, annexure.text).toBe(200);
    expect(annexure.body.reconciliation.reconciled).toBe(true);
    expect(annexure.body.reconciliation.variance).toBe(0);
    expect(annexure.body.lineItems.length).toBe(inv.workerCount);
  });
});

describe.skip("pf-report: pfWage reconciles with the PF amount", () => {
  it("every row's pfWage * 12% equals the employee PF deduction", async () => {
    const token = await login("compliance");
    const res = await request(app)
      .get("/api/compliance/pf-report")
      .query({ batchId: lockedBatchId })
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(200);

    const rows: Array<{ pfWage: number; pfEmployee: string }> = res.body.rows;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const reconstructed = Math.round(Number(row.pfWage) * 0.12 * 100) / 100;
      expect(
        Math.abs(reconstructed - Number(row.pfEmployee)),
        `pfWage ${row.pfWage} * 12% should equal pfEmployee ${row.pfEmployee}`,
      ).toBeLessThan(0.5);
    }

    // Report totals must equal the sum of the row-level employee PF amounts.
    const rowSum =
      Math.round(rows.reduce((s, r) => s + Number(r.pfEmployee), 0) * 100) / 100;
    expect(
      Math.abs(rowSum - Number(res.body.totals.totalPfEmployee)),
    ).toBeLessThan(0.01);
  });
});

describe.skip("payslips: figures tie out to the locked payroll record", () => {
  // Per payslip the money must reconcile internally and against the source
  // payroll record: sum(earnings) == grossPay, grossPay - sum(deductions) ==
  // netPay, and gross/net equal the payrollRecords row. A drift here hands a
  // worker a payslip whose totals don't add up.

  type PayslipDetail = {
    id: string;
    workerId: string;
    grossPay: string;
    netPay: string;
    earnings: Array<{ name: string; amount: string }>;
    deductions: Array<{ name: string; amount: string }>;
    employerContributions: Array<{ name: string; amount: string }>;
  };

  async function recordMap(): Promise<Map<string, { grossPay: number; netPay: number }>> {
    const records = await db
      .select({
        workerId: payrollRecordsTable.workerId,
        grossPay: payrollRecordsTable.grossPay,
        netPay: payrollRecordsTable.netPay,
      })
      .from(payrollRecordsTable)
      .where(eq(payrollRecordsTable.batchId, lockedBatchId));
    return new Map(
      records.map((r) => [
        r.workerId,
        { grossPay: Number(r.grossPay), netPay: Number(r.netPay) },
      ]),
    );
  }

  async function generatePayslips(): Promise<void> {
    const token = await login("payrollMgr"); // has payroll:approve
    const gen = await request(app)
      .post("/api/payslips/generate")
      .set("Authorization", auth(token))
      .send({ batchId: lockedBatchId });
    expect(gen.status, gen.text).toBe(200);
    expect(gen.body.generated).toBeGreaterThan(0);
  }

  async function listPayslips(): Promise<Array<{ id: string; workerId: string }>> {
    const token = await login("payrollMgr");
    const res = await request(app)
      .get("/api/payslips")
      .query({ batchId: lockedBatchId })
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(200);
    return res.body;
  }

  async function fetchDetail(payslipId: string): Promise<PayslipDetail> {
    const token = await login("payrollMgr");
    const res = await request(app)
      .get(`/api/payslips/${payslipId}`)
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(200);
    return res.body;
  }

  function sum(lines: Array<{ amount: string }>): number {
    return Math.round(lines.reduce((s, l) => s + Number(l.amount), 0) * 100) / 100;
  }

  function assertReconciles(
    ps: PayslipDetail,
    rec: { grossPay: number; netPay: number },
  ): void {
    const gross = Number(ps.grossPay);
    const net = Number(ps.netPay);

    // Payslip header gross/net must equal the source payroll record.
    expect(
      Math.abs(gross - rec.grossPay),
      `worker ${ps.workerId}: payslip gross ${gross} vs record ${rec.grossPay}`,
    ).toBeLessThan(0.01);
    expect(
      Math.abs(net - rec.netPay),
      `worker ${ps.workerId}: payslip net ${net} vs record ${rec.netPay}`,
    ).toBeLessThan(0.01);

    // sum(earnings) == grossPay (allow sub-cent rounding across split lines).
    expect(ps.earnings.length).toBeGreaterThan(0);
    expect(
      Math.abs(sum(ps.earnings) - gross),
      `worker ${ps.workerId}: earnings sum ${sum(ps.earnings)} vs gross ${gross}`,
    ).toBeLessThan(0.02);

    // grossPay - sum(deductions) == netPay.
    expect(
      Math.abs(gross - sum(ps.deductions) - net),
      `worker ${ps.workerId}: gross ${gross} - deductions ${sum(ps.deductions)} vs net ${net}`,
    ).toBeLessThan(0.02);
  }

  it("line-item path: every payslip reconciles to its payroll record", async () => {
    await generatePayslips();
    const records = await recordMap();
    const payslips = await listPayslips();
    expect(payslips.length).toBe(records.size);

    for (const p of payslips) {
      const rec = records.get(p.workerId);
      expect(rec, `record for ${p.workerId}`).toBeTruthy();
      const detail = await fetchDetail(p.id);
      assertReconciles(detail, rec!);
    }
  });

  it("gross-split fallback path: a worker without line items still reconciles", async () => {
    // The seed gives every worker line items, so the 50/20/30 fallback is never
    // hit by default. Temporarily strip one worker's line items, regenerate, and
    // prove the fallback payslip still ties out — then restore the line items so
    // the seed state (and the line-item test above) is unaffected on reruns.
    const records = await recordMap();
    const targetWorkerId = [...records.keys()][0];

    const saved = await db
      .select()
      .from(payrollLineItemsTable)
      .where(
        and(
          eq(payrollLineItemsTable.batchId, lockedBatchId),
          eq(payrollLineItemsTable.workerId, targetWorkerId),
        ),
      );
    expect(saved.length, "target worker should have seeded line items").toBeGreaterThan(0);

    try {
      await db
        .delete(payrollLineItemsTable)
        .where(
          and(
            eq(payrollLineItemsTable.batchId, lockedBatchId),
            eq(payrollLineItemsTable.workerId, targetWorkerId),
          ),
        );

      await generatePayslips();

      const payslips = await listPayslips();
      const target = payslips.find((p) => p.workerId === targetWorkerId);
      expect(target, "payslip for the stripped worker").toBeTruthy();
      const detail = await fetchDetail(target!.id);

      // Fallback earnings are the 50/20/30 Basic/HRA/Special split.
      expect(detail.earnings.map((e) => e.name)).toEqual([
        "Basic",
        "HRA",
        "Special Allowance",
      ]);
      assertReconciles(detail, records.get(targetWorkerId)!);
    } finally {
      await db.insert(payrollLineItemsTable).values(saved);
    }
  });
});

describe.skip("min-wage: calc engine flags and the exceptions report agree", () => {
  // The per-state minimum-wage threshold is computed in two independent places
  // that must never drift apart:
  //   1. the payroll calc engine (calculatePayroll → flags.belowMinWage /
  //      flags.minWageThreshold), which flags below-minimum-wage on the
  //      individual payslips/records, and
  //   2. the /compliance/min-wage-exceptions report endpoint.
  // Both resolve the threshold as round(minDailyWage × presentDays) via
  // buildStateRulesFromDb(rows, batch.month) and flag only when
  // presentDays > 0 && grossPay < threshold. This test runs the real engine over
  // the locked batch's seeded inputs (mirroring the calculate route) and asserts
  // the flagged set, threshold, and shortfall match the report row-for-row, in
  // both directions.
  //
  // Rerun-safe: the locked batch (batch-june-2026) can never be recalculated, so
  // its persisted records are stable, and no min_wage compliance_rules are
  // created/mutated by the other tests in this file — so both sides resolve the
  // identical thresholds across reruns against a dirty DB.

  type EngineFlag = {
    employeeCode: string;
    state: string;
    presentDays: number;
    grossPay: number;
    threshold: number;
    shortfall: number;
  };

  // Map<employeeCode, EngineFlag> for every worker the calc engine flags below
  // minimum wage in the locked batch.
  const engineFlagged = new Map<string, EngineFlag>();

  beforeAll(async () => {
    const [batch] = await db
      .select()
      .from(payrollBatchesTable)
      .where(eq(payrollBatchesTable.id, lockedBatchId));
    expect(batch, "locked batch row").toBeTruthy();
    // Per-state rule set resolved exactly as the calculate route does:
    // admin-managed compliance_rules effective for the batch month override the
    // engine defaults; missing parameters fall back to the hardcoded defaults.
    const complianceRules = await db
      .select()
      .from(complianceRulesTable)
      
    const stateRulesMap = buildStateRulesFromDb(complianceRules, batch.month);

    const legalEntities = await db
      .select()
      .from(legalEntitiesTable)
      
    const pfBasisMap = new Map(legalEntities.map((le) => [le.id, le.pfWageBasis]));
    const leStateMap = new Map(legalEntities.map((le) => [le.id, le.state]));

    // Site zone tags, resolved exactly as the calculate route does: the
    // worker's siteId → site.zone feeds calculatePayroll's siteZone argument so
    // zone-based minimum-wage thresholds (e.g. KA Zone 2 ₹821/day at the seeded
    // Hubballi site) match what the report resolves at report time.
    const zoneSites = await db
      .select({ id: sitesTable.id, zone: sitesTable.zone })
      .from(sitesTable)
      
    const siteZoneMap = new Map(zoneSites.map((s) => [s.id, s.zone]));

    // The persisted records define exactly the worker set the report iterates.
    const records = await db
      .select()
      .from(payrollRecordsTable)
      .where(
        and(
          eq(payrollRecordsTable.batchId, lockedBatchId),
        ),
      );
    expect(records.length, "locked batch has payroll records").toBeGreaterThan(0);

    for (const rec of records) {
      const [worker] = await db
        .select()
        .from(workersTable)
        .where(eq(workersTable.id, rec.workerId));
      if (!worker) continue;

      const [salary] = await db
        .select()
        .from(salaryStructuresTable)
        .where(
          and(
            eq(salaryStructuresTable.workerId, worker.id),
            ),
        );
      const [statutory] = await db
        .select()
        .from(workerStatutoryProfilesTable)
        .where(
          and(
            eq(workerStatutoryProfilesTable.workerId, worker.id),
            ),
        );

      // The engine needs a salary structure to compute gross. Workers without
      // one cannot be re-run through the engine (the report still reads their
      // persisted gross, but those seeded gaps are never below minimum wage).
      if (!salary) continue;

      const resolvedState =
        worker.state ??
        (salary.legalEntityId ? leStateMap.get(salary.legalEntityId) : undefined) ??
        undefined;
      const stateRules = resolvedState ? stateRulesMap.get(resolvedState) : undefined;

      const calc = calculatePayroll(
        {
          grossMonthly: Number(salary.grossMonthly),
          wageType: salary.wageType,
          basicAmount: salary.basicAmount ? Number(salary.basicAmount) : undefined,
          hraAmount: salary.hraAmount ? Number(salary.hraAmount) : undefined,
        },
        {
          // Day counts come from the locked payroll record itself (the authoritative
          // basis the batch was locked on), not the attendance table — June
          // attendance is left "approved" in the seed, so a status="locked"
          // attendance lookup would miss and make this check vacuous.
          presentDays: Number(rec.presentDays),
          totalWorkingDays: Number(rec.totalWorkingDays),
          lwpDays: Number(rec.lwpDays),
          otHours: Number(rec.otHours),
        },
        {
          pfEnrolled: statutory?.pfEnrolled ?? false,
          esiEnrolled: statutory?.esiEnrolled ?? false,
          ptApplicable: statutory?.ptApplicable ?? false,
          lwfApplicable: statutory?.lwfApplicable ?? false,
        },
        resolvedState,
        (salary.legalEntityId ? pfBasisMap.get(salary.legalEntityId) : undefined) ===
        "full_monthly"
          ? "full_monthly"
          : "prorated_earned",
        stateRules,
        batch.month,
        worker.siteId ? siteZoneMap.get(worker.siteId) ?? null : null,
      );

      // The engine must reproduce the persisted gross pay for a locked batch;
      // otherwise the report (which reads the persisted gross) and the engine
      // would be comparing different numbers.
      expect(
        Math.abs(calc.grossPay - Number(rec.grossPay)),
        `engine grossPay should match persisted record for ${worker.employeeCode}`,
      ).toBeLessThan(0.01);

      if (calc.flags.belowMinWage) {
        engineFlagged.set(worker.employeeCode, {
          employeeCode: worker.employeeCode,
          state: resolvedState ?? "Unspecified",
          presentDays: Number(rec.presentDays),
          grossPay: calc.grossPay,
          threshold: calc.flags.minWageThreshold,
          shortfall:
            Math.round((calc.flags.minWageThreshold - calc.grossPay) * 100) / 100,
        });
      }
    }
  });

  it("the engine flags at least one below-minimum-wage worker (non-vacuous)", () => {
    // The seeded Karnataka workers (e.g. NX002/NX007/NX011) earn below
    // 899/day × presentDays. If this ever drops to zero the cross-check below
    // would pass vacuously, so pin a positive case here.
    expect(engineFlagged.size).toBeGreaterThan(0);
  });

  it("every report row equals the engine flag, and vice versa (set + values)", async () => {
    const token = await login("compliance");
    const res = await request(app)
      .get("/api/compliance/min-wage-exceptions")
      .query({ batchId: lockedBatchId })
      .set("Authorization", auth(token));
    expect(res.status, res.text).toBe(200);

    const reportRows: Array<{
      employeeCode: string;
      state: string;
      presentDays: string;
      minDailyWage: number;
      grossPay: string;
      minWage: number;
      shortfall: string;
    }> = res.body.exceptions;

    const reportByCode = new Map(reportRows.map((r) => [r.employeeCode, r]));

    // Same set of workers, both directions.
    const engineCodes = [...engineFlagged.keys()].sort();
    const reportCodes = [...reportByCode.keys()].sort();
    expect(reportCodes).toEqual(engineCodes);

    // Threshold and shortfall agree for every flagged worker.
    for (const code of engineCodes) {
      const eng = engineFlagged.get(code)!;
      const rep = reportByCode.get(code)!;
      expect(
        Math.abs(rep.minWage - eng.threshold),
        `threshold mismatch for ${code}: report ${rep.minWage} vs engine ${eng.threshold}`,
      ).toBeLessThan(0.01);
      expect(
        Math.abs(Number(rep.grossPay) - eng.grossPay),
        `grossPay mismatch for ${code}`,
      ).toBeLessThan(0.01);
      expect(
        Math.abs(Number(rep.shortfall) - eng.shortfall),
        `shortfall mismatch for ${code}: report ${rep.shortfall} vs engine ${eng.shortfall}`,
      ).toBeLessThan(0.01);
      expect(Number(rep.presentDays)).toBe(eng.presentDays);
    }
  });
});

describe.skip("compliance dashboard: min-wage count matches the detail report", () => {
  it("dashboard minWageViolations equals the exceptions row count for the latest locked batch", async () => {
    const token = await login("compliance");

    // The dashboard derives its headline count from the latest locked batch
    // (highest month). Resolve that batch the same way to compare apples to apples.
    const batchesRes = await request(app)
      .get("/api/payroll/batches")
      .set("Authorization", auth(token));
    expect(batchesRes.status, batchesRes.text).toBe(200);
    const locked: Array<{ id: string; status: string; month: string }> =
      batchesRes.body.filter((b: { status: string }) => b.status === "locked");
    expect(locked.length).toBeGreaterThan(0);
    const latestLocked = [...locked].sort((a, b) =>
      b.month.localeCompare(a.month),
    )[0];

    const detailRes = await request(app)
      .get("/api/compliance/min-wage-exceptions")
      .query({ batchId: latestLocked.id })
      .set("Authorization", auth(token));
    expect(detailRes.status, detailRes.text).toBe(200);
    const detailCount: number = detailRes.body.exceptions.length;

    const dashRes = await request(app)
      .get("/api/dashboards/compliance")
      .set("Authorization", auth(token));
    expect(dashRes.status, dashRes.text).toBe(200);

    expect(
      dashRes.body.minWageViolations,
      `dashboard count ${dashRes.body.minWageViolations} should equal detail count ${detailCount}`,
    ).toBe(detailCount);
  });
});

describe.skip("compliance dashboard: PF ECR / ESI pending counts", () => {
  it("pfPending/esiPending equal locked batches without a matching compliance export log", async () => {
    const token = await login("compliance");

    const batchesRes = await request(app)
      .get("/api/payroll/batches")
      .set("Authorization", auth(token));
    expect(batchesRes.status, batchesRes.text).toBe(200);
    const lockedIds: string[] = batchesRes.body
      .filter((b: { status: string }) => b.status === "locked")
      .map((b: { id: string }) => b.id);
    expect(lockedIds.length).toBeGreaterThan(0);

    // Export logs require audit:read — the auditor role has it.
    const auditorToken = await login("auditor");
    const logsRes = await request(app)
      .get("/api/export-logs")
      .set("Authorization", auth(auditorToken));
    expect(logsRes.status, logsRes.text).toBe(200);
    const exportedFor = (type: string): Set<string> =>
      new Set(
        logsRes.body
          .filter((l: { module: string; exportType: string }) => l.module === "compliance" && l.exportType === type)
          .map((l: { filters: { batchId?: string } }) => l.filters?.batchId)
          .filter(Boolean) as string[],
      );
    const pfDone = exportedFor("pf_ecr");
    const esiDone = exportedFor("esi_report");
    const expectedPfPending = lockedIds.filter((id) => !pfDone.has(id)).length;
    const expectedEsiPending = lockedIds.filter((id) => !esiDone.has(id)).length;

    const dashRes = await request(app)
      .get("/api/dashboards/compliance")
      .set("Authorization", auth(token));
    expect(dashRes.status, dashRes.text).toBe(200);
    expect(typeof dashRes.body.pfPending).toBe("number");
    expect(typeof dashRes.body.esiPending).toBe("number");
    expect(dashRes.body.pfPending).toBe(expectedPfPending);
    expect(dashRes.body.esiPending).toBe(expectedEsiPending);
  });

  it("a freshly locked batch with no reports increases both pending counts until reports are generated", async () => {
    const token = await login("compliance");
    const before = await request(app)
      .get("/api/dashboards/compliance")
      .set("Authorization", auth(token));
    expect(before.status, before.text).toBe(200);

    // Generating PF/ESI reports for a locked batch writes export logs, which
    // should reduce the pending counts to exclude that batch.
    const batchesRes = await request(app)
      .get("/api/payroll/batches")
      .set("Authorization", auth(token));
    const locked = batchesRes.body.filter((b: { status: string }) => b.status === "locked");
    const batchId = locked[0].id;

    const pfRes = await request(app)
      .get("/api/compliance/pf-report")
      .query({ batchId })
      .set("Authorization", auth(token));
    expect(pfRes.status, pfRes.text).toBe(200);
    const esiRes = await request(app)
      .get("/api/compliance/esi-report")
      .query({ batchId })
      .set("Authorization", auth(token));
    expect(esiRes.status, esiRes.text).toBe(200);

    const after = await request(app)
      .get("/api/dashboards/compliance")
      .set("Authorization", auth(token));
    expect(after.status, after.text).toBe(200);
    // Batch now has both reports generated — it must not be counted as pending.
    expect(after.body.pfPending).toBeLessThanOrEqual(before.body.pfPending);
    expect(after.body.esiPending).toBeLessThanOrEqual(before.body.esiPending);
  });
});

describe.skip("zone-based min wage: site zone flows through calculation, trace and report", () => {
  // Zone rates are covered by pure calc-engine unit tests (min-wage-zones.test.ts);
  // this suite proves the real route wiring end-to-end: worker.siteId → site.zone →
  // calculatePayroll's siteZone arg → exception flag + trace, and the standalone
  // /compliance/min-wage-exceptions report resolving the same zone at report time.
  //
  // Seed state: site-001 (Embassy Golf Links, client-001) is tagged "Zone 1" and
  // hosts the deliberate below-min-wage workers NX002/NX007 (NX011 lives at the
  // Zone 2 Hubballi site, site-006). The seeded KA min_wage rule carries
  // zoneRates Zone 1 ₹899 / Zone 2 ₹821 / Zone 3 ₹743.
  const KA_CLIENT_ID = "client-001";
  const ZONE_SITE_ID = "site-001";
  const ZONE3_RATE = 743;

  async function getSiteZone(): Promise<string | null> {
    const [site] = await db
      .select({ zone: sitesTable.zone })
      .from(sitesTable)
      .where(eq(sitesTable.id, ZONE_SITE_ID));
    expect(site, "expected seeded site site-001").toBeTruthy();
    return site!.zone;
  }

  async function setSiteZone(zone: string | null): Promise<void> {
    await db.update(sitesTable).set({ zone }).where(eq(sitesTable.id, ZONE_SITE_ID));
  }

  // Same idempotent prepare-batch pattern as the admin-managed-rules suite:
  // lock June attendance for the client, reuse an existing non-locked batch if
  // one is present (the create endpoint rejects a second active batch for the
  // same month+client), then run the real calculate route.
  async function prepareAndCalcBatch(token: string): Promise<string> {
    const lock = await request(app)
      .post("/api/attendance/approve")
      .set("Authorization", auth(token))
      .send({ month: "2026-06", clientId: KA_CLIENT_ID });
    expect(lock.status, `lock attendance: ${lock.text}`).toBe(200);

    const list = await request(app)
      .get("/api/payroll/batches")
      .query({ month: "2026-06", clientId: KA_CLIENT_ID })
      .set("Authorization", auth(token));
    expect(list.status, `list batches: ${list.text}`).toBe(200);
    const reusable = (list.body as Array<{ id: string; status: string }>).find(
      (b) => b.status !== "locked",
    );

    let batchId: string;
    if (reusable) {
      batchId = reusable.id;
    } else {
      const create = await request(app)
        .post("/api/payroll/batches")
        .set("Authorization", auth(token))
        .send({ name: "KA zone test batch", month: "2026-06", clientId: KA_CLIENT_ID });
      expect(create.status, `create batch: ${create.text}`).toBe(201);
      batchId = create.body.id as string;
    }

    const calc = await request(app)
      .post(`/api/payroll/batches/${batchId}/calculate`)
      .set("Authorization", auth(token));
    expect(calc.status, `calculate: ${calc.text}`).toBe(200);
    return batchId;
  }

  it("recalculation under a Zone 3 site flags at ₹743/day and the report returns the zone", async () => {
    const token = await login("admin"); // payroll:write + compliance:read via role perms

    // Capture the current zone so we can restore it. If a previously crashed
    // run left the site tagged "Zone 3", restore to the seeded "Zone 1" instead
    // so this test stays rerun-safe against a dirty DB.
    const zoneBefore = await getSiteZone();
    const restoreZone = zoneBefore === "Zone 3" ? "Zone 1" : zoneBefore;
    let batchId: string | null = null;

    try {
      await setSiteZone("Zone 3");
      batchId = await prepareAndCalcBatch(token);

      // NX002 (site-001, gross ₹14,000) must be flagged against the Zone 3 rate.
      const recs = await request(app)
        .get(`/api/payroll/batches/${batchId}/records`)
        .set("Authorization", auth(token));
      expect(recs.status, recs.text).toBe(200);
      const rows: Array<{
        id: string;
        workerId: string;
        employeeCode: string | null;
        presentDays: string;
        grossPay: string;
        hasException: string;
      }> = recs.body;
      const nx002 = rows.find((r) => r.employeeCode === "NX002");
      expect(nx002, "expected NX002 in the calculated records").toBeTruthy();
      expect(nx002!.hasException).toBe("true");

      const presentDays = Number(nx002!.presentDays);
      expect(presentDays).toBeGreaterThan(0);
      const expectedThreshold = Math.round(ZONE3_RATE * presentDays * 100) / 100;
      // Sanity: still below even the lower Zone 3 threshold, so the flag is not vacuous.
      expect(Number(nx002!.grossPay)).toBeLessThan(expectedThreshold);

      // The stored trace must carry the zone-resolved rate, threshold and zone label.
      const traceRes = await request(app)
        .get(`/api/payroll/records/${nx002!.id}/trace`)
        .set("Authorization", auth(token));
      expect(traceRes.status, traceRes.text).toBe(200);
      const trace: Array<{ step: string; inputs: unknown; note?: string | null }> =
        traceRes.body.trace;
      const mwStep = trace.find((t) => t.step === "Minimum Wage Check");
      expect(mwStep, "expected a Minimum Wage Check trace step").toBeTruthy();
      const inputs =
        typeof mwStep!.inputs === "string"
          ? (JSON.parse(mwStep!.inputs) as Record<string, unknown>)
          : (mwStep!.inputs as Record<string, unknown>);
      expect(Number(inputs.minDailyWage)).toBe(ZONE3_RATE);
      expect(Number(inputs.threshold)).toBeCloseTo(expectedThreshold, 2);
      expect(String(inputs.zone)).toBe("Zone 3");
      expect(String(mwStep!.note)).toContain("₹743/day");
      expect(String(mwStep!.note)).toContain("(Zone 3)");

      // The route must also raise the min-wage exception with the zone threshold.
      const excRes = await request(app)
        .get("/api/payroll/exceptions")
        .query({ batchId })
        .set("Authorization", auth(token));
      expect(excRes.status, excRes.text).toBe(200);
      const mwExc = (
        excRes.body as Array<{ workerId: string; type: string; description: string }>
      ).find((e) => e.workerId === nx002!.workerId && e.type === "minimum_wage_issue");
      expect(mwExc, "expected a minimum_wage_issue exception for NX002").toBeTruthy();
      expect(mwExc!.description).toContain(expectedThreshold.toFixed(2));

      // The standalone report resolves zones at report time from the current
      // site tags, so the seeded locked batch now shows Zone 3 for site-001
      // workers — proving the report's zone column matches the calc engine.
      const compToken = await login("compliance");
      const rep = await request(app)
        .get("/api/compliance/min-wage-exceptions")
        .query({ batchId: lockedBatchId })
        .set("Authorization", auth(compToken));
      expect(rep.status, rep.text).toBe(200);
      const repRow = (
        rep.body.exceptions as Array<{
          employeeCode: string | null;
          zone: string | null;
          minDailyWage: number;
          minWage: number;
          presentDays: string;
        }>
      ).find((e) => e.employeeCode === "NX002");
      expect(repRow, "expected NX002 in the min-wage exceptions report").toBeTruthy();
      expect(repRow!.zone).toBe("Zone 3");
      expect(repRow!.minDailyWage).toBe(ZONE3_RATE);
      expect(repRow!.minWage).toBeCloseTo(
        Math.round(ZONE3_RATE * Number(repRow!.presentDays) * 100) / 100,
        2,
      );
    } finally {
      // Restore the seeded zone tag, then recalculate the test batch so its
      // stored records/trace reflect seed state again for other tests/reruns.
      await setSiteZone(restoreZone);
      if (batchId) {
        await request(app)
          .post(`/api/payroll/batches/${batchId}/calculate`)
          .set("Authorization", auth(token));
      }
    }
  });

  it("after the zone reset, the report resolves site-001 back to the flat Zone 1 rate", async () => {
    // Regression guard for the reset itself: report-time resolution must be
    // back on ₹899/day (Zone 1) once the tag is restored.
    const token = await login("compliance");
    const rep = await request(app)
      .get("/api/compliance/min-wage-exceptions")
      .query({ batchId: lockedBatchId })
      .set("Authorization", auth(token));
    expect(rep.status, rep.text).toBe(200);
    const repRow = (
      rep.body.exceptions as Array<{
        employeeCode: string | null;
        zone: string | null;
        minDailyWage: number;
      }>
    ).find((e) => e.employeeCode === "NX002");
    expect(repRow, "expected NX002 in the min-wage exceptions report").toBeTruthy();
    expect(repRow!.zone).toBe("Zone 1");
    expect(repRow!.minDailyWage).toBe(899);
  });
});
