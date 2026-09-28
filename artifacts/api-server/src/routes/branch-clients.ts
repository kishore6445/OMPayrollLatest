/**
 * branch-clients.ts — BRANCHCLIENT mapping table routes
 *
 * A BRANCHCLIENT row links one (compid, branchcode) ↔ one clientcode.
 * A Client may be handled by multiple Branches; do not add branchcode to CLIENTMASTER.
 *
 * Routes:
 *   GET    /api/branch-clients              list / filter
 *   POST   /api/branch-clients              create a new mapping
 *   PATCH  /api/branch-clients/:id          toggle is_active (soft-delete / restore)
 */

import { Router, type IRouter } from "express";
import { queryRows, queryOne, queryScalar, execute } from "@workspace/pg-client-db";
import {
  requireClientAuth,
  requirePasswordChanged,
  requireClientPermission,
} from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";

const router: IRouter = Router();

const canRead  = [requireClientAuth, requirePasswordChanged, requireClientPermission("clients", "read")];
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("clients", "write")];

// ── GET /api/branch-clients ───────────────────────────────────────────────────
// ?compid=&branchcode=&clientcode=&active=true|false
router.get("/branch-clients", ...canRead, async (req, res): Promise<void> => {
  const {
    compid: compidStr,
    branchcode: branchStr,
    clientcode: clientStr,
    active,
  } = req.query as Record<string, string>;

  const conds: string[] = [];
  const p: unknown[] = [];

  if (compidStr) {
    p.push(parseInt(compidStr, 10));
    conds.push(`bc.compid = $${p.length}`);
  }
  if (branchStr) {
    p.push(parseInt(branchStr, 10));
    conds.push(`bc.branchcode = $${p.length}`);
  }
  if (clientStr) {
    p.push(parseInt(clientStr, 10));
    conds.push(`bc.clientcode = $${p.length}`);
  }
  if (active === "true")  conds.push("bc.is_active = TRUE");
  if (active === "false") conds.push("bc.is_active = FALSE");

  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const rows = await queryRows<Record<string, unknown>>(
    `SELECT bc.id, bc.compid, bc.branchcode, bc.clientcode, bc.is_active,
            bc.created_at, bc.updated_at,
            b."BranchName",
            c."Clientname",
            comp."comname"
     FROM "BRANCHCLIENT" bc
     LEFT JOIN "BRANCH"      b    ON b."BranchCode" = bc.branchcode AND b."compid" = bc.compid
     LEFT JOIN "CLIENTMASTER" c   ON c."clientcode" = bc.clientcode
     LEFT JOIN "COMPANYMAST"  comp ON comp."compid" = bc.compid
     ${where}
     ORDER BY comp."comname", b."BranchName", c."Clientname"`,
    p,
  );

  res.json(rows);
});

// ── POST /api/branch-clients ──────────────────────────────────────────────────
router.post("/branch-clients", ...canWrite, async (req, res): Promise<void> => {
  const body   = req.body as Record<string, unknown>;
  const userId = req.clientUser!.id;

  const compid     = Number(body.compid);
  const branchcode = Number(body.branchcode);
  const clientcode = Number(body.clientcode);

  if (!compid     || isNaN(compid))     { res.status(400).json({ error: "compid is required (integer)"     }); return; }
  if (!branchcode || isNaN(branchcode)) { res.status(400).json({ error: "branchcode is required (integer)" }); return; }
  if (!clientcode || isNaN(clientcode)) { res.status(400).json({ error: "clientcode is required (integer)" }); return; }

  // Validate parent records
  const [compOk, branchOk, clientOk] = await Promise.all([
    queryScalar(`SELECT 1 FROM "COMPANYMAST" WHERE "compid" = $1`,          [compid]),
    queryScalar(`SELECT 1 FROM "BRANCH" WHERE "BranchCode" = $1 AND "compid" = $2`, [branchcode, compid]),
    queryScalar(`SELECT 1 FROM "CLIENTMASTER" WHERE "clientcode" = $1 AND "compid" = $2`, [clientcode, compid]),
  ]);
  if (!compOk)   { res.status(400).json({ error: "Company not found" });                      return; }
  if (!branchOk) { res.status(400).json({ error: "Branch not found or does not belong to this company" }); return; }
  if (!clientOk) { res.status(400).json({ error: "Client not found or does not belong to this company" }); return; }

  // Check for existing (including inactive)
  const existing = await queryOne<{ id: number; is_active: boolean }>(
    `SELECT id, is_active FROM "BRANCHCLIENT"
     WHERE compid = $1 AND branchcode = $2 AND clientcode = $3`,
    [compid, branchcode, clientcode],
  );

  if (existing) {
    if (existing.is_active) {
      res.status(409).json({ error: "This Branch–Client mapping already exists" });
      return;
    }
    // Re-activate
    await execute(
      `UPDATE "BRANCHCLIENT" SET is_active = TRUE, updated_by = $1, updated_at = NOW() WHERE id = $2`,
      [userId, existing.id],
    );
    await logClientAction(userId, "branch_client.reactivate", { compid, branchcode, clientcode });
    const row = await queryOne(`SELECT * FROM "BRANCHCLIENT" WHERE id = $1`, [existing.id]);
    res.status(200).json(row);
    return;
  }

  await execute(
    `INSERT INTO "BRANCHCLIENT" (compid, branchcode, clientcode, created_by)
     VALUES ($1, $2, $3, $4)`,
    [compid, branchcode, clientcode, userId],
  );

  await logClientAction(userId, "branch_client.create", { compid, branchcode, clientcode });

  const row = await queryOne(
    `SELECT bc.*, b."BranchName", c."Clientname"
     FROM "BRANCHCLIENT" bc
     LEFT JOIN "BRANCH" b ON b."BranchCode" = bc.branchcode
     LEFT JOIN "CLIENTMASTER" c ON c."clientcode" = bc.clientcode
     WHERE bc.compid = $1 AND bc.branchcode = $2 AND bc.clientcode = $3`,
    [compid, branchcode, clientcode],
  );
  res.status(201).json(row);
});

// ── PATCH /api/branch-clients/:id ────────────────────────────────────────────
// Toggles is_active; body: { is_active: boolean }
router.patch("/branch-clients/:id", ...canWrite, async (req, res): Promise<void> => {
  const id     = parseInt(req.params.id as string, 10);
  const body   = req.body as Record<string, unknown>;
  const userId = req.clientUser!.id;

  if (isNaN(id)) { res.status(400).json({ error: "id must be an integer" }); return; }

  const existing = await queryOne<{ id: number; compid: number; branchcode: number; clientcode: number }>(
    `SELECT id, compid, branchcode, clientcode FROM "BRANCHCLIENT" WHERE id = $1`, [id],
  );
  if (!existing) { res.status(404).json({ error: "Mapping not found" }); return; }

  if (body.is_active === undefined) {
    res.status(400).json({ error: "is_active (boolean) is required" });
    return;
  }
  const newActive = Boolean(body.is_active);
  await execute(
    `UPDATE "BRANCHCLIENT" SET is_active = $1, updated_by = $2, updated_at = NOW() WHERE id = $3`,
    [newActive, userId, id],
  );

  await logClientAction(userId, newActive ? "branch_client.activate" : "branch_client.deactivate", {
    id,
    compid: existing.compid,
    branchcode: existing.branchcode,
    clientcode: existing.clientcode,
  });

  const row = await queryOne(`SELECT * FROM "BRANCHCLIENT" WHERE id = $1`, [id]);
  res.json(row);
});

export default router;
