# PayrollOM — Implementation Status
**Release:** Branch–Client Mapping + HR Manager Organisational Scope  
**Date:** 06 August 2026  
**Database migration:** 003

---

## Feature Completion

### ✅ Database Migration 003

| Table | Status | Notes |
|-------|--------|-------|
| `BRANCHCLIENT` | Complete | Many-to-many: Client ↔ Branch; unique on `(compid, branchcode, clientcode)` |
| `USERBRANCH` | Complete | HR Manager ↔ Branch; unique on `(usercode, compid, branchcode)` |
| `USERCLIENT` | Complete | HR Manager ↔ Client-within-Branch; unique on `(usercode, compid, branchcode, clientcode)` |

Migration file: `migrations/003_branch_client_scope.sql`  
Rollback file: `migrations/003_rollback.sql`

---

### ✅ Backend — Branch–Client Mapping

| File | Status | What it does |
|------|--------|-------------|
| `artifacts/api-server/src/routes/branch-clients.ts` | ✅ Complete | `GET/POST/PATCH /api/branch-clients` — list, create, reactivate, toggle mappings |
| `artifacts/api-server/src/routes/clients.ts` | ✅ Updated | POST/PATCH accept `branchcodes[]`; GET `/:clientcode` returns `branches` array |

---

### ✅ Backend — HR Manager Scope

| File | Status | What it does |
|------|--------|-------------|
| `artifacts/api-server/src/lib/scope-guard.ts` | ✅ Complete | `loadUserScope()`, `isInScope()`, `assertWorkerScope()`, `buildWorkerScopeFilter()` |
| `artifacts/api-server/src/routes/scope.ts` | ✅ Complete | `GET/PUT /api/users/:id/scope`; `GET /api/scoped/companies\|branches\|clients\|units` |
| `artifacts/api-server/src/routes/workers.ts` | ✅ Updated | Scope filter on GET list/counts; scope assert on GET detail, POST create, PATCH edit |
| `artifacts/api-server/src/routes/index.ts` | ✅ Updated | Mounts `branchClientsRouter` and `scopeRouter` |

---

### ✅ Frontend — Client Branch Assignment

| File | Status | What it does |
|------|--------|-------------|
| `artifacts/payroll-nexus/src/pages/clients/form.tsx` | ✅ Complete | Branch multi-select after company selection; existing assignments loaded in edit mode; `branchcodes[]` sent on save |

---

### ✅ Frontend — HR Manager Scope Assignment

| File | Status | What it does |
|------|--------|-------------|
| `artifacts/payroll-nexus/src/pages/admin/hr-scope-section.tsx` | ✅ Complete | Three-level scope tree: Company → Branch → Client (from BRANCHCLIENT) |
| `artifacts/payroll-nexus/src/pages/admin/users.tsx` | ✅ Updated | "Access Scope" section in Add/Edit dialogs when role = HR Manager; loads existing scope; saves via `PUT /api/users/:id/scope` |

---

### ✅ Frontend — Scoped Employee Dropdowns

| File | Status | What it does |
|------|--------|-------------|
| `artifacts/payroll-nexus/src/pages/workers/form.tsx` | ✅ Updated | All four dropdowns use `/api/scoped/*`; auto-selects when only one option (HR Manager UX) |

---

## Verification Results (06 August 2026)

| Check | Result |
|-------|--------|
| API typecheck (`tsc --noEmit`) | ✅ 0 errors |
| Frontend typecheck (`tsc --noEmit`) | ✅ 0 errors |
| API test suite (Vitest) | ✅ 63 passed, 72 skipped, 0 failed |
| API production build | ✅ Built successfully |
| New routes mounted | ✅ All 5 new routes respond 401 (not 404) when unauthenticated |
| Existing tables unmodified | ✅ Migration is strictly additive |

---

## RBAC Role Behaviour

| Role | Scope enforcement |
|------|------------------|
| **Admin** | Unrestricted — sees all companies, branches, clients, employees |
| **Payroll Manager** | Unrestricted — sees all data |
| **HR Manager** | Scoped — sees only employees whose `compid` + `branchcode` + `clientcode` are in USERBRANCH / USERCLIENT |
| **Finance Executive** | Read access to payroll/invoice data (no scope restriction) |
| **Finance Manager** | Same as Finance Executive plus write access |
| **Compliance Officer** | Read access to workers and compliance data |
| **Viewer** | Read-only access to most data |

Out-of-scope access by HR Manager → **HTTP 403 Forbidden**

---

## Migration Safety Guarantees

- Uses `CREATE TABLE IF NOT EXISTS` — idempotent.
- No `ALTER TABLE` on existing tables — CLIENTMASTER, BRANCH, UNITMASTER, EMPMAST, COMPANYMAST are untouched.
- No data is deleted or modified.
- Unique constraints prevent duplicate scope entries.
- Rollback (`003_rollback.sql`) only drops the three new tables.

---

---

## ✅ Aadhaar Secure QR Autofill (06 August 2026)

### New Files

| File | What it does |
|------|-------------|
| `artifacts/api-server/src/lib/aadhaar-service.ts` | UIDAI Secure QR V1/V2 decode + RSA-SHA256 signature verification via `node-forge`. Auto-skips in dev (no cert needed), throws at startup in production without `UIDAI_QR_CERT`. |
| `artifacts/api-server/src/lib/aadhaar-qr-reader.ts` | Decodes QR from JPEG/PNG (sharp + jsqr) or PDF (JPEG-stream extraction + jsqr). |
| `artifacts/api-server/src/routes/aadhaar.ts` | `POST /aadhaar/verify-qr` + `POST /aadhaar/extract-upload`. Multer 5 MB limit, consent logging, `workers:write` RBAC. |
| `artifacts/payroll-nexus/src/pages/workers/aadhaar-scan.tsx` | Full dialog chain: Consent → Camera (`@zxing/browser`) / Upload → Verifying → Preview → Conflict resolver → `onAutofill` callback. |
| `artifacts/api-server/src/__tests__/aadhaar-service.test.ts` | 18 tests: V1 QR parsing, format detection, DOB edge cases, name validation. |
| `docs/uidai-cert-setup.md` | Step-by-step instructions for configuring the UIDAI production certificate. |

### Modified Files

| File | Change |
|------|--------|
| `artifacts/api-server/src/routes/index.ts` | Mounts `aadhaarRouter` |
| `artifacts/api-server/src/routes/workers.ts` | Aadhaar validation: accepts 12 digits OR masked QR reference (`XXXXXXXX1234`) |
| `artifacts/payroll-nexus/src/pages/workers/form.tsx` | Aadhaar Card Number field after Employee Code; `AadhaarPanel` scan/upload buttons; `handleAadhaarAutofill` merges non-restricted fields |
| `artifacts/api-server/package.json` | Added: `sharp`, `multer`, `pdfjs-dist`, `jsqr`, `node-forge`; dev: `@types/multer`, `@types/node-forge` |
| `artifacts/payroll-nexus/package.json` | Added: `@zxing/browser`, `@zxing/library` |

### Verification Results (06 August 2026)

| Check | Result |
|-------|--------|
| API typecheck (`tsc --noEmit`) | ✅ 0 errors |
| Frontend typecheck (`tsc --noEmit`) | ✅ 0 errors |
| API test suite (Vitest) | ✅ 81 passed, 72 skipped, 0 failed |
| API production build (esbuild) | ✅ Built successfully (3.3 MB) |
| `POST /api/aadhaar/verify-qr` | ✅ 401 when unauthenticated (route found) |
| `POST /api/aadhaar/extract-upload` | ✅ 401 when unauthenticated (route found) |
| Company → Branch → Client → Unit flow | ✅ All 5 routes respond 401 (not 404) |
| UIDAI dev-skip startup warning | ✅ Logged correctly when `UIDAI_QR_CERT` not set |

---

## Known Deferred Items

| Item | Reason deferred |
|------|----------------|
| Zone/branch discovery from Setup menu | Separate task (proposed) |
| ESI/PF challan compliance gap view | Separate task (proposed) |
| Employee module against 200-column EMPMAST | Separate task (in progress) |
| Aadhaar QR badge (Verified vs Manual Entry) | Follow-up (cancelled — can be added later) |
| PDF vector QR rendering (canvas) | Follow-up (cancelled — JPEG extraction covers most e-Aadhaar PDFs) |
| UIDAI production certificate | Operator config — see `docs/uidai-cert-setup.md` |
