# Payroll Nexus

India-first enterprise payroll SaaS for staffing/manpower/facility management companies (500–5,000 workers, multi-client, multi-site, multi-state).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/payroll-nexus run dev` — run the frontend (port 25477, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — rebuild lib declarations (run before leaf checks after schema changes)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed` — seed demo data (wipes and repopulates all tables)
- Required env: `DATABASE_URL` — Postgres connection string
- Local (non-Replit) run supported: see `README.md` / `LOCAL_SETUP_CHECKLIST.md`. Root `pnpm run dev` (concurrently) is for local machines only — on Replit always use workflows. Vite adds an `/api` proxy only when `REPL_ID` is undefined; PORT/BASE_PATH default locally (5000 web, 8080 api); `lib/db` auto-loads a root `.env` when `DATABASE_URL` is unset.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + wouter + react-query
- API: Express 5 (port 8080, base path `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec → `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth for all API contracts
- `lib/db/src/schema/` — Drizzle schema files (tenants, users, orgs, clients, workers, assignments, attendance, payroll, billing, audit)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas
- `artifacts/api-server/src/routes/` — Express route handlers (one file per domain)
- `artifacts/payroll-nexus/src/pages/` — React page components
- `scripts/src/seed.ts` — demo data seeder

## Architecture decisions

- **Contract-first API**: OpenAPI spec defined first; hooks and Zod schemas are generated, never hand-written.
- **Auth via base64 JWT**: Token stored in `localStorage` as `payroll_nexus_token`, sent as `Authorization: Bearer`, decoded server-side from base64 JSON `{ userId, tenantId, exp }`.
- **Multi-tenant by tenantId**: All DB tables carry `tenantId`; middleware resolves tenant from token and injects `req.tenantId`.
- **req.params casting**: Express 5 types `req.params` as `ParamsDictionary`. All route destructuring uses `req.params as Record<string, string>` to satisfy TS.
- **Seed script idempotent**: `scripts/src/seed.ts` deletes all rows in dependency order before inserting, safe to re-run.

## Product

Full payroll spine for India staffing firms:
- **Tenant/Package Setup** — multi-tenant SaaS with package tiers
- **User & RBAC** — roles, permissions, users per tenant
- **Organisation & Legal Entities** — PF, ESI, PT, LWF, TAN, GSTIN per state entity
- **Clients & Sites** — multi-client, multi-site management
- **Workers** — import, bank details, statutory profiles (PF UAN, ESI)
- **Assignments** — worker-to-client-site-legal-entity mapping
- **Salary Structures** — monthly/daily wage with component breakdown
- **Attendance** — monthly upload, LWP tracking, exception flags
- **Payroll Calculation** — gross pay pro-rated on attendance, statutory deductions (PF 12%, ESI 0.75%, PT, LWF)
- **Approval & Lock** — batch approval workflow
- **Bank File** — SBI/HDFC format generation
- **Payslips** — per-worker payslip generation
- **Compliance Reports** — PF ECR, ESI, PT, LWF
- **Client Invoice** — billing rules (% on gross), GST, invoice PDF
- **Audit Trail** — all actions logged

## Demo credentials

Tenant slug: `nexus`  
**Total demo users: 50 (9 primary + 41 additional) — demo/testing credentials only.**

### Primary demo users (role-specific passwords)

| Role | Email | Password |
|---|---|---|
| Tenant Admin | `admin@nexusstaffing.com` | `Admin@123` |
| HR Executive | `hr@nexusstaffing.com` | `Hr@12345` |
| Payroll Executive | `payroll.exec@nexusstaffing.com` | `PayExec@123` |
| Payroll Manager | `payroll@nexusstaffing.com` | `Payroll@123` |
| Finance Executive | `finance@nexusstaffing.com` | `Finance@123` |
| Finance Manager | `finance.mgr@nexusstaffing.com` | `FinMgr@123` |
| Compliance Officer | `compliance@nexusstaffing.com` | `Comply@123` |
| Auditor | `auditor@nexusstaffing.com` | `Audit@123` |
| Executive | `executive@nexusstaffing.com` | `Exec@123` |

### Additional demo users (41 users, all password: `Demo@123`)

| Role | Count | Emails (`@nexusstaffing.com`) |
|---|---|---|
| Tenant Admin | 3 | `sumanth.reddy`, `nandita.singh`, `prasad.kulkarni` |
| HR Executive | 6 | `sanjay.kumar`, `anita.das`, `rahul.pillai`, `pooja.menon`, `kiran.rao`, `divya.joshi` |
| Payroll Executive | 5 | `suresh.nair`, `lakshmi.bhat`, `ganesh.iyer`, `sunita.patel`, `arun.mishra` |
| Payroll Manager | 3 | `vijay.kulkarni`, `rekha.shetty`, `rajesh.pandey` |
| Finance Executive | 5 | `amit.sharma`, `neha.desai`, `prakash.jain`, `swati.bhatt`, `manish.tiwari` |
| Finance Manager | 3 | `ashwin.hegde`, `seema.malhotra`, `ravi.chandra` |
| Compliance Officer | 5 | `padma.krishnamurthy`, `sunil.patil`, `meera.nambiar`, `harish.rao`, `latha.venkatesh` |
| Auditor | 5 | `deepak.agarwal`, `usha.pillai`, `vijayalakshmi.r`, `santosh.kumar`, `prema.subramaniam` |
| Executive | 6 | `krishna.murthy`, `sudha.venkat`, `srinivas.iyengar`, `anand.krishnan`, `nalini.sundaram`, `balaji.raghavan` |

See `docs/QA-PLAN.md` for full QA scope, worker-scale assumptions (20K/25K/50K), performance targets, and QA dashboard.

Demo data highlights:
- Workers NX002, NX007, NX011: deliberate below-minimum-wage cases. KA min wage is zone-based: Zone 1 ₹899/day (⇒ ₹23,374/month), Zone 2 ₹821/day (⇒ ₹21,346/month). NX002/NX007 sit at a Zone 1 site; NX011 sits at the Zone 2 Hubballi site (site-006), so the min-wage exceptions report shows two distinct zones. All other KA workers are paid at or above their site-zone floor. The large-scale seeder (`seed-data`) similarly keeps 8 deliberate cases (5 monthly + 3 daily KA; its sites are untagged, so the flat Zone 1 rate applies there).
- Worker NX012 (₹22,100): at the Zone 2 Hubballi site — legal under the ₹821/day Zone 2 rate but below the Zone 1 monthly floor, demonstrating the lower zone threshold applying.
- Site-005 (Mysuru Infotech Park): deliberately untagged KA site — triggers the "No zone tag" readiness warning.
- Workers NX017 & NX018: daily wage workers (Maharashtra)
- Worker NX019: missing bank details (bank readiness gap)
- Worker NX020: missing bank details + missing salary structure
- April 2026: locked payroll batch (`batch-april-2026`) with NO PF ECR / ESI export logs — keeps the compliance dashboard "PF ECR Pending" / "ESI Pending" cards at 1 after a fresh seed
- May 2026: 3 workers with open attendance exceptions (NX001, NX005, NX010)
- June 2026: locked payroll batch, 2 resolved payroll exceptions, 3 invoices, bank file generated

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` when any `lib/db` schema changes — stale lib declarations cause spurious errors.
- Auth login returns `roleName` (not `role`) in the user object. The layout reads `user.roleName ?? user.role`. Nav role restrictions use the role's display name (e.g. `"Tenant Admin"`, not `"admin"`).
- `perm-finance-export` permission is required for bank file download. Both Finance Executive and Finance Manager hold this permission in the seed — both roles can download bank files. (Earlier note saying FE does not have it was outdated.)
- Frontend attendance page requires `month` (YYYY-MM) as a required param in `useListAttendanceRecords`.
- Do not run `pnpm dev` at workspace root — run individual artifacts via workflows.
- After codegen changes, restart the API server workflow so it picks up rebuilt lib types.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
