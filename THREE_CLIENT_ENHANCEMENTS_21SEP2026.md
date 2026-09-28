# Three Client Enhancements - Local Implementation - 21 Sep 2026

This build implements the three client requirements confirmed on 21 Sep 2026.

## 1. Permanent Address PIN Code

- Added `Permanent Address -> PIN Code` to Employee Add/Edit.
- Uses the existing `EMPMAST.permanentpin` field.
- Local/current PIN continues to use `EMPMAST.localpin`.
- DigiLocker permanent-address PIN now maps to `permanentpin` instead of `localpin`.
- Employee Detail now displays the permanent PIN.
- No database migration or new column is required.

## 2. Full Aadhaar in PF / ESI

- Added an enabled Aadhaar field to PF / ESI -> ESI & Statutory IDs.
- The field uses the same `adharcardno` value as Basic Info; there is no duplicate Aadhaar storage.
- HR/Admin users with worker-management permission receive the full stored Aadhaar from the employee-detail API instead of the masked value.
- Other sensitive fields continue to use the existing masking rules.

## 3. Rejoin / Previous Employee Handling

- Rejoin classification no longer treats `INACTIVE` or `SUSPENDED` alone as a previous employee.
- A previous employee is considered a genuine rejoinee when there is separation evidence:
  - an exit/resignation/relieving date (`DOL` and compatible legacy date-field names are checked), or
  - an explicit separated status such as Left / Resigned / Terminated / Separated / Exited.
- When a genuine previous employee is found, stable personal/KYC/bank/statutory details are auto-populated.
- The old employment and assignment fields are not copied into the new joining.
- `oldEmpcode` is populated with the previous Employee Code and `IsRejoin` is set.
- The old Employee Code cannot be reused for the new joining. HR must enter a different new Employee Code.
- The old EMPMAST row remains unchanged for historical records.

## Validation

The modified TypeScript/TSX files were parsed/transpiled using TypeScript 5.8.3 with zero syntax diagnostics:

- `artifacts/api-server/src/routes/workers.ts`
- `artifacts/payroll-nexus/src/pages/workers/form.tsx`
- `artifacts/payroll-nexus/src/pages/workers/detail.tsx`

A full dependency build was not run in this package because `node_modules` is not included.
