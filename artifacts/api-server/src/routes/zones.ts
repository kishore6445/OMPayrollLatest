/**
 * zones.ts — Zone master routes
 * Source table: "ZONE_MASTER" in payrollom_client
 */

import { Router, type IRouter } from "express";
import { queryRows, queryOne } from "@workspace/pg-client-db";
import { requireClientAuth, requirePasswordChanged } from "../lib/client-auth.js";

const router: IRouter = Router();

// GET /api/zones?compcode= — list zones
router.get("/zones", requireClientAuth, requirePasswordChanged, async (req, res): Promise<void> => {
  const { compcode, search } = req.query as Record<string, string>;
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (compcode) {
    params.push(compcode);
    conditions.push(`"compcode" = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`"zonename" ILIKE $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = await queryRows<Record<string, unknown>>(
    `SELECT "zonecode","zonename","description","PFRate","esiSUBCode","compcode"
     FROM "ZONE_MASTER" ${where} ORDER BY "zonename"`,
    params
  );

  res.json(rows);
});

// GET /api/zones/:zonecode — single zone detail
router.get("/zones/:zonecode", requireClientAuth, requirePasswordChanged, async (req, res): Promise<void> => {
  const zonecode = parseInt(req.params.zonecode as string, 10);
  if (isNaN(zonecode)) {
    res.status(400).json({ error: "zonecode must be an integer" });
    return;
  }

  const row = await queryOne<Record<string, unknown>>(
    `SELECT "zonecode","zonename","description","PFRate","esiSUBCode","compcode"
     FROM "ZONE_MASTER" WHERE "zonecode" = $1`,
    [zonecode]
  );

  if (!row) {
    res.status(404).json({ error: "Zone not found" });
    return;
  }

  res.json(row);
});

export default router;
