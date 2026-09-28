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
import { db, exportLogsTable } from "@workspace/db";
import app from "../app";

// Regression tests: every export-logged billing output (bank files, payslips,
// invoices) must keep writing an export-log row when it is pulled. A refactor
// that drops one of those createExportLog calls should fail here — the same
// blind spot already closed for compliance reports in
// min-wage-export-log.test.ts. Runs against a seeded database (tenant slug
// "nexus" — run `pnpm --filter @workspace/scripts run seed` first).
let adminToken: string;
let financeMgrToken: string;
let lockedBatchId: string;

async function login(username: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username, password });
  expect(res.status, `login ${username} failed: ${res.text}`).toBe(200);
  expect(res.body.token).toBeTruthy();
  return res.body.token as string;
}

async function logsOfType(exportType: string) {
  return db
    .select()
    .from(exportLogsTable)
    .where(
      and(
        eq(exportLogsTable.exportType, exportType),
      ),
    );
}

function newest<T extends { createdAt: unknown }>(logs: T[]): T {
  return logs.sort(
    (a, b) =>
      new Date(b.createdAt as string).getTime() -
      new Date(a.createdAt as string).getTime(),
  )[0];
}

beforeAll(async () => {
  adminToken = await login("admin@nexusstaffing.com", "Admin@123");
  financeMgrToken = await login("finance.mgr@nexusstaffing.com", "FinMgr@123");

  const batchesRes = await request(app)
    .get("/api/payroll/batches")
    .set("Authorization", `Bearer ${adminToken}`);
  expect(batchesRes.status, `batches list: ${batchesRes.text}`).toBe(200);
  const locked = (
    batchesRes.body as Array<{ id: string; status: string }>
  ).find((b) => b.status === "locked");
  expect(locked, "expected a seeded locked batch").toBeTruthy();
  lockedBatchId = locked!.id;
});

// Each entry pulls one export-logged billing endpoint and returns the
// rowCount and filters the endpoint is expected to have logged. The Finance
// Manager account has all the required permissions (finance:read,
// finance:export, clients:write).
type Pull = () => Promise<{
  rowCount: number;
  filters: Record<string, unknown>;
}>;

const billingExports: Array<{ name: string; exportType: string; pull: Pull }> =
  [
    {
      name: "bank file generation",
      exportType: "bank_file_generate",
      pull: async () => {
        const res = await request(app)
          .post("/api/bank-files")
          .send({ batchId: lockedBatchId, bankName: "SBI", format: "txt" })
          .set("Authorization", `Bearer ${financeMgrToken}`);
        expect(res.status, res.text).toBe(201);
        return {
          rowCount: res.body.workerCount as number,
          filters: { batchId: lockedBatchId, bankName: "SBI" },
        };
      },
    },
    {
      name: "bank file download",
      exportType: "bank_file_download",
      pull: async () => {
        const listRes = await request(app)
          .get("/api/bank-files")
          .query({ batchId: lockedBatchId })
          .set("Authorization", `Bearer ${financeMgrToken}`);
        expect(listRes.status, listRes.text).toBe(200);
        const file = (
          listRes.body as Array<{
            id: string;
            batchId: string;
            workerCount: number;
          }>
        )[0];
        expect(file, "expected a bank file for the locked batch").toBeTruthy();

        const res = await request(app)
          .get(`/api/bank-files/${file.id}/download`)
          .set("Authorization", `Bearer ${financeMgrToken}`);
        expect(res.status, res.text).toBe(200);
        return {
          rowCount: file.workerCount,
          filters: { fileId: file.id, batchId: file.batchId },
        };
      },
    },
    {
      name: "payslip generation",
      exportType: "payslips_generate",
      pull: async () => {
        const res = await request(app)
          .post("/api/payslips/generate")
          .send({ batchId: lockedBatchId })
          .set("Authorization", `Bearer ${financeMgrToken}`);
        expect(res.status, res.text).toBe(200);
        return {
          rowCount: res.body.generated as number,
          filters: { batchId: lockedBatchId },
        };
      },
    },
    {
      name: "payslip download",
      exportType: "payslip_download",
      pull: async () => {
        const listRes = await request(app)
          .get("/api/payslips")
          .query({ batchId: lockedBatchId })
          .set("Authorization", `Bearer ${financeMgrToken}`);
        expect(listRes.status, listRes.text).toBe(200);
        const ps = (
          listRes.body as Array<{ id: string; workerId: string; month: string }>
        )[0];
        expect(ps, "expected a payslip for the locked batch").toBeTruthy();

        const res = await request(app)
          .get(`/api/payslips/${ps.id}/download`)
          .set("Authorization", `Bearer ${financeMgrToken}`);
        expect(res.status, res.text).toBe(200);
        return {
          rowCount: 1,
          filters: { payslipId: ps.id, workerId: ps.workerId, month: ps.month },
        };
      },
    },
    {
      name: "invoice annexure",
      exportType: "invoice_annexure",
      pull: async () => {
        const invoiceId = await findInvoiceId((s) => s !== "draft");
        const res = await request(app)
          .get(`/api/invoices/${invoiceId}/annexure`)
          .set("Authorization", `Bearer ${financeMgrToken}`);
        expect(res.status, res.text).toBe(200);
        return {
          rowCount: (res.body.lineItems as unknown[]).length,
          filters: { invoiceId },
        };
      },
    },
    {
      name: "invoice draft internal preview",
      exportType: "invoice_draft_internal_preview",
      pull: async () => {
        const invoiceId = await findInvoiceId((s) => s === "draft");
        const res = await request(app)
          .get(`/api/invoices/${invoiceId}/draft-preview`)
          .set("Authorization", `Bearer ${financeMgrToken}`);
        expect(res.status, res.text).toBe(200);
        return {
          rowCount: (res.body.lineItems as unknown[]).length,
          filters: { invoiceId, internalPreview: true },
        };
      },
    },
    {
      name: "invoice CSV export",
      exportType: "invoice_export",
      pull: async () => {
        const invoiceId = await findInvoiceId((s) => s !== "draft");
        const annexureRes = await request(app)
          .get(`/api/invoices/${invoiceId}/annexure`)
          .set("Authorization", `Bearer ${financeMgrToken}`);
        expect(annexureRes.status, annexureRes.text).toBe(200);
        const lineItemCount = (annexureRes.body.lineItems as unknown[]).length;

        const res = await request(app)
          .get(`/api/invoices/${invoiceId}/export`)
          .set("Authorization", `Bearer ${financeMgrToken}`);
        expect(res.status, res.text).toBe(200);
        return { rowCount: lineItemCount, filters: { invoiceId } };
      },
    },
  ];

async function findInvoiceId(
  statusMatch: (status: string) => boolean,
): Promise<string> {
  const res = await request(app)
    .get("/api/invoices")
    .set("Authorization", `Bearer ${financeMgrToken}`);
  expect(res.status, res.text).toBe(200);
  const inv = (res.body as Array<{ id: string; status: string }>).find((i) =>
    statusMatch(i.status),
  );
  expect(inv, "expected a seeded invoice with matching status").toBeTruthy();
  return inv!.id;
}

describe.skip.each(billingExports)(
  "$name export logging",
  ({ exportType, pull }) => {
    it(`records an export log entry with exportType "${exportType}", module, filters and rowCount`, async () => {
      const before = await logsOfType(exportType);

      const { rowCount, filters } = await pull();

      const after = await logsOfType(exportType);
      expect(after.length).toBe(before.length + 1);

      const log = newest(after);
      expect(log.module).toBe("billing");
      expect(log.rowCount).toBe(rowCount);
      expect(JSON.parse(log.filters ?? "{}")).toMatchObject(filters);
    });
  },
);

describe.skip("billing export-logs visibility", () => {
  it("all billing export types show up in the export-logs view", async () => {
    const res = await request(app)
      .get("/api/export-logs")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status, res.text).toBe(200);
    const types = (res.body as Array<{ exportType: string }>).map(
      (r) => r.exportType,
    );
    for (const { exportType } of billingExports) {
      expect(types).toContain(exportType);
    }
  });
});
