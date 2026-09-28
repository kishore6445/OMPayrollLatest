# Client Master → Employee Salary Mapping (Corrected Local Implementation)

**Date:** 18 Sep 2026  
**Scope:** Local source only. No database schema changes, migrations, seeds, or deployment.

## Requirement implemented

Employee Master salary fields must follow the salary heads already configured for the selected Client in the existing Client Master database record.

In this application, the business **Client Master is stored in `UNITMASTER`**. The uploaded Client Master Excel was used only to confirm the legacy field layout and sample data. The running application does **not** read the Excel file.

## Runtime data flow

1. HR selects Company → Client in Employee Master.
2. The frontend requests `/api/scoped/units/:unitcode/salary-components`.
3. The API performs `SELECT * FROM "UNITMASTER" WHERE "unitcode" = $1` against the live client database.
4. Client Master salary head slot `N` is mapped directly to employee salary slot `EMPMAST.SalHeadN`.
5. The display label is whatever Client Master contains for that slot.
6. Employee-specific amounts are saved through the existing Worker API into the existing `EMPMAST.SalHead1..SalHead17` columns.

### Example

If the selected Client Master row contains:

- `SalHead1 = BASIC`
- `SalHead2 = HRA`
- `SalHead3 = CCA`

Employee Master renders BASIC, HRA and CCA and stores the entered values in:

- `EMPMAST.SalHead1`
- `EMPMAST.SalHead2`
- `EMPMAST.SalHead3`

There is **no label inference** such as `BASIC → EMPMAST.basic` or `HRA → EMPMAST.hra`.

## Legacy column-name compatibility

The code accepts both `uSalHeadN` and `SalHeadN` as Client Master source column names because historical schemas/exports use both naming conventions. The actual source column is resolved from the live `UNITMASTER` row at runtime.

## Behaviour on client change

- The Salary tab refreshes immediately for the newly selected Client.
- If salary values already exist, HR receives the existing confirmation warning before switching.
- Only obsolete `EMPMAST.SalHeadN` slots are cleared after a confirmed client change.
- Legacy named salary fields on an existing employee are not silently destroyed.
- Opening an employee in Edit mode does not clear values.

## No configuration fallback / no guessing

If the selected Client has no salary heads configured in Client Master, the Salary tab says that no salary heads are configured. It does not fabricate a default structure and does not guess from labels.

## Files changed

- `artifacts/api-server/src/routes/scope.ts`
- `artifacts/payroll-nexus/src/pages/workers/form.tsx`

## Database safety

- No new table.
- No ALTER TABLE.
- No migration.
- No seed.
- No Excel dependency at runtime.
- No write to `UNITMASTER` from this feature.
- Existing `EMPMAST` salary slot columns are reused.

## Local verification

A TypeScript parser pass was run on both modified files. The source ZIP intentionally does not include installed workspace dependencies, so a full dependency-aware build cannot be performed in this isolated local package.
