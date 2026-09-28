import { Router, type IRouter, type Request, type Response } from "express";
import { checkClientDb } from "@workspace/pg-client-db";
import { checkSchema } from "../lib/startup-check.js";

const router: IRouter = Router();

/**
 * GET /api/healthz
 *
 * Returns four status fields:
 *   status   — always "ok" if this handler executes
 *   server   — always "ok" if this handler executes
 *   clientDb — "ok" if the pool can reach payrollom_client, "error" otherwise
 *              (always a live probe — reflects current connectivity)
 *   schema   — "ok" | "degraded" | "error" (served from startup cache for speed)
 *   tables   — column counts per required table (from startup cache)
 *
 * Does NOT expose connection strings, passwords, or internal paths.
 * Never returns a 5xx — callers interpret clientDb/schema fields instead.
 */
router.get("/healthz", async (req: Request, res: Response): Promise<void> => {
  // 1. Live clientDb probe — always fresh so monitors see real connectivity
  let clientDb: "ok" | "error" = "ok";
  try {
    await checkClientDb();
  } catch {
    clientDb = "error";
  }

  // 2. Schema report — use cached startup result for speed (avoid re-scanning
  //    211 tables on every health poll), fall back to a fresh check if needed.
  const cached = (req.app as any).__schemaReport as
    | { clientDb: string; schema: string; tables: Record<string, number> }
    | undefined;

  if (cached) {
    res.json({
      status: "ok",
      server: "ok",
      clientDb,
      schema: cached.schema,
      tables: cached.tables,
    });
    return;
  }

  // Fallback: no startup cache (e.g. unit-test env — run a fresh schema check)
  try {
    const report = await checkSchema();
    res.json({
      status: "ok",
      server: "ok",
      clientDb,
      schema: report.schema,
      tables: report.tables,
    });
  } catch {
    res.json({
      status: "ok",
      server: "ok",
      clientDb,
      schema: "error",
      tables: {},
    });
  }
});

export default router;
