/** Category Master CRUD over the real legacy categorymaster schema.
 *
 * Legacy facts confirmed in payrollom_client on 19-Sep-2026:
 *   catcode, catname, catdescription, compid are varchar(50), nullable
 *   no primary key / unique constraint / foreign key
 *   catcode is NOT globally unique (and can repeat within a company)
 *
 * Therefore we treat compid as text and use the original
 * (compid, catcode, catname) combination to identify an existing row for edits.
 */
import { Router, type IRouter } from "express";
import { queryRows, queryOne, queryScalar, execute } from "@workspace/pg-client-db";
import { requireClientAuth, requirePasswordChanged, requireClientPermission } from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";

const router: IRouter = Router();
const canRead = [requireClientAuth, requirePasswordChanged, requireClientPermission("departments", "read")];
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("departments", "write")];

function validate(body: Record<string, unknown>, isCreate: boolean): string | null {
  const code = body.catcode == null ? "" : String(body.catcode).trim();
  const name = body.catname == null ? "" : String(body.catname).trim();
  const desc = body.catdescription == null ? "" : String(body.catdescription).trim();
  const compid = body.compid == null ? "" : String(body.compid).trim();
  if (isCreate) {
    if (!compid) return "Company / Entity is required";
    if (!code) return "Category Code is required";
    if (code.length > 50) return "Category Code must be 50 characters or fewer";
  }
  if (isCreate || body.catname !== undefined) {
    if (!name) return "Category Name is required";
    if (name.length > 50) return "Category Name must be 50 characters or fewer";
  }
  if (desc.length > 50) return "Description must be 50 characters or fewer";
  return null;
}

router.get("/categories", ...canRead, async (req, res): Promise<void> => {
  const { search, compid, page: pg, pageSize: ps } = req.query as Record<string, string>;
  const page = Math.max(1, parseInt(pg ?? "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(ps ?? "50", 10)));
  const offset = (page - 1) * pageSize;
  const filters: string[] = [];
  const params: unknown[] = [];
  if (compid) { params.push(String(compid)); filters.push(`c."compid"=$${params.length}::text`); }
  if (search) { params.push(`%${search}%`); filters.push(`(c."catcode" ILIKE $${params.length} OR c."catname" ILIKE $${params.length})`); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const [rows, total] = await Promise.all([
    queryRows<Record<string, unknown>>(
      `SELECT c."catcode",c."catname",c."catdescription",c."compid",co."comname"
       FROM "categorymaster" c
       LEFT JOIN "COMPANYMAST" co ON co."compid"::text=c."compid"
       ${where}
       ORDER BY co."comname",c."catname",c."catcode"
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    ),
    queryScalar<string>(`SELECT COUNT(*) FROM "categorymaster" c ${where}`, params),
  ]);
  res.json({ data: rows, total: parseInt(total ?? "0", 10), page, pageSize });
});

router.get("/categories/:compid/:code", ...canRead, async (req, res): Promise<void> => {
  const originalName = req.query.name == null ? "" : String(req.query.name);
  const params: unknown[] = [String(req.params.compid), req.params.code];
  let nameFilter = "";
  if (originalName) { params.push(originalName); nameFilter = ` AND c."catname"=$3`; }
  const row = await queryOne<Record<string, unknown>>(
    `SELECT c."catcode",c."catname",c."catdescription",c."compid",co."comname"
     FROM "categorymaster" c
     LEFT JOIN "COMPANYMAST" co ON co."compid"::text=c."compid"
     WHERE c."compid"=$1::text AND c."catcode"=$2${nameFilter}
     ORDER BY c."catname" LIMIT 1`,
    params
  );
  if (!row) { res.status(404).json({ error: "Category not found" }); return; }
  res.json(row);
});

router.post("/categories", ...canWrite, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const err = validate(body, true);
  if (err) { res.status(400).json({ error: err }); return; }
  const compid = String(body.compid).trim();
  const catcode = String(body.catcode).trim();
  const catname = String(body.catname).trim();
  const catdescription = body.catdescription ? String(body.catdescription).trim() : null;

  if (!await queryScalar<string>(`SELECT 1 FROM "COMPANYMAST" WHERE "compid"::text=$1`, [compid])) {
    res.status(400).json({ error: "Selected Company / Entity does not exist" }); return;
  }
  // The legacy table permits repeated codes and repeated names. Only block a true exact duplicate.
  if (await queryScalar<string>(
    `SELECT 1 FROM "categorymaster" WHERE "compid"=$1::text AND "catcode"=$2 AND LOWER(COALESCE("catname",''))=LOWER($3) LIMIT 1`,
    [compid, catcode, catname]
  )) {
    res.status(409).json({ error: `The same category (${catcode} / ${catname}) already exists for this company` }); return;
  }

  await execute(
    `INSERT INTO "categorymaster" ("catcode","catname","catdescription","compid") VALUES ($1,$2,$3,$4)`,
    [catcode, catname, catdescription, compid]
  );
  await logClientAction(req.clientUser!.id, "category.create", { compid, catcode, catname });
  res.status(201).json(await queryOne<Record<string, unknown>>(
    `SELECT "catcode","catname","catdescription","compid" FROM "categorymaster"
     WHERE "compid"=$1::text AND "catcode"=$2 AND "catname"=$3 ORDER BY ctid DESC LIMIT 1`,
    [compid, catcode, catname]
  ));
});

router.patch("/categories/:compid/:code", ...canWrite, async (req, res): Promise<void> => {
  const compid = String(req.params.compid);
  const code = req.params.code;
  const originalName = req.query.name == null ? "" : String(req.query.name);
  const body = req.body as Record<string, unknown>;
  if (!originalName) { res.status(400).json({ error: "Original category name is required to edit this legacy record" }); return; }
  if (!await queryOne(
    `SELECT 1 FROM "categorymaster" WHERE "compid"=$1::text AND "catcode"=$2 AND "catname"=$3 LIMIT 1`,
    [compid, code, originalName]
  )) { res.status(404).json({ error: "Category not found" }); return; }

  const err = validate(body, false);
  if (err) { res.status(400).json({ error: err }); return; }
  const name = body.catname === undefined ? originalName : String(body.catname).trim();
  const desc = body.catdescription === undefined ? undefined : (body.catdescription === "" ? null : String(body.catdescription).trim());

  if (await queryScalar<string>(
    `SELECT 1 FROM "categorymaster"
     WHERE "compid"=$1::text AND "catcode"=$2 AND LOWER(COALESCE("catname",''))=LOWER($3)
       AND NOT ("catname"=$4) LIMIT 1`,
    [compid, code, name, originalName]
  )) { res.status(409).json({ error: `The same category (${code} / ${name}) already exists for this company` }); return; }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.catname !== undefined) { vals.push(name); sets.push(`"catname"=$${vals.length}`); }
  if (body.catdescription !== undefined) { vals.push(desc); sets.push(`"catdescription"=$${vals.length}`); }
  if (!sets.length) { res.status(400).json({ error: "No updatable fields provided" }); return; }
  vals.push(compid); const cidx = vals.length;
  vals.push(code); const kidx = vals.length;
  vals.push(originalName); const nidx = vals.length;
  await execute(
    `UPDATE "categorymaster" SET ${sets.join(",")}
     WHERE ctid IN (
       SELECT ctid FROM "categorymaster" WHERE "compid"=$${cidx}::text AND "catcode"=$${kidx} AND "catname"=$${nidx} LIMIT 1
     )`,
    vals
  );
  await logClientAction(req.clientUser!.id, "category.update", { compid, catcode: code, originalName, fields: Object.keys(body) });
  res.json(await queryOne<Record<string, unknown>>(
    `SELECT "catcode","catname","catdescription","compid" FROM "categorymaster"
     WHERE "compid"=$1::text AND "catcode"=$2 AND "catname"=$3 LIMIT 1`,
    [compid, code, name]
  ));
});

export default router;
