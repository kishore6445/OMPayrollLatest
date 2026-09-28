# Payroll Nexus MVP — QA Master Document (QA-MASTER-04)

**Tenant:** Nexus Staffing Services Pvt Ltd | **Slug:** `nexus`  
**Scope:** Demo & Pilot Readiness — MVP spine only. No future-phase features.  
**Last Updated:** 2026-06-30

> **Standing instruction:** Do not add new future-phase features. Focus only on testing, fixing, optimising, validating, and preparing the Payroll Nexus MVP for demo and pilot readiness.

---

## 1. QA Strategy & Framework

### 1.1 Objective
Validate that Payroll Nexus MVP is functionally correct, role-secure, performant at 20K / 25K / 50K worker volumes, and ready for live demo and pilot rollout with Nexus Staffing Services Pvt Ltd.

### 1.2 QA Phases
| Phase | Name | Focus |
|---|---|---|
| Phase 1 | Setup & Baseline | Environment, credentials, seed data, readiness |
| Phase 2 | Functional Testing | All modules, roles, screens, forms, workflows |
| Phase 3 | Performance & Load | 20K / 25K / 50K volumes, 50 concurrent users |
| Phase 4 | Defect Fix & Optimisation | Triage, fix, re-test |
| Phase 5 | Final Demo Readiness | End-to-end demo run, volume confirmation |
| Phase 6 | Sign-off & Report | QA dashboard, sign-off report, verdict |

### 1.3 Entry Criteria
- All TypeScript typechecks pass (zero errors)
- API health endpoint returns 200
- Demo seed loaded (20 workers, June 2026 locked batch)
- All 50 demo users created

### 1.4 Exit Criteria
- All P0 / P1 test cases pass
- No open Critical or High defects
- Performance targets met at 50K workers (or limitations documented)
- 50-user load test: < 0.5% error rate
- Final MVP readiness verdict signed off

### 1.5 Defect Severity
| Severity | Definition |
|---|---|
| **Critical** | Blocks demo; data corruption; wrong financial output |
| **High** | Wrong result on a core module; permission bypass |
| **Medium** | Performance miss; UX issue; non-blocking wrong value |
| **Low** | Cosmetic; label; minor UX |

### 1.6 Priority
| Priority | Definition |
|---|---|
| **P0** | Must fix before demo |
| **P1** | Must fix before pilot |
| **P2** | Fix in next iteration |
| **P3** | Backlog |

---

## 2. Test Credentials

> **Demo/testing credentials only. Not for production use.**

### 2.1 Primary Demo Users (9) — Full Module Testing

| # | Role | Email | Password |
|---|---|---|---|
| 1 | Tenant Admin | `admin@nexusstaffing.com` | `Admin@123` |
| 2 | HR Executive | `hr@nexusstaffing.com` | `Hr@12345` |
| 3 | Payroll Executive | `payroll.exec@nexusstaffing.com` | `PayExec@123` |
| 4 | Payroll Manager | `payroll@nexusstaffing.com` | `Payroll@123` |
| 5 | Finance Executive | `finance@nexusstaffing.com` | `Finance@123` |
| 6 | Finance Manager | `finance.mgr@nexusstaffing.com` | `FinMgr@123` |
| 7 | Compliance Officer | `compliance@nexusstaffing.com` | `Comply@123` |
| 8 | Auditor | `auditor@nexusstaffing.com` | `Audit@123` |
| 9 | Executive | `executive@nexusstaffing.com` | `Exec@123` |

### 2.2 Additional Demo Users (41) — Sampled Testing + Load Testing

All password: `Demo@123`

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

**Total: 50 users** (9 primary + 41 additional)

---

## 3. Worker Scale — Test Datasets

| Dataset | Workers | Seed Command | Purpose |
|---|---|---|---|
| Demo | 20 | `pnpm --filter @workspace/scripts run seed` | Functional correctness, RBAC |
| **Scale-20K** | 20,000 | `pnpm --filter @workspace/scripts run seed:20k` | Minimum — performance baseline |
| **Scale-25K** | 25,000 | `pnpm --filter @workspace/scripts run seed:25k` | Middle — common pilot target |
| **Scale-50K** | 50,000 | `pnpm --filter @workspace/scripts run seed:50k` | Maximum — load ceiling |

Each scale dataset: 2 states (KA / MH), 3 clients, 4 sites, 80% monthly / 20% daily wage, ~5% missing bank details, ~2% missing salary structure, one locked attendance month, one locked payroll batch.

> Restore demo after scale testing: `pnpm --filter @workspace/scripts run seed`

---

## 4. Role-Wise Test Matrix

✅ = Full access | 🔍 = Read-only | ❌ = No access | ⚠️ = Restricted

| Module | Tenant Admin | HR Exec | Payroll Exec | Payroll Mgr | Finance Exec | Finance Mgr | Compliance | Auditor | Executive |
|---|---|---|---|---|---|---|---|---|---|
| Workspace / Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Organisation / Legal Entities | ✅ | 🔍 | ❌ | ❌ | ❌ | 🔍 | 🔍 | 🔍 | 🔍 |
| Clients & Sites | ✅ | 🔍 | ❌ | ❌ | 🔍 | ✅ | 🔍 | 🔍 | 🔍 |
| Billing Rules | ✅ | ❌ | ❌ | ❌ | 🔍 | ✅ | ❌ | 🔍 | ❌ |
| Workers — List & Detail | ✅ | ✅ | 🔍 | 🔍 | ❌ | ❌ | 🔍 | 🔍 | 🔍 |
| Workers — Import / Edit | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Salary Structures | ✅ | ✅ | 🔍 | 🔍 | ❌ | ❌ | ❌ | 🔍 | ❌ |
| Assignments | ✅ | ✅ | 🔍 | 🔍 | ❌ | ❌ | ❌ | 🔍 | ❌ |
| Attendance — Upload | ✅ | ❌ | ✅ | 🔍 | ❌ | ❌ | ❌ | 🔍 | ❌ |
| Attendance — Approve / Lock | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | 🔍 | ❌ |
| Payroll — Calculate | ✅ | ❌ | ✅ | 🔍 | ❌ | ❌ | ❌ | 🔍 | ❌ |
| Payroll — Approve / Lock | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | 🔍 | ❌ |
| Payslips — Generate | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | 🔍 | ❌ |
| Payslips — Download | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | 🔍 | ❌ |
| Bank Files — Generate | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | 🔍 | ❌ |
| Bank Files — Download | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | 🔍 | ❌ |
| Bank Files — Download (Exec) | ❌ | ❌ | ❌ | ❌ | ⚠️ 403 | ✅ | ❌ | ❌ | ❌ |
| Invoices — Generate / Approve | ✅ | ❌ | ❌ | ❌ | 🔍 | ✅ | ❌ | 🔍 | ❌ |
| Compliance Reports | ✅ | ❌ | 🔍 | 🔍 | ❌ | 🔍 | ✅ | 🔍 | 🔍 |
| Reports | ✅ | 🔍 | 🔍 | 🔍 | 🔍 | 🔍 | 🔍 | 🔍 | 🔍 |
| Audit Log | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Export Log | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Users & Roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Tenants | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 5. Test Suite Catalogue

| Suite ID | Suite Name | TC Count | Scope |
|---|---|---|---|
| TS-01 | Smoke Tests | 10 | System-level health before any testing |
| TS-02 | Role Login | 14 | All 9 primary roles, credential validation, token, logout |
| TS-03 | RBAC | 18 | Permission gates, forbidden routes, privilege escalation |
| TS-04 | Master Data | 12 | Org, legal entities, clients, sites, billing rules |
| TS-05 | Worker Data | 14 | Worker list, detail, import, bank, statutory, salary |
| TS-06 | Attendance | 12 | Upload, exceptions, resolution, lock |
| TS-07 | Payroll | 14 | Calculate, exceptions, approve, lock, draft block |
| TS-08 | Payroll Outputs | 16 | Payslips, bank files, locked enforcement |
| TS-09 | Compliance | 14 | PF ECR, ESI, PT, LWF, min-wage, CSV exports |
| TS-10 | Billing | 12 | Invoices, annexure, approve, export |
| TS-11 | Reports | 10 | Report catalog, payroll summary, variance, downloads |
| TS-12 | Dashboards | 10 | Finance, payroll, compliance, executive dashboards |
| TS-13 | Audit & Export Logs | 10 | Audit trail, export logs, file access logs |
| TS-14 | Large Data | 18 | All outputs at 20K / 25K / 50K workers |
| TS-15 | Performance | 14 | Response times per operation per volume |
| TS-16 | Load Testing | 8 | 50 concurrent users, error rate, p95 |
| TS-17 | Regression | 12 | Key flows re-tested after defect fixes |
| TS-18 | Demo Readiness | 10 | End-to-end demo run, all 9 roles |
| **Total** | | **228** | |

---

## 6. Test Cases

> **Status values:** ✅ Pass | ❌ Fail | 🚫 Blocked | ⬜ Not Run  
> **All "Actual Result" and "Status" columns start as "—" / ⬜ Not Run — update as testing progresses.**

---

### TS-01 — Smoke Tests

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-0101 | API health endpoint returns 200 | — | Server running | `GET /api/healthz` → HTTP 200 | ⬜ | Critical | P0 |
| TC-0102 | Frontend loads without console errors | — | App deployed | Login page renders; no JS errors in console | ⬜ | Critical | P0 |
| TC-0103 | Login page renders correctly | — | App running | Email, password, tenant slug fields visible | ⬜ | Critical | P0 |
| TC-0104 | Admin login succeeds and redirects to workspace | Admin | Demo seed loaded | Login → Workspace page, role = Tenant Admin | ⬜ | Critical | P0 |
| TC-0105 | Workspace dashboard loads with payroll data | Admin | June 2026 locked batch | Workspace shows batch card for June 2026 | ⬜ | Critical | P0 |
| TC-0106 | Worker list loads (20-worker demo seed) | Admin | Demo seed | Workers page shows 20 workers | ⬜ | Critical | P0 |
| TC-0107 | Locked payroll batch visible on payroll page | Payroll Mgr | June 2026 locked | Batch card shows status = locked | ⬜ | Critical | P0 |
| TC-0108 | Navigation renders all expected sections | Admin | Logged in as Admin | Home, Setup, Workers, Attendance, Payroll, Finance, Compliance, Reports, Admin sections visible | ⬜ | High | P0 |
| TC-0109 | Unauthenticated API call returns 401 | — | No token | `GET /api/workers` without token → 401 | ⬜ | Critical | P0 |
| TC-0110 | Demo Guide page loads | Admin | Logged in | /demo-guide renders 9 role sections | ⬜ | Medium | P1 |

---

### TS-02 — Role Login

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-0201 | Tenant Admin login | admin@nexusstaffing.com | Password: Admin@123 | Login succeeds; roleName = "Tenant Admin" | ⬜ | Critical | P0 |
| TC-0202 | HR Executive login | hr@nexusstaffing.com | Password: Hr@12345 | Login succeeds; roleName = "HR Executive" | ⬜ | Critical | P0 |
| TC-0203 | Payroll Executive login | payroll.exec@nexusstaffing.com | Password: PayExec@123 | Login succeeds; roleName = "Payroll Executive" | ⬜ | Critical | P0 |
| TC-0204 | Payroll Manager login | payroll@nexusstaffing.com | Password: Payroll@123 | Login succeeds; roleName = "Payroll Manager" | ⬜ | Critical | P0 |
| TC-0205 | Finance Executive login | finance@nexusstaffing.com | Password: Finance@123 | Login succeeds; roleName = "Finance Executive" | ⬜ | Critical | P0 |
| TC-0206 | Finance Manager login | finance.mgr@nexusstaffing.com | Password: FinMgr@123 | Login succeeds; roleName = "Finance Manager" | ⬜ | Critical | P0 |
| TC-0207 | Compliance Officer login | compliance@nexusstaffing.com | Password: Comply@123 | Login succeeds; roleName = "Compliance Officer" | ⬜ | Critical | P0 |
| TC-0208 | Auditor login | auditor@nexusstaffing.com | Password: Audit@123 | Login succeeds; roleName = "Auditor" | ⬜ | Critical | P0 |
| TC-0209 | Executive login | executive@nexusstaffing.com | Password: Exec@123 | Login succeeds; roleName = "Executive" | ⬜ | Critical | P0 |
| TC-0210 | Wrong password → 401 | Admin | Wrong password | API returns 401 with error message | ⬜ | High | P0 |
| TC-0211 | Missing tenant slug → 400 | Any | Blank tenant slug | Login API returns 400 | ⬜ | High | P0 |
| TC-0212 | Additional user login (sample 2 per role) | Various | Password: Demo@123 | Each sampled user logs in successfully | ⬜ | High | P1 |
| TC-0213 | Token persists after page refresh | Admin | Logged in | Refresh → stays logged in, no redirect to login | ⬜ | High | P0 |
| TC-0214 | Logout clears token and redirects to login | Admin | Logged in | Click logout → login page, token removed | ⬜ | High | P0 |

---

### TS-03 — RBAC

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-0301 | HR Exec cannot access payroll calculation | HR Exec | Logged in | Payroll calculate button not visible / API returns 403 | ⬜ | Critical | P0 |
| TC-0302 | Payroll Exec cannot lock payroll batch | Payroll Exec | Logged in | Lock button absent or returns 403 | ⬜ | Critical | P0 |
| TC-0303 | Finance Exec cannot download bank file | Finance Exec | Locked batch, bank file generated | Download button absent or `GET /api/billing/bank-files/:id/download` → 403 | ⬜ | Critical | P0 |
| TC-0304 | Finance Mgr can download bank file | Finance Mgr | Locked batch, bank file generated | Download succeeds (200, file returned) | ⬜ | Critical | P0 |
| TC-0305 | Auditor cannot create or edit any record | Auditor | Logged in | All write actions (POST/PUT/DELETE) return 403 or are absent | ⬜ | Critical | P0 |
| TC-0306 | Compliance Officer cannot modify payroll | Compliance | Logged in | Payroll write endpoints return 403 | ⬜ | High | P0 |
| TC-0307 | Executive sees only dashboards | Executive | Logged in | Navigation shows only dashboard items; no operational modules | ⬜ | High | P0 |
| TC-0308 | HR Exec cannot access billing/invoices | HR Exec | Logged in | /invoices direct URL → not found or 403 | ⬜ | High | P0 |
| TC-0309 | Payroll Mgr cannot access Tenants admin page | Payroll Mgr | Logged in | /tenants direct URL → not found or 403 | ⬜ | High | P0 |
| TC-0310 | Unauthenticated direct URL → redirect to login | — | No token | /workers → redirect to /login | ⬜ | Critical | P0 |
| TC-0311 | Wrong-role direct URL → 403 or hidden | Finance Exec | Logged in | /audit-log direct URL returns 403 or not in nav | ⬜ | High | P0 |
| TC-0312 | Admin can access all modules | Admin | Logged in | All nav sections visible and accessible | ⬜ | High | P0 |
| TC-0313 | Draft batch → output route blocked (payslips) | Payroll Mgr | Draft batch exists | POST /api/billing/payslips/generate → 400 | ⬜ | Critical | P0 |
| TC-0314 | Draft batch → output route blocked (bank file) | Finance Mgr | Draft batch exists | POST /api/billing/bank-files/generate → 400 | ⬜ | Critical | P0 |
| TC-0315 | Draft batch → compliance reports blocked | Compliance | Draft batch | GET /api/compliance/pf → 400 | ⬜ | Critical | P0 |
| TC-0316 | Approved (non-locked) batch blocks outputs | Finance Mgr | Approved batch | Output routes return 400 | ⬜ | Critical | P0 |
| TC-0317 | Tenant isolation — cross-tenant API call blocked | Admin | Token from tenant A | API call with tenant A token cannot read tenant B data | ⬜ | Critical | P0 |
| TC-0318 | Role-restricted nav items hidden per role | All 9 | Logged in per role | Each role sees only its permitted nav items | ⬜ | High | P0 |

---

### TS-04 — Master Data

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-0401 | Organisation list loads | Admin | Demo seed | /organizations shows org with PF/ESI/TAN/GSTIN details | ⬜ | High | P1 |
| TC-0402 | Legal entities — KA and MH entities present | Admin | Demo seed | 2 legal entities shown with state-specific statutory numbers | ⬜ | High | P1 |
| TC-0403 | Legal entity detail shows PT and LWF | Admin | Demo seed | PT and LWF values visible for KA and MH | ⬜ | High | P1 |
| TC-0404 | Clients list — 3 clients visible | Admin | Demo seed | TechPark, Metro Security, Horizon listed | ⬜ | High | P1 |
| TC-0405 | Sites — 6 sites linked to clients | Admin | Demo seed | 6 sites visible across 3 clients (incl. Zone 2 Hubballi + untagged Mysuru) | ⬜ | High | P1 |
| TC-0406 | Billing rules — service % per client | Admin | Demo seed | TechPark 10%, Metro 12%, Horizon 11% | ⬜ | High | P1 |
| TC-0407 | Billing rules — GST 18% applied | Admin | Demo seed | GST rate = 18% on all billing rules | ⬜ | High | P1 |
| TC-0408 | Create new client (form validation) | Admin | Logged in | Required field missing → validation error shown | ⬜ | Medium | P2 |
| TC-0409 | Create new site linked to client | Admin | Client exists | New site created and linked to client | ⬜ | Medium | P2 |
| TC-0410 | Create billing rule for new client | Admin | Client + site | Billing rule saved with % and GST | ⬜ | Medium | P2 |
| TC-0411 | Salary structure list | Admin, HR | Demo seed | Monthly and daily-wage structures visible | ⬜ | High | P1 |
| TC-0412 | Salary structure components breakdown | Admin | Demo seed | Component-wise breakdown (Basic, HRA, PF, ESI) visible | ⬜ | High | P1 |

---

### TS-05 — Worker Data

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-0501 | Worker list — all 20 demo workers | HR Exec | Demo seed | List shows 20 workers, paginated | ⬜ | High | P0 |
| TC-0502 | Worker search by name | HR Exec | Demo seed | Search "Ravi" → filters to matching workers | ⬜ | High | P0 |
| TC-0503 | Worker search by code | Admin | Demo seed | Search "NX001" → correct worker returned | ⬜ | High | P0 |
| TC-0504 | Worker filter by status | Admin | Demo seed | Active filter → only active workers | ⬜ | Medium | P1 |
| TC-0505 | Worker detail — statutory profile visible | HR Exec | Demo seed | PF UAN, ESI IP number shown for NX001 | ⬜ | High | P0 |
| TC-0506 | Worker detail — bank details visible | HR Exec | Demo seed | Bank name, account, IFSC shown for NX001 | ⬜ | High | P0 |
| TC-0507 | Missing bank — NX019 flagged | Admin | Demo seed | NX019 shows "missing bank details" flag | ⬜ | High | P0 |
| TC-0508 | Missing bank + salary — NX020 flagged | Admin | Demo seed | NX020 shows both flags | ⬜ | High | P0 |
| TC-0509 | Worker assignment — client, site, legal entity | HR Exec | Demo seed | NX001 assignment shows client, site, entity, dates | ⬜ | High | P1 |
| TC-0510 | Worker pagination controls work | Admin | Demo seed | Prev / Next buttons change page; counter updates | ⬜ | Medium | P1 |
| TC-0511 | Worker list at large data — server-side filter | Admin | 20K seed | Name search at 20K returns filtered result < 1 s | ⬜ | High | P0 |
| TC-0512 | Daily-wage worker identified (NX017, NX018) | Admin | Demo seed | Workers marked as daily-wage; daily rate shown | ⬜ | High | P0 |
| TC-0513 | Worker bulk upload form validation | HR Exec | Logged in | Upload invalid file → validation error shown | ⬜ | Medium | P2 |
| TC-0514 | Missing worker data report | Admin | Demo seed | Report lists workers missing bank or salary structure | ⬜ | High | P1 |

---

### TS-06 — Attendance

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-0601 | Upload attendance file for May 2026 | Payroll Exec | Workers assigned | Attendance records created for all workers | ⬜ | High | P0 |
| TC-0602 | Attendance exceptions — May 2026 flagged | Payroll Exec | May 2026 uploaded | NX001, NX005, NX010 show open exceptions | ⬜ | High | P0 |
| TC-0603 | Exception detail — reason and days visible | Payroll Mgr | Exceptions exist | Exception shows worker, type, days affected | ⬜ | High | P0 |
| TC-0604 | Resolve attendance exception | Payroll Mgr | Open exception | Exception marked resolved; status updates | ⬜ | High | P0 |
| TC-0605 | Lock attendance month | Payroll Mgr | All exceptions resolved | Attendance locked; lock icon shown; upload disabled | ⬜ | Critical | P0 |
| TC-0606 | Locked attendance — re-upload blocked | Payroll Exec | Attendance locked | Upload returns error or button disabled | ⬜ | High | P0 |
| TC-0607 | LWP days flow to payroll calculation | Payroll Exec | Attendance locked | Worker with 3 LWP days has gross pro-rated in payroll | ⬜ | Critical | P0 |
| TC-0608 | Attendance batch detail — days worked visible | Payroll Exec | Attendance uploaded | Summary shows present days, LWP, absent per worker | ⬜ | High | P1 |
| TC-0609 | Attendance validation — duplicate upload rejected | Payroll Exec | Month already uploaded | Upload for same month returns validation error | ⬜ | High | P1 |
| TC-0610 | Attendance filter by month | Payroll Exec | Multiple months | Month filter shows only selected month's records | ⬜ | Medium | P1 |
| TC-0611 | Locked attendance page lists locked months | Payroll Mgr | June 2026 locked | /attendance/locked shows June 2026 as locked | ⬜ | Medium | P1 |
| TC-0612 | Attendance exception boundary — 0 LWP | Payroll Exec | Worker with full attendance | No exception flagged for worker with 0 LWP | ⬜ | Medium | P2 |

---

### TS-07 — Payroll

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-0701 | Create payroll batch for June 2026 | Payroll Exec | Attendance locked | New batch created with status = draft | ⬜ | Critical | P0 |
| TC-0702 | Calculate payroll — monthly wage worker | Payroll Exec | Draft batch | Gross = (salary / 30) × days worked; PF 12%, ESI 0.75% deducted | ⬜ | Critical | P0 |
| TC-0703 | Calculate payroll — daily wage worker (NX017) | Payroll Exec | Draft batch | Gross = daily rate × days worked; same deductions | ⬜ | Critical | P0 |
| TC-0704 | PT deduction — Karnataka slab correct | Payroll Exec | Draft batch, KA worker | PT deducted per KA state slab | ⬜ | Critical | P0 |
| TC-0705 | PT deduction — Maharashtra slab correct | Payroll Exec | Draft batch, MH worker | PT deducted per MH state slab | ⬜ | Critical | P0 |
| TC-0706 | LWF deduction — state-specific | Payroll Exec | Draft batch | LWF deducted per KA or MH rate | ⬜ | High | P0 |
| TC-0707 | Payroll exceptions visible after calculation | Payroll Exec | Calc complete | Exception list shows flagged workers | ⬜ | High | P0 |
| TC-0708 | Resolve payroll exception | Payroll Mgr | Open payroll exception | Exception resolved; net pay recalculated | ⬜ | High | P0 |
| TC-0709 | Approve payroll batch | Payroll Mgr | All exceptions resolved | Batch status = approved | ⬜ | Critical | P0 |
| TC-0710 | Lock payroll batch | Payroll Mgr | Batch approved | Batch status = locked; lockedAt/lockedBy set | ⬜ | Critical | P0 |
| TC-0711 | Draft batch — all output routes blocked (400) | Finance Mgr | Draft batch | Bank file, payslip, compliance, invoice → 400 | ⬜ | Critical | P0 |
| TC-0712 | Payroll trace — per-worker calculation detail | Payroll Mgr | Locked batch | /payroll/trace shows gross, deductions, net per worker | ⬜ | High | P1 |
| TC-0713 | Worker payroll summary page | Payroll Mgr | Locked batch | /payroll/:id/worker/:workerId shows full breakdown | ⬜ | High | P1 |
| TC-0714 | Payroll variance report — month-on-month | Payroll Mgr | 2+ months calculated | Variance report shows change per worker | ⬜ | Medium | P2 |

---

### TS-08 — Payroll Outputs

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-0801 | Generate payslips for locked batch | Payroll Mgr | Locked batch | Payslips created for all workers; count matches | ⬜ | Critical | P0 |
| TC-0802 | Payslip line items match payroll record | Payroll Mgr | Payslips generated | Earnings, deductions, net on payslip = payroll record | ⬜ | Critical | P0 |
| TC-0803 | Payslip detail — all fields populated | Payroll Mgr | Payslips generated | Worker name, month, gross, PF, ESI, PT, LWF, net shown | ⬜ | High | P0 |
| TC-0804 | Payslip preview dialog opens | Admin | Payslips generated | Click preview → modal shows formatted payslip | ⬜ | High | P1 |
| TC-0805 | Payslip download CSV | Payroll Mgr | Payslips generated | CSV downloaded with all workers; correct columns | ⬜ | High | P0 |
| TC-0806 | Payslip export log entry created | Auditor | Payslip downloaded | Export log shows `payslip_download` entry for that user | ⬜ | High | P1 |
| TC-0807 | Bank file readiness panel — banked vs unbanked | Finance Mgr | Locked batch | Panel shows N banked, 2 unbanked (NX019, NX020) | ⬜ | Critical | P0 |
| TC-0808 | Generate bank file — excludes unbanked workers | Finance Mgr | Locked batch | Bank file generated; NX019 and NX020 excluded | ⬜ | Critical | P0 |
| TC-0809 | Bank file reconciliation status = reconciled | Finance Mgr | Bank file generated | reconciliation_status = "reconciled"; header total = sum of D-lines | ⬜ | Critical | P0 |
| TC-0810 | Bank file download — Finance Mgr succeeds | Finance Mgr | Bank file generated | TXT file downloaded with correct format | ⬜ | Critical | P0 |
| TC-0811 | Bank file download — Finance Exec blocked (403) | Finance Exec | Bank file generated | `GET /download` returns 403 | ⬜ | Critical | P0 |
| TC-0812 | Bank file export log entry created on download | Auditor | Bank file downloaded | Export log shows `bank_file_download` with user and timestamp | ⬜ | High | P1 |
| TC-0813 | HDFC CSV format download | Finance Mgr | Bank file generated | HDFC format CSV has correct header and columns | ⬜ | High | P1 |
| TC-0814 | Payslip generation blocked on non-locked batch | Payroll Mgr | Draft/approved batch | Generate endpoint returns 400 | ⬜ | Critical | P0 |
| TC-0815 | Bank file generation blocked on non-locked batch | Finance Mgr | Draft batch | Generate endpoint returns 400 | ⬜ | Critical | P0 |
| TC-0816 | Payslip downloaded_at / downloaded_by recorded | Admin | Payslip downloaded | DB record has downloaded_at timestamp and user ID | ⬜ | Medium | P2 |

---

### TS-09 — Compliance

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-0901 | PF ECR — report loads for locked batch | Compliance | Locked batch | PF ECR table shows all workers with pfWage, pfEmployee, pfEmployer | ⬜ | Critical | P0 |
| TC-0902 | PF ECR — pfEmployee = pfWage × 12% | Compliance | PF ECR loaded | Each row: pfEmployee = pfWage × 0.12 (within rounding) | ⬜ | Critical | P0 |
| TC-0903 | PF ECR — pfEmployer = pfWage × 12% | Compliance | PF ECR loaded | Employer contribution = 12% of pfWage | ⬜ | Critical | P0 |
| TC-0904 | ESI report — employee 0.75%, employer 3.25% | Compliance | Locked batch | ESI shares correct per worker | ⬜ | Critical | P0 |
| TC-0905 | PT report — KA slab applied | Compliance | KA workers in batch | PT per KA slab; byState shows KA total | ⬜ | Critical | P0 |
| TC-0906 | PT report — MH slab applied | Compliance | MH workers in batch | PT per MH slab; byState shows MH total | ⬜ | Critical | P0 |
| TC-0907 | LWF report — per-state amounts | Compliance | Locked batch | LWF employee + employer per state; byState breakdown | ⬜ | High | P0 |
| TC-0908 | Min-wage exceptions report | Compliance | Locked batch | Workers below state min-wage listed with shortfall | ⬜ | High | P0 |
| TC-0909 | Statutory gaps report | Compliance | Locked batch | Workers missing PF UAN or ESI IP flagged | ⬜ | High | P1 |
| TC-0910 | PF ECR CSV export | Compliance | PF ECR loaded | CSV downloaded with all required ECR columns | ⬜ | High | P0 |
| TC-0911 | ESI CSV export | Compliance | ESI loaded | CSV downloaded; correct format | ⬜ | High | P0 |
| TC-0912 | PT and LWF CSV exports | Compliance | Reports loaded | CSVs download with state-wise breakdown | ⬜ | High | P0 |
| TC-0913 | Compliance reports blocked on draft batch (400) | Compliance | Draft batch | All compliance GET endpoints return 400 | ⬜ | Critical | P0 |
| TC-0914 | Export log entry on compliance CSV download | Auditor | CSV downloaded | Export log shows compliance export entry | ⬜ | High | P1 |

---

### TS-10 — Billing

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-1001 | Generate invoice for Client A (TechPark) | Finance Mgr | Locked batch, billing rule | Invoice created with gross, service fee, GST, total | ⬜ | Critical | P0 |
| TC-1002 | Service fee = gross × billing rule % | Finance Mgr | Invoice generated | Service fee = gross payroll × 10% for TechPark | ⬜ | Critical | P0 |
| TC-1003 | GST = service fee × 18% | Finance Mgr | Invoice generated | GST line = service fee × 0.18 | ⬜ | Critical | P0 |
| TC-1004 | Invoice total = gross + service fee + GST | Finance Mgr | Invoice generated | Total reconciled exactly | ⬜ | Critical | P0 |
| TC-1005 | Invoice annexure — worker-wise breakdown | Finance Mgr | Invoice generated | Annexure lists each worker with days, gross, service fee | ⬜ | Critical | P0 |
| TC-1006 | Annexure sum = invoice header total | Finance Mgr | Annexure loaded | Sum of all annexure lines = invoice total | ⬜ | Critical | P0 |
| TC-1007 | Approve invoice | Finance Mgr | Invoice in draft | Invoice status = approved; approved_by recorded | ⬜ | High | P0 |
| TC-1008 | Invoice annexure CSV export | Finance Mgr | Invoice generated | CSV downloaded; worker-wise rows | ⬜ | High | P0 |
| TC-1009 | Generate invoices for all 3 clients | Finance Mgr | Locked batch | 3 invoices created with client-specific billing rules | ⬜ | High | P0 |
| TC-1010 | Invoice blocked on non-locked batch | Finance Mgr | Draft batch | Invoice generate returns 400 | ⬜ | Critical | P0 |
| TC-1011 | Finance Exec can view invoice (read-only) | Finance Exec | Invoice exists | Invoice list and detail visible; no approve/generate button | ⬜ | High | P0 |
| TC-1012 | Invoice list filter by status | Finance Mgr | Multiple invoices | Draft / approved filter works | ⬜ | Medium | P2 |

---

### TS-11 — Reports

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-1101 | Report catalog page loads | Admin | Logged in | /reports shows all available report tiles | ⬜ | High | P1 |
| TC-1102 | Payroll summary report | Payroll Mgr | Locked batch | Summary shows total gross, deductions, net for the month | ⬜ | High | P1 |
| TC-1103 | Worker payroll report | Payroll Mgr | Locked batch | Per-worker breakdown table loads | ⬜ | High | P1 |
| TC-1104 | Worker master report | Admin | Demo seed | All 20 workers listed with statutory info | ⬜ | High | P1 |
| TC-1105 | Missing worker data report — NX019, NX020 | Admin | Demo seed | Report flags NX019 (bank), NX020 (bank + salary) | ⬜ | High | P0 |
| TC-1106 | Payroll variance report — month comparison | Payroll Mgr | 2+ months | Variance %, amount change per worker shown | ⬜ | Medium | P2 |
| TC-1107 | Download center — file list | Admin | Files generated | /downloads shows bank files, payslips, compliance exports | ⬜ | High | P1 |
| TC-1108 | Report filter by month | Payroll Mgr | Multiple months | Month dropdown filters report correctly | ⬜ | Medium | P1 |
| TC-1109 | Audit log — sorted by date descending | Auditor | Actions taken | Most recent action at top | ⬜ | Medium | P1 |
| TC-1110 | Export log — sorted by date descending | Admin | Files downloaded | Most recent export at top | ⬜ | Medium | P1 |

---

### TS-12 — Dashboards

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-1201 | Finance dashboard — locked batch totals | Finance Mgr | June 2026 locked | Total gross, total net, invoices summary shown | ⬜ | Critical | P0 |
| TC-1202 | Finance dashboard — invoice status cards | Finance Mgr | Invoices generated | Draft / approved invoice counts accurate | ⬜ | High | P0 |
| TC-1203 | Payroll dashboard — batch status visible | Payroll Mgr | Locked batch | June 2026 shown as locked with totals | ⬜ | Critical | P0 |
| TC-1204 | Payroll dashboard — exception counts | Payroll Mgr | Exceptions resolved | Open vs resolved exception counts correct | ⬜ | High | P0 |
| TC-1205 | Compliance dashboard — violation counts | Compliance | Locked batch | PF / ESI / PT / LWF violation counts shown | ⬜ | High | P0 |
| TC-1206 | Executive dashboard — summary KPIs | Executive | Locked batch | Total workers, total gross, compliance status shown | ⬜ | High | P0 |
| TC-1207 | Workspace — recent audit log on dashboard | Admin | Actions taken | Last 5 audit actions shown on workspace | ⬜ | High | P1 |
| TC-1208 | Dashboard loads under 3 s at 20K workers | Admin | 20K seed | Load time < 3 s | ⬜ | High | P0 |
| TC-1209 | Dashboard loads under 3 s at 50K workers | Admin | 50K seed | Load time < 3 s | ⬜ | High | P0 |
| TC-1210 | Dashboard filter by month | Finance Mgr | Multiple batches | Month filter changes all dashboard values | ⬜ | Medium | P1 |

---

### TS-13 — Audit & Export Logs

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-1301 | Audit log — login action recorded | Admin | Login performed | Login event with userId, timestamp, IP in log | ⬜ | High | P1 |
| TC-1302 | Audit log — lock batch action recorded | Payroll Mgr | Batch locked | Audit entry: module=payroll, action=lock_batch | ⬜ | High | P0 |
| TC-1303 | Audit log — bank file generation recorded | Finance Mgr | Bank file generated | Audit entry: module=billing, action=generate_bank_file | ⬜ | High | P0 |
| TC-1304 | Audit log — user creation recorded | Admin | New user created | Audit entry: action=create_user | ⬜ | High | P1 |
| TC-1305 | Audit log — filter by module | Admin | Multiple modules | Module filter shows only selected module's entries | ⬜ | Medium | P1 |
| TC-1306 | Audit log — filter by user | Admin | Multiple users | User filter shows only selected user's entries | ⬜ | Medium | P1 |
| TC-1307 | Export log — bank file download recorded | Admin | File downloaded | Export log entry: type=bank_file_download, user, timestamp | ⬜ | High | P0 |
| TC-1308 | Export log — compliance CSV recorded | Admin | CSV downloaded | Export log entry: type=pf_report, user, timestamp | ⬜ | High | P1 |
| TC-1309 | File access log — visible to Admin and Auditor | Auditor | Files accessed | /file-access-log shows recent downloads | ⬜ | High | P1 |
| TC-1310 | Audit log — pagination at large scale | Auditor | 50K seed | Audit log paginates correctly; page 1 loads < 800 ms | ⬜ | High | P0 |

---

### TS-14 — Large Data

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-1401 | 20K seed — worker list page 1 | Admin | seed:20k run | Page 1 loads in < 800 ms with 100 workers | ⬜ | Critical | P0 |
| TC-1402 | 20K seed — payroll calculation | Payroll Exec | 20K seed, locked attendance | Payroll calc completes < 30 s | ⬜ | Critical | P0 |
| TC-1403 | 20K seed — bank file generation | Finance Mgr | 20K locked batch | Bank file generated < 10 s | ⬜ | Critical | P0 |
| TC-1404 | 20K seed — payslip generation | Payroll Mgr | 20K locked batch | Payslips generated < 20 s | ⬜ | Critical | P0 |
| TC-1405 | 20K seed — PF ECR report | Compliance | 20K locked batch | PF ECR loads < 8 s | ⬜ | Critical | P0 |
| TC-1406 | 20K seed — finance dashboard | Finance Mgr | 20K locked batch | Dashboard loads < 2 s | ⬜ | High | P0 |
| TC-1407 | 25K seed — worker list page 1 | Admin | seed:25k run | Page 1 loads < 800 ms | ⬜ | Critical | P0 |
| TC-1408 | 25K seed — payroll calculation | Payroll Exec | 25K locked attendance | Payroll calc < 40 s | ⬜ | Critical | P0 |
| TC-1409 | 25K seed — bank file generation | Finance Mgr | 25K locked batch | Bank file < 12 s | ⬜ | Critical | P0 |
| TC-1410 | 25K seed — compliance reports | Compliance | 25K locked batch | PF ECR, ESI, PT, LWF each < 10 s | ⬜ | High | P0 |
| TC-1411 | 50K seed — worker list page 1 | Admin | seed:50k run | Page 1 < 1 s | ⬜ | Critical | P0 |
| TC-1412 | 50K seed — payroll calculation | Payroll Exec | 50K locked attendance | Payroll calc < 90 s | ⬜ | Critical | P0 |
| TC-1413 | 50K seed — bank file generation | Finance Mgr | 50K locked batch | Bank file < 25 s | ⬜ | Critical | P0 |
| TC-1414 | 50K seed — payslip generation | Payroll Mgr | 50K locked batch | Payslips < 60 s | ⬜ | Critical | P0 |
| TC-1415 | 50K seed — PF ECR report | Compliance | 50K locked batch | PF ECR < 20 s | ⬜ | Critical | P0 |
| TC-1416 | 50K seed — invoice generation (all 3 clients) | Finance Mgr | 50K locked batch | All 3 invoices generated < 12 s each | ⬜ | Critical | P0 |
| TC-1417 | 50K seed — worker-wise annexure export | Finance Mgr | 50K invoice | Annexure CSV download < 20 s | ⬜ | Critical | P0 |
| TC-1418 | 50K seed — audit log pagination | Auditor | 50K seed, actions taken | Audit log page 1 < 800 ms | ⬜ | High | P0 |

---

### TS-15 — Performance

| TC-ID | Scenario | Volume | Target | Status | Sev | Pri |
|---|---|---|---|---|---|---|
| TC-1501 | Worker list p1 response time | 50K | < 1 s | ⬜ | High | P0 |
| TC-1502 | Worker list with name filter | 50K | < 1.5 s | ⬜ | High | P0 |
| TC-1503 | Payroll batch list | 50K | < 800 ms | ⬜ | High | P0 |
| TC-1504 | Payroll calculation timing | 50K | < 90 s | ⬜ | Critical | P0 |
| TC-1505 | Bank file generation timing | 50K | < 25 s | ⬜ | Critical | P0 |
| TC-1506 | Bank file download timing | 50K | < 12 s | ⬜ | High | P0 |
| TC-1507 | Payslip batch generation timing | 50K | < 60 s | ⬜ | Critical | P0 |
| TC-1508 | PF ECR generation timing | 50K | < 20 s | ⬜ | Critical | P0 |
| TC-1509 | ESI / PT / LWF report timing | 50K | < 16 s each | ⬜ | High | P0 |
| TC-1510 | Invoice generation per client | 50K | < 12 s | ⬜ | High | P0 |
| TC-1511 | Worker-wise annexure export | 50K | < 20 s | ⬜ | High | P0 |
| TC-1512 | Finance dashboard aggregate | 50K | < 3 s | ⬜ | High | P0 |
| TC-1513 | Payroll dashboard aggregate | 50K | < 3 s | ⬜ | High | P0 |
| TC-1514 | Audit log paginated list | 50K | < 800 ms | ⬜ | High | P0 |

---

### TS-16 — Load Testing

| TC-ID | Scenario | Concurrency | Target | Status | Sev | Pri |
|---|---|---|---|---|---|---|
| TC-1601 | All 50 users simultaneous login | 50 | < 0.5% error; p95 < 3 s | ⬜ | Critical | P0 |
| TC-1602 | 50 users browsing dashboards | 50 | p95 < 3 s | ⬜ | Critical | P0 |
| TC-1603 | Mixed session (30% read, 40% transactional, 30% export) | 50 | p95 < 3 s non-batch | ⬜ | Critical | P0 |
| TC-1604 | Peak: all users in payroll lock week | 50 | Error rate < 0.5% | ⬜ | Critical | P0 |
| TC-1605 | 50 users — worker list page loads | 50 | p95 < 1.5 s | ⬜ | High | P0 |
| TC-1606 | 10 concurrent payroll calculations | 10 | No race conditions; all complete | ⬜ | High | P0 |
| TC-1607 | 10 concurrent bank file downloads | 10 | All downloads succeed | ⬜ | High | P0 |
| TC-1608 | Session memory — server peak under load | 50 | Memory stable; no leak | ⬜ | High | P0 |

---

### TS-17 — Regression

| TC-ID | Scenario | Trigger | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|
| TC-1701 | Payroll calc correct after attendance fix | After attendance defect fix | Net pay still correct per worker | ⬜ | Critical | P0 |
| TC-1702 | Bank reconciliation correct after bank file fix | After bank file defect fix | reconciliation_status = reconciled | ⬜ | Critical | P0 |
| TC-1703 | RBAC not broken after permission change | After any RBAC fix | Finance Exec still blocked from download | ⬜ | Critical | P0 |
| TC-1704 | Locked batch enforcement after route changes | After billing route updates | Draft batch still blocked | ⬜ | Critical | P0 |
| TC-1705 | PF ECR calculation unchanged after calc engine fix | After calc fix | pfEmployee = pfWage × 12% | ⬜ | Critical | P0 |
| TC-1706 | Worker list pagination after server-side changes | After worker route updates | Page 1 returns correct 100 workers | ⬜ | High | P0 |
| TC-1707 | All 9 logins succeed after auth changes | After any auth change | All 9 primary logins work | ⬜ | Critical | P0 |
| TC-1708 | Audit log entries created after route changes | After route updates | Lock batch still creates audit entry | ⬜ | High | P1 |
| TC-1709 | Export log entries after billing route changes | After billing changes | Bank file download still logged | ⬜ | High | P1 |
| TC-1710 | Compliance reports at 20K after compliance fix | After compliance fix | PF ECR loads < 8 s at 20K | ⬜ | High | P0 |
| TC-1711 | Finance dashboard after aggregation fix | After dashboard fix | Dashboard totals correct | ⬜ | High | P0 |
| TC-1712 | Full smoke suite re-run after any code change | After any change | All TC-01xx pass | ⬜ | Critical | P0 |

---

### TS-18 — Demo Readiness

| TC-ID | Scenario | Role | Preconditions | Expected Result | Status | Sev | Pri |
|---|---|---|---|---|---|---|---|
| TC-1801 | End-to-end demo run — Admin | Admin | Demo seed | Workspace, org, clients, billing rules, users visible | ⬜ | Critical | P0 |
| TC-1802 | End-to-end demo — HR Exec worker tour | HR Exec | Demo seed | Worker list, detail, readiness flags (NX019, NX020) | ⬜ | Critical | P0 |
| TC-1803 | End-to-end demo — Payroll Exec attendance + calc | Payroll Exec | Demo seed | Upload attendance, view exceptions, calculate payroll | ⬜ | Critical | P0 |
| TC-1804 | End-to-end demo — Payroll Mgr approve + lock | Payroll Mgr | Calculated batch | Resolve exceptions, approve, lock, generate payslips | ⬜ | Critical | P0 |
| TC-1805 | End-to-end demo — Finance Mgr bank + invoice | Finance Mgr | Locked batch | Readiness panel, generate bank file, download, generate 3 invoices | ⬜ | Critical | P0 |
| TC-1806 | End-to-end demo — Finance Exec RBAC | Finance Exec | Bank file generated | Download blocked (403) confirmed in demo | ⬜ | Critical | P0 |
| TC-1807 | End-to-end demo — Compliance Officer | Compliance | Locked batch | PF ECR, ESI, PT, LWF, min-wage, export CSVs | ⬜ | Critical | P0 |
| TC-1808 | End-to-end demo — Auditor read-only | Auditor | Actions taken | Audit log, export log visible; no write access | ⬜ | Critical | P0 |
| TC-1809 | End-to-end demo — Executive summary | Executive | Locked batch | Executive dashboard shows summary KPIs | ⬜ | High | P0 |
| TC-1810 | All 9 demo roles ready — no blockers | All | All modules tested | Zero P0 defects open; all critical TCs pass | ⬜ | Critical | P0 |

---

## 7. Large-Data Test Plan

### 7.1 Test Sequence

Run in order (restore demo seed between runs):

```
1. pnpm --filter @workspace/scripts run seed:20k
2. Run TS-14 (TC-1401 to TC-1406) at 20K
3. Record timings in §5 of QA-PLAN.md

4. pnpm --filter @workspace/scripts run seed:25k
5. Run TS-14 (TC-1407 to TC-1410) at 25K
6. Record timings

7. pnpm --filter @workspace/scripts run seed:50k
8. Run TS-14 (TC-1411 to TC-1418) + TS-15 (all) at 50K
9. Record timings; flag any misses

10. pnpm --filter @workspace/scripts run seed    # restore demo
```

### 7.2 Pass / Fail Criteria

| Volume | Verdict | Criteria |
|---|---|---|
| 20K | ✅ Pass | All operations within target times; no errors |
| 25K | ✅ Pass | All operations within target times; no errors |
| 50K | ✅ Pass | All operations within target times; no errors |
| 50K | ⚠️ Conditional | Some operations 10-25% over target; documented as MVP limitation |
| Any | ❌ Fail | Error in operation (crash, timeout, wrong result) |

---

## 8. Performance Test Plan

### 8.1 Methodology
- Use browser DevTools Network tab for frontend load times
- Use `curl` with `-w "%{time_total}"` or a timing wrapper for API response times
- Use DB `EXPLAIN ANALYZE` for query-level bottlenecks
- Record p95 by running each operation 5 times and discarding the top result

### 8.2 Key Queries to Optimise (with index coverage)
| Query | Index Expected |
|---|---|
| Worker list by tenantId + status | `idx_workers_tenant_status` |
| Attendance by tenantId + month | `idx_attendance_tenant_month` |
| Payroll records by batchId | `idx_payroll_records_batch` |
| Audit log by tenantId + createdAt | `idx_audit_logs_tenant_created` |
| Export log by tenantId + createdAt | `idx_export_logs_tenant_created` |
| Invoice by tenantId + batchId | `idx_invoices_tenant_batch` |

### 8.3 Load Test Tooling
- Recommended: `k6` or `autocannon` for API load testing
- Session profile: 30% `GET /dashboard` type, 40% `POST /payroll` type, 30% `GET /download` type
- Ramp: 0 → 50 users over 30 s; sustain 50 users for 5 min; ramp down 30 s

---

## 9. QA Dashboard Reference

The in-app **QA Dashboard** (`/qa-dashboard`) is accessible to Tenant Admin and shows live QA status. Update `artifacts/payroll-nexus/src/lib/qa-metrics.ts` as testing progresses.

### 9.1 Metrics Shown
| Widget | Description |
|---|---|
| Total Test Cases | Count across all 18 suites (203 TCs) |
| Pass / Fail / Blocked / Not Run | Counts and percentages |
| Pass % | (Pass / (Total − Not Run)) × 100 |
| Defects by Severity | Critical / High / Medium / Low counts |
| Defects by Module | Which modules have open defects |
| Performance Summary | 20K / 25K / 50K per-operation results |
| Load Test Status | 50-user concurrency result |
| Final MVP Readiness | Green / Amber / Red verdict |

### 9.2 How to Update

Edit `artifacts/payroll-nexus/src/lib/qa-metrics.ts`:
1. Update `suites[].pass`, `suites[].fail`, `suites[].blocked` counts as TCs run
2. Add defects to the `defects[]` array with severity and module
3. Fill `volumeResults[]` with actual timing strings as each volume is tested
4. Update `loadTest` with actual result
5. The QA Dashboard page re-reads this file on each build

---

## 10. Out of Scope

- No new future-phase feature additions
- No multi-tenant isolation testing beyond the `nexus` tenant
- No production deployment smoke testing
- No mobile/responsive UI testing
- Karnataka LWF frequency (half-yearly) — pending engine change
- MH LWF SME sign-off — pending
- KA statutory SME sign-off — pending
