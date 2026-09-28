/** Designation Master CRUD over legacy DESIGNATIONMASTER. */
import { Router, type IRouter } from "express";
import { queryRows, queryOne, queryScalar, execute } from "@workspace/pg-client-db";
import { requireClientAuth, requirePasswordChanged, requireClientPermission } from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";

const router: IRouter = Router();
const canRead = [requireClientAuth, requirePasswordChanged, requireClientPermission("departments", "read")];
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("departments", "write")];

function validate(body: Record<string, unknown>, isCreate: boolean): string | null {
  const codeRaw = body.DESICODE == null ? "" : String(body.DESICODE).trim();
  const name = body.DESINAME == null ? "" : String(body.DESINAME).trim();
  const display = body.DispDesig == null ? "" : String(body.DispDesig).trim();
  const dutyRaw = body.DUTYHRS == null || body.DUTYHRS === "" ? "" : String(body.DUTYHRS).trim();
  const desc = body.DESC == null ? "" : String(body.DESC).trim();

  if (isCreate) {
    if (!codeRaw) return "Designation Code is required";
    if (!/^\d+$/.test(codeRaw) || Number(codeRaw) <= 0) return "Designation Code must be a positive number";
  }
  if (isCreate || body.DESINAME !== undefined) {
    if (!name) return "Designation Name is required";
    if (name.length > 50) return "Designation Name must be 50 characters or fewer";
  }
  if (display.length > 50) return "Display Designation must be 50 characters or fewer";
  if (desc.length > 50) return "Description must be 50 characters or fewer";
  if (dutyRaw) {
    const n = Number(dutyRaw);
    if (!Number.isFinite(n) || n < 0 || n > 24) return "Duty Hours must be between 0 and 24";
  }
  return null;
}

router.get("/designations", ...canRead, async (req, res): Promise<void> => {
  const { search, page: pg, pageSize: ps } = req.query as Record<string, string>;
  const page = Math.max(1, parseInt(pg ?? "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(ps ?? "50", 10)));
  const offset = (page - 1) * pageSize;
  const where = search ? `WHERE CAST("DESICODE" AS TEXT) ILIKE $1 OR "DESINAME" ILIKE $1 OR "DispDesig" ILIKE $1` : "";
  const params = search ? [`%${search}%`] : [];
  const [rows, total] = await Promise.all([
    queryRows<Record<string, unknown>>(
      `SELECT "DESICODE","DESINAME","DispDesig","DUTYHRS","DESC", COALESCE("is_active", TRUE) AS "is_active" FROM "DESIGNATIONMASTER" ${where} ORDER BY "DESINAME", "DESICODE" LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    ),
    queryScalar<string>(`SELECT COUNT(*) FROM "DESIGNATIONMASTER" ${where}`, params),
  ]);
  res.json({ data: rows, total: parseInt(total ?? "0", 10), page, pageSize });
});

router.get("/designations/:code", ...canRead, async (req, res): Promise<void> => {
  const code = Number(req.params.code);
  if (!Number.isFinite(code)) { res.status(400).json({ error: "Invalid designation code" }); return; }
  const row = await queryOne<Record<string, unknown>>(
    `SELECT "DESICODE","DESINAME","DispDesig","DUTYHRS","DESC", COALESCE("is_active", TRUE) AS "is_active" FROM "DESIGNATIONMASTER" WHERE "DESICODE" = $1`, [code]
  );
  if (!row) { res.status(404).json({ error: "Designation not found" }); return; }
  res.json(row);
});

router.post("/designations", ...canWrite, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const err = validate(body, true);
  if (err) { res.status(400).json({ error: err }); return; }

  const DESICODE = Number(String(body.DESICODE).trim());
  const DESINAME = String(body.DESINAME).trim();
  const DispDesig = body.DispDesig ? String(body.DispDesig).trim() : DESINAME;
  const DUTYHRS = body.DUTYHRS === "" || body.DUTYHRS == null ? null : Number(body.DUTYHRS);
  const DESC = body.DESC ? String(body.DESC).trim() : null;

  if (await queryScalar<string>(`SELECT 1 FROM "DESIGNATIONMASTER" WHERE "DESICODE" = $1`, [DESICODE])) {
    res.status(409).json({ error: `Designation code '${DESICODE}' already exists` }); return;
  }
  if (await queryScalar<string>(`SELECT 1 FROM "DESIGNATIONMASTER" WHERE LOWER("DESINAME") = LOWER($1)`, [DESINAME])) {
    res.status(409).json({ error: `Designation name '${DESINAME}' already exists` }); return;
  }

  await execute(
    `INSERT INTO "DESIGNATIONMASTER" ("DESICODE","DESINAME","DispDesig","DUTYHRS","DESC","is_active") VALUES ($1,$2,$3,$4,$5,TRUE)`,
    [DESICODE, DESINAME, DispDesig, DUTYHRS, DESC]
  );
  await logClientAction(req.clientUser!.id, "designation.create", { DESICODE, DESINAME });
  const created = await queryOne<Record<string, unknown>>(
    `SELECT "DESICODE","DESINAME","DispDesig","DUTYHRS","DESC", COALESCE("is_active", TRUE) AS "is_active" FROM "DESIGNATIONMASTER" WHERE "DESICODE"=$1`, [DESICODE]
  );
  res.status(201).json(created);
});

router.patch("/designations/:code", ...canWrite, async (req, res): Promise<void> => {
  const code = Number(req.params.code);
  if (!Number.isFinite(code)) { res.status(400).json({ error: "Invalid designation code" }); return; }
  const existing = await queryOne<Record<string, unknown>>(`SELECT "DESICODE" FROM "DESIGNATIONMASTER" WHERE "DESICODE"=$1`, [code]);
  if (!existing) { res.status(404).json({ error: "Designation not found" }); return; }

  const body = req.body as Record<string, unknown>;
  const err = validate(body, false);
  if (err) { res.status(400).json({ error: err }); return; }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.DESINAME !== undefined) {
    const name = String(body.DESINAME).trim();
    if (await queryScalar<string>(`SELECT 1 FROM "DESIGNATIONMASTER" WHERE LOWER("DESINAME")=LOWER($1) AND "DESICODE"<>$2`, [name, code])) {
      res.status(409).json({ error: `Designation name '${name}' already exists` }); return;
    }
    vals.push(name); sets.push(`"DESINAME"=$${vals.length}`);
  }
  if (body.DispDesig !== undefined) { vals.push(body.DispDesig === "" ? null : String(body.DispDesig).trim()); sets.push(`"DispDesig"=$${vals.length}`); }
  if (body.DUTYHRS !== undefined) { vals.push(body.DUTYHRS === "" || body.DUTYHRS == null ? null : Number(body.DUTYHRS)); sets.push(`"DUTYHRS"=$${vals.length}`); }
  if (body.DESC !== undefined) { vals.push(body.DESC === "" ? null : String(body.DESC).trim()); sets.push(`"DESC"=$${vals.length}`); }
  if (!sets.length) { res.status(400).json({ error: "No updatable fields provided" }); return; }
  vals.push(code);
  await execute(`UPDATE "DESIGNATIONMASTER" SET ${sets.join(",")} WHERE "DESICODE"=$${vals.length}`, vals);
  await logClientAction(req.clientUser!.id, "designation.update", { DESICODE: code, fields: Object.keys(body) });
  res.json(await queryOne<Record<string, unknown>>(
    `SELECT "DESICODE","DESINAME","DispDesig","DUTYHRS","DESC", COALESCE("is_active", TRUE) AS "is_active" FROM "DESIGNATIONMASTER" WHERE "DESICODE"=$1`, [code]
  ));
});

router.post("/designations/:code/activate", ...canWrite, async (req, res): Promise<void> => {
  const code = Number(req.params.code);
  if (!Number.isFinite(code)) { res.status(400).json({ error: "Invalid designation code" }); return; }
  const existing = await queryOne<{ DESICODE: number }>(`SELECT "DESICODE" FROM "DESIGNATIONMASTER" WHERE "DESICODE"=$1`, [code]);
  if (!existing) { res.status(404).json({ error: "Designation not found" }); return; }
  await execute(`UPDATE "DESIGNATIONMASTER" SET "is_active"=TRUE WHERE "DESICODE"=$1`, [code]);
  await logClientAction(req.clientUser!.id, "designation.activate", { DESICODE: code });
  res.json({ success: true, DESICODE: code, is_active: true });
});

router.post("/designations/:code/deactivate", ...canWrite, async (req, res): Promise<void> => {
  const code = Number(req.params.code);
  if (!Number.isFinite(code)) { res.status(400).json({ error: "Invalid designation code" }); return; }
  const existing = await queryOne<{ DESICODE: number }>(`SELECT "DESICODE" FROM "DESIGNATIONMASTER" WHERE "DESICODE"=$1`, [code]);
  if (!existing) { res.status(404).json({ error: "Designation not found" }); return; }
  await execute(`UPDATE "DESIGNATIONMASTER" SET "is_active"=FALSE WHERE "DESICODE"=$1`, [code]);
  await logClientAction(req.clientUser!.id, "designation.deactivate", { DESICODE: code });
  res.json({ success: true, DESICODE: code, is_active: false });
});

export default router;
