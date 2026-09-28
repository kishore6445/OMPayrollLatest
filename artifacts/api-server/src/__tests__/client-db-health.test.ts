/**
 * client-db-health.test.ts
 *
 * Verifies that checkClientDb() works correctly and does not leak pool
 * connections on repeated invocations — including when the underlying
 * query throws (simulated via a pool mock).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import app from "../app";

// ── Integration: real DB ──────────────────────────────────────────────────────

describe("checkClientDb() — integration against live payrollom_client", () => {
  it("resolves without error on a reachable database", async () => {
    const { checkClientDb } = await import("@workspace/pg-client-db");
    await expect(checkClientDb()).resolves.toBeUndefined();
  });

  it("can be called repeatedly without exhausting the pool", async () => {
    const { checkClientDb } = await import("@workspace/pg-client-db");
    // 10 rapid sequential calls should all succeed and release connections.
    for (let i = 0; i < 10; i++) {
      await expect(checkClientDb()).resolves.toBeUndefined();
    }
  });

  it("can be called concurrently without exhausting the pool", async () => {
    const { checkClientDb } = await import("@workspace/pg-client-db");
    // 5 concurrent calls — pool max is 20, so this must not block.
    await expect(
      Promise.all(Array.from({ length: 5 }, () => checkClientDb()))
    ).resolves.toBeDefined();
  });
});

// ── Unit: pool mock ───────────────────────────────────────────────────────────

describe("checkClientDb() — unit with mocked pool", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects and does not leave dangling clients when pool.query throws", async () => {
    const pgClientDb = await import("@workspace/pg-client-db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const spy = vi.spyOn(pgClientDb.pool as any, "query").mockRejectedValueOnce(
      new Error("simulated connection failure")
    );
    await expect(pgClientDb.checkClientDb()).rejects.toThrow("simulated connection failure");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── GET /api/healthz includes clientDb ────────────────────────────────────────

describe("GET /api/healthz — clientDb field", () => {
  it("returns status ok and clientDb ok when the DB is reachable", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", clientDb: "ok" });
  });

  it("returns clientDb error when checkClientDb throws", async () => {
    const pgClientDb = await import("@workspace/pg-client-db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(pgClientDb.pool as any, "query").mockRejectedValueOnce(
      new Error("simulated unreachable")
    );
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200); // healthz never returns 5xx
    expect(res.body).toMatchObject({ status: "ok", clientDb: "error" });
    vi.restoreAllMocks();
  });
});
