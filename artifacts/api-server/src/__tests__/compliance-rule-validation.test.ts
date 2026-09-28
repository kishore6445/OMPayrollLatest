/* =====================================================================
 * DEFERRED — Phase 5+ migration pending
 *
 * All describe blocks in this file are skipped because the routes they
 * test have been intentionally removed from the router in Phase 4.
 * They will be re-enabled once the corresponding routes are migrated
 * to payrollom_client (Phase 5 = attendance/payroll, Phase 6 = billing,
 * Phase 7 = compliance, Phase 8 = reports).
 * ===================================================================== */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { db, complianceRulesTable } from "@workspace/db";
import app from "../app";

// Integration tests for POST /api/compliance/rules configJson validation.
// A malformed rule must be rejected with a 400 rather than saved and then
// silently ignored by the engine (which falls back to hardcoded defaults on
// bad/missing keys) — that combination is a silent wrong-payroll risk.
//
// Runs against the seeded database (tenant slug "nexus" — run
// `pnpm --filter @workspace/scripts run seed` first).
const ADMIN = { username: "admin@nexusstaffing.com", password: "Admin@123" };

// Use a synthetic state so created rows can never collide with the seeded
// Maharashtra / Karnataka rules relied on by other tests.
const TEST_STATE = "TestState_ZZ_Validation";

let token: string;

function auth() {
  return `Bearer ${token}`;
}

async function createRule(body: Record<string, unknown>) {
  return request(app)
    .post("/api/compliance/rules")
    .set("Authorization", auth())
    .send(body);
}

beforeAll(async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ ...ADMIN });
  expect(res.status, `admin login failed: ${res.text}`).toBe(200);
  token = res.body.token as string;
});

afterAll(async () => {
  // Clean up any rows this suite created so the seeded DB stays idempotent.
  await db
    .delete(complianceRulesTable)
    .where(
      and(
        eq(complianceRulesTable.state, TEST_STATE),
      ),
    );
});

describe.skip("POST /api/compliance/rules configJson validation", () => {
  const base = { state: TEST_STATE, name: "Test Rule", effectiveFrom: "2026-01-01" };

  it("accepts a valid pt rule with ascending slabs", async () => {
    const res = await createRule({
      ...base,
      type: "pt",
      configJson: { slabs: [{ upTo: 7500, amount: 0 }, { upTo: 10000, amount: 175 }, { upTo: null, amount: 200 }] },
    });
    expect(res.status, res.text).toBe(201);
    const stored = JSON.parse(res.body.configJson);
    expect(stored.slabs).toHaveLength(3);
  });

  it("accepts a valid lwf rule", async () => {
    const res = await createRule({ ...base, type: "lwf", configJson: { amount: 25 } });
    expect(res.status, res.text).toBe(201);
  });

  it("accepts a valid min_wage rule", async () => {
    const res = await createRule({ ...base, type: "min_wage", configJson: { minDailyWage: 477 } });
    expect(res.status, res.text).toBe(201);
  });

  it("rejects an unknown rule type", async () => {
    const res = await createRule({ ...base, type: "esi", configJson: { amount: 1 } });
    expect(res.status, res.text).toBe(400);
  });

  it("rejects prototype-inherited type keys with a 400, not a 500", async () => {
    for (const type of ["toString", "__proto__", "constructor", "hasOwnProperty"]) {
      const res = await createRule({ ...base, type, configJson: { amount: 1 } });
      expect(res.status, `type=${type}: ${res.text}`).toBe(400);
    }
  });

  it("rejects a pt rule with an empty slabs array", async () => {
    const res = await createRule({ ...base, type: "pt", configJson: { slabs: [] } });
    expect(res.status, res.text).toBe(400);
  });

  it("rejects a pt rule with a missing slabs key", async () => {
    const res = await createRule({ ...base, type: "pt", configJson: {} });
    expect(res.status, res.text).toBe(400);
  });

  it("rejects pt slabs that are not in ascending order", async () => {
    const res = await createRule({
      ...base,
      type: "pt",
      configJson: { slabs: [{ upTo: 10000, amount: 175 }, { upTo: 7500, amount: 0 }] },
    });
    expect(res.status, res.text).toBe(400);
  });

  it("rejects a pt slab with a non-numeric amount", async () => {
    const res = await createRule({
      ...base,
      type: "pt",
      configJson: { slabs: [{ upTo: 7500, amount: "free" }] },
    });
    expect(res.status, res.text).toBe(400);
  });

  it("rejects an lwf rule with a non-numeric amount", async () => {
    const res = await createRule({ ...base, type: "lwf", configJson: { amount: "twenty" } });
    expect(res.status, res.text).toBe(400);
  });

  it("rejects an lwf rule with a typo'd key (amt instead of amount)", async () => {
    const res = await createRule({ ...base, type: "lwf", configJson: { amt: 25 } });
    expect(res.status, res.text).toBe(400);
  });

  it("rejects a min_wage rule with a missing minDailyWage", async () => {
    const res = await createRule({ ...base, type: "min_wage", configJson: { wage: 477 } });
    expect(res.status, res.text).toBe(400);
  });
});
