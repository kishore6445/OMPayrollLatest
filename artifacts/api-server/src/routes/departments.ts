/**
 * departments.ts — Department Master routes (DEPTMAST)
 *
 * Table: payrollom_client."DEPTMAST"
 * Columns: deptcode VARCHAR(10), Deptname VARCHAR(50), "desc" VARCHAR(50)
 *
 * Routes:
 *   GET    /api/departments             — paginated list + optional search
 *   GET    /api/departments/:deptcode   — single department detail
 *   POST   /api/departments             — create
 *   PATCH  /api/departments/:deptcode   — update
 *
 * Rules:
 *   - deptcode is the natural PK; uniqueness enforced by the DB + pre-check
 *   - Deptname must be unique case-insensitively
 *   - No hard delete; table has no active/inactive column — do not add one
 *   - Never expose raw DB errors to callers
 *   - Audit-log every write action
 */

import { Router, type IRouter } from "express";
import {
  queryRows, queryOne, queryScalar, execute,
} from "@workspace/pg-client-db";
import {
  requireClientAuth,
  requirePasswordChanged,
  requireClientPermission,
} from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";

const router: IRouter = Router();

const canRead  = [requireClientAuth, requirePasswordChanged, requireClientPermission("departments", "read")];
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("departments", "write")];

// ── Validation ────────────────────────────────────────────────────────────────

function validateDept(
  body: Record<string, unknown>,
  isCreate: boolean,
): string | null {
  const deptcode = body.deptcode != null ? String(body.deptcode).trim() : "";
  const Deptname = body.Deptname != null ? String(body.Deptname).trim() : "";
  const desc     = body.desc     != null ? String(body.desc).trim()     : "";

  if (isCreate) {
    if (!deptcode) return "Department Code is required";
    if (deptcode.length > 10) return "Department Code must be 10 characters or fewer";
  }

  if (isCreate || body.Deptname !== undefined) {
    if (!Deptname) return "Department Name is required";
    if (Deptname.length > 50) return "Department Name must be 50 characters or fewer";
  }

  if (desc && desc.length > 50) return "Description must be 50 characters or fewer";

  return null;
}

// ── GET /api/departments — paginated list ─────────────────────────────────────
router.get("/departments", ...canRead, async (req, res): Promise<void> => {
  const { search, page: pg, pageSize: ps } = req.query as Record<string, string>;
  const pageNum  = Math.max(1, parseInt(pg  ?? "1",  10));
  const pageSz   = Math.min(200, Math.max(1, parseInt(ps ?? "50", 10)));
  const offset   = (pageNum - 1) * pageSz;

  const where  = search ? `WHERE "deptcode" ILIKE $1 OR "Deptname" ILIKE $1` : "";
  const params = search ? [`%${search}%`] : [];

  const [rows, totalRes] = await Promise.all([
    queryRows<Record<string, unknown>>(
      `SELECT "deptcode", "Deptname", "desc"
       FROM "DEPTMAST"
       ${where}
       ORDER BY "Deptname"
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSz, offset]
    ),
    queryScalar<string>(
      `SELECT COUNT(*) FROM "DEPTMAST" ${where}`,
      params
    ),
  ]);

  res.json({
    data:     rows,
    total:    parseInt(totalRes ?? "0", 10),
    page:     pageNum,
    pageSize: pageSz,
  });
});

// ── GET /api/departments/:deptcode — single ───────────────────────────────────
router.get("/departments/:deptcode", ...canRead, async (req, res): Promise<void> => {
  const { deptcode } = req.params;
  const row = await queryOne<Record<string, unknown>>(
    `SELECT "deptcode", "Deptname", "desc" FROM "DEPTMAST" WHERE "deptcode" = $1`,
    [deptcode]
  );
  if (!row) { res.status(404).json({ error: "Department not found" }); return; }
  res.json(row);
});

// ── POST /api/departments — create ────────────────────────────────────────────
router.post("/departments", ...canWrite, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const user = req.clientUser!;

  const fieldErr = validateDept(body, true);
  if (fieldErr) { res.status(400).json({ error: fieldErr }); return; }

  const deptcode = String(body.deptcode).trim();
  const Deptname = String(body.Deptname).trim();
  const desc     = body.desc ? String(body.desc).trim() : null;

  // Duplicate code check
  const codeExists = await queryScalar<string>(
    `SELECT 1 FROM "DEPTMAST" WHERE "deptcode" = $1`, [deptcode]
  );
  if (codeExists) {
    res.status(409).json({ error: `Department code '${deptcode}' already exists` });
    return;
  }

  // Duplicate name check (case-insensitive)
  const nameExists = await queryScalar<string>(
    `SELECT 1 FROM "DEPTMAST" WHERE LOWER("Deptname") = LOWER($1)`, [Deptname]
  );
  if (nameExists) {
    res.status(409).json({ error: `Department name '${Deptname}' already exists` });
    return;
  }

  await execute(
    `INSERT INTO "DEPTMAST" ("deptcode", "Deptname", "desc") VALUES ($1, $2, $3)`,
    [deptcode, Deptname, desc]
  );

  await logClientAction(user.id, "department.create", { deptcode, Deptname });

  const created = await queryOne<Record<string, unknown>>(
    `SELECT "deptcode", "Deptname", "desc" FROM "DEPTMAST" WHERE "deptcode" = $1`,
    [deptcode]
  );
  res.status(201).json(created ?? { deptcode, Deptname, desc });
});

// ── PATCH /api/departments/:deptcode — update ─────────────────────────────────
router.patch("/departments/:deptcode", ...canWrite, async (req, res): Promise<void> => {
  const { deptcode } = req.params;
  const body = req.body as Record<string, unknown>;
  const user = req.clientUser!;

  // Existence check
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT "deptcode", "Deptname", "desc" FROM "DEPTMAST" WHERE "deptcode" = $1`,
    [deptcode]
  );
  if (!existing) { res.status(404).json({ error: "Department not found" }); return; }

  const fieldErr = validateDept(body, false);
  if (fieldErr) { res.status(400).json({ error: fieldErr }); return; }

  // Build SET clause — only allow Deptname and desc to be patched (deptcode is PK)
  const setCols: string[] = [];
  const vals:    unknown[] = [];
  let idx = 1;

  if (body.Deptname !== undefined) {
    const newName = String(body.Deptname).trim();
    // Unique name check — exclude self
    const nameConflict = await queryScalar<string>(
      `SELECT 1 FROM "DEPTMAST" WHERE LOWER("Deptname") = LOWER($1) AND "deptcode" <> $2`,
      [newName, deptcode]
    );
    if (nameConflict) {
      res.status(409).json({ error: `Department name '${newName}' already exists` });
      return;
    }
    setCols.push(`"Deptname" = $${idx}`); vals.push(newName); idx++;
  }

  if (body.desc !== undefined) {
    setCols.push(`"desc" = $${idx}`);
    vals.push(body.desc === "" ? null : String(body.desc).trim());
    idx++;
  }

  if (setCols.length === 0) {
    res.status(400).json({ error: "No updatable fields provided (only Deptname and desc may be changed)" });
    return;
  }

  vals.push(deptcode);
  await execute(
    `UPDATE "DEPTMAST" SET ${setCols.join(", ")} WHERE "deptcode" = $${idx}`,
    vals
  );

  await logClientAction(user.id, "department.update", {
    deptcode,
    fields: Object.keys(body).filter((k) => k !== "deptcode"),
  });

  const updated = await queryOne<Record<string, unknown>>(
    `SELECT "deptcode", "Deptname", "desc" FROM "DEPTMAST" WHERE "deptcode" = $1`,
    [deptcode]
  );
  res.json(updated ?? { deptcode });
});

export default router;
