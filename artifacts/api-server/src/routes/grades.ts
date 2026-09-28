/** Grade Master CRUD over legacy GRADEMASTER. */
import { Router, type IRouter } from "express";
import { queryRows, queryOne, queryScalar, execute } from "@workspace/pg-client-db";
import { requireClientAuth, requirePasswordChanged, requireClientPermission } from "../lib/client-auth.js";
import { logClientAction } from "../lib/client-audit.js";

const router: IRouter = Router();
const canRead = [requireClientAuth, requirePasswordChanged, requireClientPermission("departments", "read")];
const canWrite = [requireClientAuth, requirePasswordChanged, requireClientPermission("departments", "write")];

function validate(body: Record<string, unknown>, isCreate: boolean): string | null {
  const codeRaw = body.GradeCode == null ? "" : String(body.GradeCode).trim();
  const name = body.GradeName == null ? "" : String(body.GradeName).trim();
  const rateRaw = body.HraRate == null || body.HraRate === "" ? "" : String(body.HraRate).trim();
  const remark = body.GradeRemark == null ? "" : String(body.GradeRemark).trim();
  if (isCreate) {
    if (!codeRaw) return "Grade Code is required";
    if (!/^\d+$/.test(codeRaw) || Number(codeRaw) <= 0) return "Grade Code must be a positive number";
  }
  if (isCreate || body.GradeName !== undefined) {
    if (!name) return "Grade Name is required";
    if (name.length > 100) return "Grade Name must be 100 characters or fewer";
  }
  if (rateRaw) {
    const n = Number(rateRaw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return "HRA Rate must be between 0 and 100";
  }
  if (remark.length > 255) return "Grade Remark must be 255 characters or fewer";
  return null;
}

router.get("/grades", ...canRead, async (req, res): Promise<void> => {
  const { search, page: pg, pageSize: ps } = req.query as Record<string, string>;
  const page = Math.max(1, parseInt(pg ?? "1", 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(ps ?? "50", 10)));
  const offset = (page - 1) * pageSize;
  const where = search ? `WHERE CAST("GradeCode" AS TEXT) ILIKE $1 OR "GradeName" ILIKE $1` : "";
  const params = search ? [`%${search}%`] : [];
  const [rows, total] = await Promise.all([
    queryRows<Record<string, unknown>>(
      `SELECT "GradeCode","GradeName","HraRate","GradeRemark" FROM "GRADEMASTER" ${where} ORDER BY "GradeName" LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    ),
    queryScalar<string>(`SELECT COUNT(*) FROM "GRADEMASTER" ${where}`, params),
  ]);
  res.json({ data: rows, total: parseInt(total ?? "0", 10), page, pageSize });
});

router.get("/grades/:code", ...canRead, async (req, res): Promise<void> => {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT "GradeCode","GradeName","HraRate","GradeRemark" FROM "GRADEMASTER" WHERE "GradeCode" = $1`,
    [Number(req.params.code)]
  );
  if (!row) { res.status(404).json({ error: "Grade not found" }); return; }
  res.json(row);
});

router.post("/grades", ...canWrite, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const err = validate(body, true);
  if (err) { res.status(400).json({ error: err }); return; }
  const GradeCode = Number(String(body.GradeCode).trim());
  const GradeName = String(body.GradeName).trim();
  const HraRate = body.HraRate === "" || body.HraRate == null ? null : Number(body.HraRate);
  const GradeRemark = body.GradeRemark ? String(body.GradeRemark).trim() : null;
  if (await queryScalar<string>(`SELECT 1 FROM "GRADEMASTER" WHERE "GradeCode" = $1`, [GradeCode])) {
    res.status(409).json({ error: `Grade code '${GradeCode}' already exists` }); return;
  }
  if (await queryScalar<string>(`SELECT 1 FROM "GRADEMASTER" WHERE LOWER("GradeName") = LOWER($1)`, [GradeName])) {
    res.status(409).json({ error: `Grade name '${GradeName}' already exists` }); return;
  }
  await execute(`INSERT INTO "GRADEMASTER" ("GradeCode","GradeName","HraRate","GradeRemark") VALUES ($1,$2,$3,$4)`, [GradeCode, GradeName, HraRate, GradeRemark]);
  await logClientAction(req.clientUser!.id, "grade.create", { GradeCode, GradeName });
  const created = await queryOne<Record<string, unknown>>(`SELECT "GradeCode","GradeName","HraRate","GradeRemark" FROM "GRADEMASTER" WHERE "GradeCode"=$1`, [GradeCode]);
  res.status(201).json(created);
});

router.patch("/grades/:code", ...canWrite, async (req, res): Promise<void> => {
  const code = Number(req.params.code);
  const body = req.body as Record<string, unknown>;
  const existing = await queryOne<Record<string, unknown>>(`SELECT "GradeCode" FROM "GRADEMASTER" WHERE "GradeCode"=$1`, [code]);
  if (!existing) { res.status(404).json({ error: "Grade not found" }); return; }
  const err = validate(body, false);
  if (err) { res.status(400).json({ error: err }); return; }
  const sets: string[] = []; const vals: unknown[] = [];
  if (body.GradeName !== undefined) {
    const name = String(body.GradeName).trim();
    if (await queryScalar<string>(`SELECT 1 FROM "GRADEMASTER" WHERE LOWER("GradeName")=LOWER($1) AND "GradeCode"<>$2`, [name, code])) {
      res.status(409).json({ error: `Grade name '${name}' already exists` }); return;
    }
    vals.push(name); sets.push(`"GradeName"=$${vals.length}`);
  }
  if (body.HraRate !== undefined) { vals.push(body.HraRate === "" || body.HraRate == null ? null : Number(body.HraRate)); sets.push(`"HraRate"=$${vals.length}`); }
  if (body.GradeRemark !== undefined) { vals.push(body.GradeRemark === "" ? null : String(body.GradeRemark).trim()); sets.push(`"GradeRemark"=$${vals.length}`); }
  if (!sets.length) { res.status(400).json({ error: "No updatable fields provided" }); return; }
  vals.push(code);
  await execute(`UPDATE "GRADEMASTER" SET ${sets.join(",")} WHERE "GradeCode"=$${vals.length}`, vals);
  await logClientAction(req.clientUser!.id, "grade.update", { GradeCode: code, fields: Object.keys(body) });
  res.json(await queryOne<Record<string, unknown>>(`SELECT "GradeCode","GradeName","HraRate","GradeRemark" FROM "GRADEMASTER" WHERE "GradeCode"=$1`, [code]));
});

export default router;
