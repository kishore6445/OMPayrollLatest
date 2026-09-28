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

// Regression test: pulling the worker-master, payroll-variance and
// attendance-exceptions reports must record an export log entry so auditors
// can see who accessed them. Runs against a seeded database (tenant slug
// "nexus" — run `pnpm --filter @workspace/scripts run seed` first).
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

async function countLogs(exportType: string) {
  return db
    .select()
    .from(exportLogsTable)
    .where(
      and(
        eq(exportLogsTable.exportType, exportType),
      ),
    );
}

function newest(logs: Array<{ createdAt: unknown }>) {
  return logs.sort(
    (a, b) =>
      new Date(b.createdAt as string).getTime() -
      new Date(a.createdAt as string).getTime(),
  )[0];
}

beforeAll(async () => {
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

describe.skip("payroll-summary report export logging", () => {
  it("records an export log entry with month filter and rowCount", async () => {
    const before = await countLogs("payroll_summary");

    const res = await request(app)
      .get("/api/reports/payroll-summary")
      .query({ month: "2026-06" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status, res.text).toBe(200);
    const rowCount = (res.body as unknown[]).length;

    const after = await countLogs("payroll_summary");
    expect(after.length).toBe(before.length + 1);

    const log = newest(after) as typeof after[number];
    expect(log.module).toBe("reports");
    expect(log.rowCount).toBe(rowCount);
    expect(JSON.parse(log.filters as unknown as string)).toMatchObject({
      month: "2026-06",
    });
  });
});

describe.skip("worker-payroll report export logging", () => {
  it("records an export log entry with batchId filter and rowCount", async () => {
    const before = await countLogs("worker_payroll");

    const res = await request(app)
      .get("/api/reports/worker-payroll")
      .query({ batchId: lockedBatchId })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status, res.text).toBe(200);
    const rowCount = (res.body as unknown[]).length;

    const after = await countLogs("worker_payroll");
    expect(after.length).toBe(before.length + 1);

    const log = newest(after) as typeof after[number];
    expect(log.module).toBe("reports");
    expect(log.rowCount).toBe(rowCount);
    expect(JSON.parse(log.filters as unknown as string)).toMatchObject({
      batchId: lockedBatchId,
    });
  });
});

describe.skip("worker-master report export logging", () => {
  it("records an export log entry with module, type and rowCount", async () => {
    const before = await countLogs("worker_master");

    const res = await request(app)
      .get("/api/reports/worker-master")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status, res.text).toBe(200);
    const rowCount = (res.body as unknown[]).length;

    const after = await countLogs("worker_master");
    expect(after.length).toBe(before.length + 1);

    const log = newest(after) as typeof after[number];
    expect(log.module).toBe("reports");
    expect(log.rowCount).toBe(rowCount);
  });

  it("shows up in the export-logs view", async () => {
    const res = await request(app)
      .get("/api/export-logs")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status, res.text).toBe(200);
    const types = (res.body as Array<{ exportType: string }>).map(
      (r) => r.exportType,
    );
    expect(types).toContain("worker_master");
  });
});

describe.skip("payroll-variance report export logging", () => {
  it("records an export log entry with month filter and rowCount", async () => {
    const before = await countLogs("payroll_variance");

    const res = await request(app)
      .get("/api/reports/payroll-variance")
      .query({ month: "2026-06" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status, res.text).toBe(200);
    const rowCount = (res.body as unknown[]).length;

    const after = await countLogs("payroll_variance");
    expect(after.length).toBe(before.length + 1);

    const log = newest(after) as typeof after[number];
    expect(log.module).toBe("reports");
    expect(log.rowCount).toBe(rowCount);
    expect(JSON.parse(log.filters as unknown as string)).toMatchObject({
      month: "2026-06",
    });
  });
});

describe.skip("attendance-exceptions report export logging", () => {
  it("records an export log entry with module, type and rowCount", async () => {
    const before = await countLogs("attendance_exceptions");

    const res = await request(app)
      .get("/api/reports/attendance-exceptions")
      .query({ month: "2026-05" })
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status, res.text).toBe(200);
    const rowCount = (res.body as unknown[]).length;

    const after = await countLogs("attendance_exceptions");
    expect(after.length).toBe(before.length + 1);

    const log = newest(after) as typeof after[number];
    expect(log.module).toBe("reports");
    expect(log.rowCount).toBe(rowCount);
  });
});
