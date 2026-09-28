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

// Regression test: pulling the min-wage exceptions report must record an
// export log entry (exportType "min_wage_exceptions"), like the other
// compliance reports (pf/esi/pt/lwf). Runs against a seeded database
// (tenant slug "nexus" — run `pnpm --filter @workspace/scripts run seed` first).
let complianceToken: string;
let adminToken: string;
let lockedBatchId: string;

async function login(username: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ username, password });
  expect(res.status, `login ${username} failed: ${res.text}`).toBe(200);
  expect(res.body.token).toBeTruthy();
  return res.body.token as string;
}

beforeAll(async () => {
  complianceToken = await login("compliance@nexusstaffing.com", "Comply@123");
  adminToken = await login("admin@nexusstaffing.com", "Admin@123");

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

describe.skip("min-wage exceptions report export logging", () => {
  it("records an export log entry with type, filters and rowCount", async () => {
    const before = await db
      .select()
      .from(exportLogsTable)
      .where(
        and(
          eq(exportLogsTable.exportType, "min_wage_exceptions"),
        ),
      );

    const res = await request(app)
      .get("/api/compliance/min-wage-exceptions")
      .query({ batchId: lockedBatchId })
      .set("Authorization", `Bearer ${complianceToken}`);
    expect(res.status, res.text).toBe(200);
    const exceptionCount = (res.body.exceptions as unknown[]).length;

    const after = await db
      .select()
      .from(exportLogsTable)
      .where(
        and(
          eq(exportLogsTable.exportType, "min_wage_exceptions"),
        ),
      );
    expect(after.length).toBe(before.length + 1);

    const newest = after.sort(
      (a, b) =>
        new Date(b.createdAt as unknown as string).getTime() -
        new Date(a.createdAt as unknown as string).getTime(),
    )[0];
    expect(newest.module).toBe("compliance");
    expect(newest.rowCount).toBe(exceptionCount);
    expect(JSON.parse(newest.filters ?? "{}")).toMatchObject({
      batchId: lockedBatchId,
    });
  });

  it("shows up in the export-logs view alongside other compliance reports", async () => {
    const res = await request(app)
      .get("/api/export-logs")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status, res.text).toBe(200);
    const types = (res.body as Array<{ exportType: string }>).map(
      (r) => r.exportType,
    );
    expect(types).toContain("min_wage_exceptions");
  });
});

// Regression tests: every compliance report handler (pf/esi/pt/lwf) must keep
// writing an export-log row when the report is pulled. A refactor that drops
// one of those createExportLog calls should fail here.
const complianceReports = [
  { name: "PF ECR", path: "/api/compliance/pf-report", exportType: "pf_ecr" },
  {
    name: "ESI report",
    path: "/api/compliance/esi-report",
    exportType: "esi_report",
  },
  {
    name: "PT report",
    path: "/api/compliance/pt-report",
    exportType: "pt_report",
  },
  {
    name: "LWF report",
    path: "/api/compliance/lwf-report",
    exportType: "lwf_report",
  },
] as const;

describe.skip.each(complianceReports)(
  "$name export logging",
  ({ path, exportType }) => {
    it(`records an export log entry with exportType "${exportType}", filters and rowCount`, async () => {
      const before = await db
        .select()
        .from(exportLogsTable)
        .where(
          and(
            eq(exportLogsTable.exportType, exportType),
          ),
        );

      const res = await request(app)
        .get(path)
        .query({ batchId: lockedBatchId })
        .set("Authorization", `Bearer ${complianceToken}`);
      expect(res.status, res.text).toBe(200);
      const rowCount = (res.body.rows as unknown[]).length;

      const after = await db
        .select()
        .from(exportLogsTable)
        .where(
          and(
            eq(exportLogsTable.exportType, exportType),
          ),
        );
      expect(after.length).toBe(before.length + 1);

      const newest = after.sort(
        (a, b) =>
          new Date(b.createdAt as unknown as string).getTime() -
          new Date(a.createdAt as unknown as string).getTime(),
      )[0];
      expect(newest.module).toBe("compliance");
      expect(newest.rowCount).toBe(rowCount);
      expect(JSON.parse(newest.filters ?? "{}")).toMatchObject({
        batchId: lockedBatchId,
      });
    });
  },
);

describe.skip("compliance report export-logs visibility", () => {
  it("all four report types show up in the export-logs view", async () => {
    const res = await request(app)
      .get("/api/export-logs")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status, res.text).toBe(200);
    const types = (res.body as Array<{ exportType: string }>).map(
      (r) => r.exportType,
    );
    for (const { exportType } of complianceReports) {
      expect(types).toContain(exportType);
    }
  });
});
