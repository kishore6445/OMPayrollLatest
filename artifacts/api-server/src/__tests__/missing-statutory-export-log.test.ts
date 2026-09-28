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

// Regression test: pulling the missing-statutory report (workers with missing
// PF UAN / ESI numbers) must record an export log entry (exportType
// "missing_statutory"), like the other compliance reports. Runs against a
// seeded database (tenant slug "nexus" — run
// `pnpm --filter @workspace/scripts run seed` first).
let complianceToken: string;
let adminToken: string;
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

});

describe.skip("missing-statutory report export logging", () => {
  it("records an export log entry with module, type and rowCount", async () => {
    const before = await db
      .select()
      .from(exportLogsTable)
      .where(
        and(
          eq(exportLogsTable.exportType, "missing_statutory"),
        ),
      );

    const res = await request(app)
      .get("/api/compliance/missing-statutory")
      .set("Authorization", `Bearer ${complianceToken}`);
    expect(res.status, res.text).toBe(200);
    const rowCount = (res.body as unknown[]).length;

    const after = await db
      .select()
      .from(exportLogsTable)
      .where(
        and(
          eq(exportLogsTable.exportType, "missing_statutory"),
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
  });

  it("shows up in the export-logs view alongside other compliance reports", async () => {
    const res = await request(app)
      .get("/api/export-logs")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status, res.text).toBe(200);
    const types = (res.body as Array<{ exportType: string }>).map(
      (r) => r.exportType,
    );
    expect(types).toContain("missing_statutory");
  });
});
