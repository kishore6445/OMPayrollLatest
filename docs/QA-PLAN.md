# Payroll Nexus MVP — QA Plan (QA-UPDATE-03)

**Tenant:** Nexus Staffing Services Pvt Ltd  
**Slug:** `nexus`  
**QA Scope:** Demo & Pilot Readiness — MVP spine only. No future-phase features.  
**Last Updated:** 2026-06-30

> **Instruction to QA:** Do not add new future-phase features. Focus only on testing, fixing, optimising, validating, and preparing the Payroll Nexus MVP for demo and pilot readiness.

---

## 1. Nexus Staffing Demo Credentials

> **These are demo/testing credentials only. Not for production use.**

### 1.1 Primary Demo Users (9) — Role-Specific Passwords

These 9 accounts are the canonical QA accounts. Each must be individually tested for every module accessible to that role.

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

### 1.2 Additional Demo Users (41) — All Password `Demo@123`

Sample at least 2 users per role during QA. Full list used for 50-concurrent-user load testing.

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
| **Total** | **41** | All password: `Demo@123` |

### 1.3 User Scale Summary

| Category | Count | Notes |
|---|---|---|
| **Total login users** | **50** | Used for load and role-coverage testing |
| Primary demo users | 9 | Role-specific passwords (§1.1) |
| Additional demo users | 41 | Password `Demo@123` (§1.2) |

---

## 2. Worker Scale — Three-Volume Test Datasets

All dashboards, reports, workflows, exports, payroll calculations, attendance validation, payslip generation, invoice generation, worker-wise annexure generation, audit logs, file downloads, database queries, and performance checks **must be tested at all three volumes**.

| Dataset | Workers | Purpose |
|---|---|---|
| Demo seed | 20 | Functional correctness, RBAC, calculations, UI |
| **Scale-20K** | **20,000** | **Minimum dataset** — performance baseline, real-world floor |
| **Scale-25K** | **25,000** | **Middle dataset** — common pilot target volume |
| **Scale-50K** | **50,000** | **Maximum dataset** — load ceiling, MVP upper limit |

### 2.1 Scale Seed Commands

```bash
pnpm --filter @workspace/scripts run seed:20k   # 20,000 workers
pnpm --filter @workspace/scripts run seed:25k   # 25,000 workers
pnpm --filter @workspace/scripts run seed:50k   # 50,000 workers
```

Each dataset is generated with:
- Workers distributed across 2 states (Karnataka / Maharashtra), 3 clients, 4 sites
- 80% monthly-wage workers, 20% daily-wage workers
- ~5% workers with missing bank details (bank readiness gap)
- ~2% workers with missing salary structures
- One locked attendance month per worker
- One locked payroll batch (exercises all output routes)

> Restore demo data after scale testing: `pnpm --filter @workspace/scripts run seed`

### 2.2 Performance Targets — All Three Volumes

| Operation | 20K | 25K | 50K |
|---|---|---|---|
| Worker master list (paginated, page 1) | < 800 ms | < 800 ms | < 1 s |
| Worker list with filters | < 1 s | < 1 s | < 1.5 s |
| Payroll calculation (full batch) | < 30 s | < 40 s | < 90 s |
| Payroll batch list | < 500 ms | < 500 ms | < 800 ms |
| Bank file generation | < 10 s | < 12 s | < 25 s |
| Bank file download (TXT) | < 5 s | < 6 s | < 12 s |
| Payslip batch generation | < 20 s | < 25 s | < 60 s |
| Payslip individual download | < 1 s | < 1 s | < 1 s |
| PF ECR export | < 8 s | < 10 s | < 20 s |
| ESI / PT / LWF reports | < 6 s | < 8 s | < 16 s |
| Invoice generation (per client) | < 5 s | < 6 s | < 12 s |
| Worker-wise annexure export | < 8 s | < 10 s | < 20 s |
| Audit log list (paginated) | < 500 ms | < 500 ms | < 800 ms |
| Export log list | < 500 ms | < 500 ms | < 800 ms |
| Finance dashboard aggregate | < 2 s | < 2 s | < 3 s |
| Payroll dashboard aggregate | < 2 s | < 2 s | < 3 s |
| Compliance dashboard aggregate | < 2 s | < 2 s | < 3 s |

### 2.3 Load Testing Assumptions

| Parameter | Value |
|---|---|
| Concurrent users | **50** (all 50 demo users simultaneously) |
| Session mix | 30% read-heavy (dashboards/reports), 40% transactional (payroll/attendance), 30% export (bank file/compliance/payslips) |
| Peak scenario | All 50 users active during payroll lock week (attendance upload → calculate → approve → lock in rapid succession) |
| Acceptable error rate | < 0.5% |
| p95 API response (non-batch endpoints) | < 3 s at 50 concurrent |
| p95 batch endpoints (payroll calc, bank gen, payslip gen) | see §2.2 per-operation targets |

---

## 3. QA Phase 1 — Setup & Baseline Validation (QA Prompt 1)

**Goal:** Confirm the environment is stable, all 50 users can log in, demo seed data is correct, and the system is ready for functional QA.

### 3.1 Expected Outputs

- **Revised credentials matrix** — all 9 primary roles verified login with role-specific passwords; 41 additional users verified with `Demo@123`
- **50-user test plan** — list of all 50 users with role, email, and test scope (primary: full module testing; additional: sampled login + role-restriction spot-check)
- **20K/25K/50K dataset readiness** — each scale seed script runs without error; counts verified in DB
- **Revised role-wise access matrix** — which modules and actions each of the 9 roles can access; which are blocked (403/404)
- **Revised performance test plan** — test harness/approach, target endpoints, timing methodology for all three volumes
- **Revised load test plan** — concurrency tooling, session profile, ramp-up pattern for 50 users
- **Revised QA dashboard metrics** — baseline read of all §11 metrics before testing begins

### 3.2 Checklist

| Check | Expected | Status |
|---|---|---|
| All 9 primary users log in successfully | 9 / 9 | — |
| All 41 additional users log in with `Demo@123` | 41 / 41 | — |
| Demo seed worker count correct (20 workers) | 20 | — |
| Demo seed payroll batch is `locked` (June 2026) | locked | — |
| Demo seed: NX019 missing bank, NX020 missing bank + salary | Flagged | — |
| Demo seed: May 2026 exceptions on NX001, NX005, NX010 | 3 open | — |
| Scale seed 20K runs without error; worker count in DB | 20,000 | — |
| Scale seed 25K runs without error; worker count in DB | 25,000 | — |
| Scale seed 50K runs without error; worker count in DB | 50,000 | — |
| TypeScript typecheck (full workspace) passes | Zero errors | — |
| API server health endpoint responds 200 | 200 | — |

---

## 4. QA Phase 2 — Functional Testing (QA Prompt 2)

**Goal:** Full coverage of every screen, form, workflow, and permission for all 9 primary roles using the 20-worker demo seed. Sampled coverage for additional users.

### 4.1 Expected Outputs

- Full testing of all 9 primary role logins across all accessible modules
- Sampled testing of additional users (at least 2 per role = 18 additional users tested)
- Functional testing across all screens and forms (create, read, update, list, filter, paginate)
- Document generation and download testing (payslips, bank file, compliance CSVs, invoice annexure)
- Role permission verification (each role sees exactly what it should; no privilege escalation)
- Direct URL access testing (unauthenticated and wrong-role direct URL attempts return correct errors)
- Tenant isolation testing (confirm no data leaks across tenants)
- Forms testing at large data scale (dropdowns, filters, and selects with 20K+ records load correctly)
- Dashboard and report testing confirmed correct at demo seed before scale testing

### 4.2 Authentication & RBAC

| Test | Roles | Status |
|---|---|---|
| Login with each primary demo user | All 9 | — |
| Login with 2 sampled additional users per role | All 9 roles | — |
| Incorrect password → 401 | Admin | — |
| Missing tenant slug → 400 | — | — |
| Role-restricted nav items hidden for unauthorised roles | All 9 | — |
| RBAC on `perm-finance-export` (Fin Exec 403, Fin Mgr 200) | Fin Exec, Fin Mgr | — |
| Direct URL to forbidden module → 403 | All 9 | — |
| Unauthenticated request → 401 | — | — |

### 4.3 Worker Master

| Test | Roles | Status |
|---|---|---|
| List workers (paginated, server-side filter) | Admin, HR, Payroll Exec | — |
| Worker detail — statutory profile, bank, assignment | Admin, HR | — |
| Worker missing bank details flagged (NX019, NX020) | Admin, HR | — |
| Worker import / onboard | Admin, HR | — |
| Search by name and worker code | Admin, HR | — |
| Filter by status | Admin, HR | — |
| Paginate through all pages | Admin | — |

### 4.4 Attendance

| Test | Roles | Status |
|---|---|---|
| Upload attendance for a month | Payroll Exec | — |
| Attendance exceptions visible (May 2026: NX001, NX005, NX010) | Payroll Exec, Payroll Mgr | — |
| Resolve attendance exception | Payroll Mgr | — |
| Attendance lock | Payroll Mgr | — |
| LWP auto-deducted in payroll calculation | Payroll Exec | — |

### 4.5 Payroll

| Test | Roles | Status |
|---|---|---|
| Create payroll batch (June 2026) | Payroll Exec | — |
| Calculation — monthly wage with LWP proration | Payroll Exec | — |
| Calculation — daily wage (NX017, NX018) | Payroll Exec | — |
| Payroll exceptions visible and resolvable | Payroll Exec, Payroll Mgr | — |
| Resolve payroll exception | Payroll Mgr | — |
| Approve batch | Payroll Mgr | — |
| Lock batch | Payroll Mgr | — |
| Draft batch blocks all output routes (400) | All output roles | — |
| Approved (non-locked) batch blocks all output routes (400) | All output roles | — |

### 4.6 Payslips

| Test | Roles | Status |
|---|---|---|
| Generate payslips for locked batch | Payroll Mgr, Admin | — |
| Payslip line items match payroll record | Payroll Mgr | — |
| Preview payslip dialog | Admin, Fin Exec | — |
| Download payslip CSV | Admin, Payroll Mgr | — |
| Export log entry created on payslip download | Admin, Auditor | — |

### 4.7 Bank Files

| Test | Roles | Status |
|---|---|---|
| Readiness panel: banked vs unbanked workers correct | Fin Mgr | — |
| Generate bank file (excludes NX019, NX020) | Fin Mgr | — |
| Bank file TXT: header total = sum of all D-line amounts | Fin Mgr | — |
| Reconciliation status = "reconciled" after generation | Fin Mgr | — |
| Download: Finance Exec 403, Finance Mgr 200 | Fin Exec, Fin Mgr | — |
| Download HDFC CSV format | Fin Mgr | — |
| Export log entry created on bank file download | Admin, Auditor | — |

### 4.8 Invoices

| Test | Roles | Status |
|---|---|---|
| Generate invoice for each client | Fin Mgr | — |
| Invoice annexure = worker-wise billing breakdown | Fin Mgr, Fin Exec | — |
| Annexure line-item sum = invoice header total | Fin Mgr | — |
| Service fee + GST calculation correct | Fin Mgr | — |
| Approve invoice | Fin Mgr | — |
| Export invoice annexure CSV | Fin Mgr | — |

### 4.9 Compliance Reports

| Test | Roles | Status |
|---|---|---|
| PF ECR: pfWage × 12% = pfEmployee for every row | Compliance, Admin | — |
| ESI report: 0.75% employee, 3.25% employer | Compliance | — |
| PT report: per-state slabs (KA / MH), byState breakdown | Compliance | — |
| LWF report: per-state amounts, byState breakdown | Compliance | — |
| Min-wage exceptions: per-state thresholds | Compliance, Payroll Mgr | — |
| All compliance reports blocked on draft / approved batch (400) | Compliance | — |
| CSV export for PF / ESI / PT / LWF | Compliance | — |

### 4.10 Dashboards & Reports

| Test | Roles | Status |
|---|---|---|
| Finance dashboard: locked batch aggregates correct | Fin Mgr, Fin Exec, Admin | — |
| Payroll dashboard: locked batch in totals | Payroll Mgr, Admin | — |
| Compliance dashboard: violation counts accurate | Compliance, Admin | — |
| Executive dashboard / summary | Executive | — |

### 4.11 Exports, Audit Logs & File Access Logs

| Test | Roles | Status |
|---|---|---|
| Export log entries created on bank file download | Admin, Auditor | — |
| Export log entries created on compliance CSV export | Admin, Auditor | — |
| Audit log: create user, generate bank file, lock payroll visible | Admin, Auditor | — |
| File access logs visible in admin panel | Admin, Auditor | — |
| Auditor role: read-only access confirmed (no write actions succeed) | Auditor | — |

---

## 5. QA Phase 3 — Performance & Load Testing (QA Prompt 3)

**Goal:** Confirm all operations meet targets at 20K, 25K, and 50K workers. Validate system under 50 concurrent users.

### 5.1 Expected Outputs

- Performance test results at 20K, 25K, and 50K worker volumes for every operation in §2.2
- Load test result: 50 concurrent users, error rate, p95 response time
- Query optimisation summary: slow queries identified and resolved (use DB EXPLAIN ANALYZE or query timing logs)
- Background job performance: payroll calculation, bank file generation, payslip batch (timing at all 3 volumes)
- Export performance: bank file download, compliance CSV, invoice annexure (timing at all 3 volumes)
- Dashboard performance: finance, payroll, compliance at all 3 volumes
- Report performance: PF ECR, ESI, PT, LWF at all 3 volumes
- Payroll calculation performance: full batch timing at all 3 volumes
- Attendance validation performance: upload + exception detection at all 3 volumes
- Documented MVP limitations if any target cannot be met

### 5.2 Worker List Performance

| Volume | Filter | Pagination | Result | Target | Status |
|---|---|---|---|---|---|
| 20K | None | Page 1 | — ms | < 800 ms | — |
| 20K | Name search | Page 1 | — ms | < 1 s | — |
| 25K | None | Page 1 | — ms | < 800 ms | — |
| 25K | Status filter | Page 1 | — ms | < 1 s | — |
| 50K | None | Page 1 | — ms | < 1 s | — |
| 50K | Name + status | Page 1 | — ms | < 1.5 s | — |

### 5.3 Payroll Calculation Performance

| Volume | Result | Target | Status |
|---|---|---|---|
| 20K workers | — s | < 30 s | — |
| 25K workers | — s | < 40 s | — |
| 50K workers | — s | < 90 s | — |

### 5.4 Bank File Performance

| Volume | Generate | Download (TXT) | Result | Target | Status |
|---|---|---|---|---|---|
| 20K | — s | — s | — | < 10 s gen / < 5 s dl | — |
| 25K | — s | — s | — | < 12 s gen / < 6 s dl | — |
| 50K | — s | — s | — | < 25 s gen / < 12 s dl | — |

### 5.5 Payslip Generation Performance

| Volume | Result | Target | Status |
|---|---|---|---|
| 20K workers | — s | < 20 s | — |
| 25K workers | — s | < 25 s | — |
| 50K workers | — s | < 60 s | — |

### 5.6 Compliance Report Performance

| Report | 20K | 25K | 50K | Target (50K) | Status |
|---|---|---|---|---|---|
| PF ECR | — s | — s | — s | < 20 s | — |
| ESI report | — s | — s | — s | < 16 s | — |
| PT report | — s | — s | — s | < 16 s | — |
| LWF report | — s | — s | — s | < 16 s | — |

### 5.7 Invoice & Annexure Performance

| Volume | Invoice Gen | Annexure Export | Target | Status |
|---|---|---|---|---|
| 20K | — s | — s | < 5 s gen / < 8 s export | — |
| 25K | — s | — s | < 6 s gen / < 10 s export | — |
| 50K | — s | — s | < 12 s gen / < 20 s export | — |

### 5.8 Dashboard Performance

| Dashboard | 20K | 25K | 50K | Target (50K) | Status |
|---|---|---|---|---|---|
| Finance dashboard | — ms | — ms | — ms | < 3 s | — |
| Payroll dashboard | — ms | — ms | — ms | < 3 s | — |
| Compliance dashboard | — ms | — ms | — ms | < 3 s | — |

### 5.9 Audit & Export Log Performance

| Operation | 20K | 25K | 50K | Target (50K) | Status |
|---|---|---|---|---|---|
| Audit log list (paginated) | — ms | — ms | — ms | < 800 ms | — |
| Export log list | — ms | — ms | — ms | < 800 ms | — |

### 5.10 Load Test — 50 Concurrent Users

| Metric | Result | Target | Status |
|---|---|---|---|
| Concurrent sessions | — | 50 | — |
| Error rate | — % | < 0.5% | — |
| p95 API response (non-batch) | — ms | < 3000 ms | — |
| p95 dashboard load | — ms | < 3000 ms | — |
| p95 payroll list | — ms | < 3000 ms | — |
| Peak memory (server) | — MB | Documented | — |
| Peak CPU (server) | — % | Documented | — |

---

## 6. QA Phase 4 — Defect Fix & Optimisation (QA Prompt 4)

**Goal:** Triage, fix, and re-test all defects found during Phases 2 and 3.

### 6.1 Expected Outputs

- Fixed defects at 20K, 25K, and 50K worker volumes
- Fixed role-based login issues (wrong nav, wrong permission gates)
- Fixed 50-user load issues (connection pool, query timeout, session contention)
- Fixed dashboard/report/export performance issues (index gaps, N+1 queries, missing aggregations)
- Re-verified all Phase 2 checklist items that failed
- Re-run performance benchmarks for all fixed endpoints; confirm targets met
- Defect log with severity, root cause, fix summary, and re-test result

### 6.2 Defect Log Template

| # | Severity | Module | Volume | Description | Root Cause | Fix Applied | Re-test | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | — | — | — | — | — | — | — | — |

**Severity levels:** Critical (blocks demo), High (wrong result / data corruption), Medium (UX / performance miss), Low (cosmetic)

### 6.3 Performance Fix Checklist

| Area | Issue Found | Fix Applied | Target Met | Status |
|---|---|---|---|---|
| Worker list query | — | — | — | — |
| Payroll calc | — | — | — | — |
| Bank file generation | — | — | — | — |
| Payslip generation | — | — | — | — |
| PF ECR query | — | — | — | — |
| Dashboard aggregates | — | — | — | — |
| Audit log query | — | — | — | — |
| Load (50 concurrent) | — | — | — | — |

---

## 7. QA Phase 5 — Final Demo Readiness (QA Prompt 5)

**Goal:** Full end-to-end demo run using the 9 primary demo users, final load confidence pass, and documented confirmation that all three worker volumes work (or have documented MVP limitations).

### 7.1 Expected Outputs

- End-to-end demo run with all 9 primary demo users — every module exercised in sequence
- Final load confidence: run all 50 users simultaneously; confirm error rate < 0.5%
- 20K result: pass / fail / limitation documented
- 25K result: pass / fail / limitation documented
- 50K result: pass / fail / limitation documented
- Documented MVP limitations (if any target cannot be met, document the actual number and mark as known limitation — not a blocker if outside the demo path)
- Final screenshot / screen-record of key demo flows (optional but recommended)

### 7.2 Demo Run Sequence (9 Primary Roles)

| Step | Role | Action | Expected | Status |
|---|---|---|---|---|
| 1 | Tenant Admin | Login, view dashboard, verify org/client/site setup | Dashboard loads | — |
| 2 | HR Executive | Login, browse worker list, view worker detail (NX001) | Worker detail correct | — |
| 3 | HR Executive | Check readiness gaps (NX019 missing bank, NX020 missing bank+salary) | Flagged in UI | — |
| 4 | Payroll Executive | Login, upload attendance (June 2026), view exceptions | Exceptions visible | — |
| 5 | Payroll Manager | Login, resolve exceptions, lock attendance | Attendance locked | — |
| 6 | Payroll Executive | Calculate payroll batch (June 2026) | Calculation runs | — |
| 7 | Payroll Manager | Review exceptions, approve batch, lock batch | Batch locked | — |
| 8 | Payroll Manager | Generate payslips, preview NX001 payslip | Payslip correct | — |
| 9 | Finance Manager | Login, view bank readiness, generate bank file | Bank file generated | — |
| 10 | Finance Manager | Verify reconciliation status = reconciled | Reconciled | — |
| 11 | Finance Manager | Download bank file (TXT) | Download succeeds | — |
| 12 | Finance Executive | Attempt bank file download → 403 | 403 returned | — |
| 13 | Finance Manager | Generate invoice for Client A, view annexure | Invoice correct | — |
| 14 | Finance Manager | Approve invoice, export annexure CSV | Export succeeds | — |
| 15 | Compliance Officer | Login, view PF ECR, verify calculations | PF ECR correct | — |
| 16 | Compliance Officer | View ESI, PT, LWF reports, export CSVs | CSVs download | — |
| 17 | Auditor | Login, view audit log, view export log | Logs visible | — |
| 18 | Auditor | Attempt any write action → blocked | 403 or hidden | — |
| 19 | Executive | Login, view executive summary dashboard | Dashboard loads | — |
| 20 | Tenant Admin | View audit trail for all above actions | Actions visible | — |

### 7.3 Final Volume Confirmation

| Volume | Payroll Calc | Bank File | Payslips | Compliance | Invoice | Dashboard | Result |
|---|---|---|---|---|---|---|---|
| 20K | — | — | — | — | — | — | ⬜ Pending |
| 25K | — | — | — | — | — | — | ⬜ Pending |
| 50K | — | — | — | — | — | — | ⬜ Pending |

---

## 8. QA Phase 6 — Sign-off & Report (QA Prompt 6)

**Goal:** Produce the final QA sign-off report with exact results, readiness decision, and any documented limitations.

### 8.1 Expected Outputs

- Exact Nexus Staffing demo credentials confirmed and documented
- Total login users confirmed: ~50 (9 primary + 41 additional)
- Worker scale tested: 20K, 25K, 50K
- 20K result: Pass / Conditional / Fail (with notes)
- 25K result: Pass / Conditional / Fail (with notes)
- 50K result: Pass / Conditional / Fail (with notes)
- 50-user load test result: Pass / Conditional / Fail (error rate, p95)
- Role-wise readiness: each of 9 roles confirmed ready for demo
- Performance readiness: each target met / missed / documented limitation
- Final MVP readiness decision: **MVP READY** / **CONDITIONAL** / **NOT READY**

### 8.2 Final Sign-off Report

```
QA Run: _______________
Date:   _______________
Tester: _______________
Version: QA-UPDATE-03

CREDENTIALS CONFIRMED
  Tenant slug:                      nexus
  Primary demo users:               9  (role-specific passwords — see §1.1)
  Additional demo users:            41 (password: Demo@123)
  Total login users:                50

USER TESTING
  Primary users login-tested:       ___ / 9
  Primary users module-tested:      ___ / 9
  Additional users sampled:         ___ / 18 (2 per role minimum)
  All 50 users load-tested:         [ ] Pass  [ ] Fail

WORKER DATASET RESULTS
  20K dataset — payroll calc:       [ ] Pass  [ ] Fail  Time: ___
  20K dataset — bank file:          [ ] Pass  [ ] Fail  Time: ___
  20K dataset — payslips:           [ ] Pass  [ ] Fail  Time: ___
  20K dataset — compliance:         [ ] Pass  [ ] Fail  Time: ___
  20K dataset — dashboards:         [ ] Pass  [ ] Fail  Time: ___
  20K dataset — invoices:           [ ] Pass  [ ] Fail  Time: ___
  20K RESULT:                       [ ] Pass  [ ] Conditional  [ ] Fail
  
  25K dataset — payroll calc:       [ ] Pass  [ ] Fail  Time: ___
  25K dataset — bank file:          [ ] Pass  [ ] Fail  Time: ___
  25K dataset — payslips:           [ ] Pass  [ ] Fail  Time: ___
  25K dataset — compliance:         [ ] Pass  [ ] Fail  Time: ___
  25K dataset — dashboards:         [ ] Pass  [ ] Fail  Time: ___
  25K dataset — invoices:           [ ] Pass  [ ] Fail  Time: ___
  25K RESULT:                       [ ] Pass  [ ] Conditional  [ ] Fail
  
  50K dataset — payroll calc:       [ ] Pass  [ ] Fail  Time: ___
  50K dataset — bank file:          [ ] Pass  [ ] Fail  Time: ___
  50K dataset — payslips:           [ ] Pass  [ ] Fail  Time: ___
  50K dataset — compliance:         [ ] Pass  [ ] Fail  Time: ___
  50K dataset — dashboards:         [ ] Pass  [ ] Fail  Time: ___
  50K dataset — invoices:           [ ] Pass  [ ] Fail  Time: ___
  50K RESULT:                       [ ] Pass  [ ] Conditional  [ ] Fail

LOAD TEST — 50 CONCURRENT USERS
  Error rate:                       ___ %    Target: < 0.5%
  p95 non-batch response:           ___ ms   Target: < 3000 ms
  p95 dashboard load:               ___ ms   Target: < 3000 ms
  LOAD RESULT:                      [ ] Pass  [ ] Conditional  [ ] Fail

ROLE-WISE DEMO READINESS
  Tenant Admin:                     [ ] Ready  [ ] Issues: ___
  HR Executive:                     [ ] Ready  [ ] Issues: ___
  Payroll Executive:                [ ] Ready  [ ] Issues: ___
  Payroll Manager:                  [ ] Ready  [ ] Issues: ___
  Finance Executive:                [ ] Ready  [ ] Issues: ___
  Finance Manager:                  [ ] Ready  [ ] Issues: ___
  Compliance Officer:               [ ] Ready  [ ] Issues: ___
  Auditor:                          [ ] Ready  [ ] Issues: ___
  Executive:                        [ ] Ready  [ ] Issues: ___

PERFORMANCE TARGETS MET
  Worker list (50K, p1):            [ ] Met  [ ] Miss — actual: ___
  Payroll calc (50K):               [ ] Met  [ ] Miss — actual: ___
  Bank file gen (50K):              [ ] Met  [ ] Miss — actual: ___
  Bank file download (50K):         [ ] Met  [ ] Miss — actual: ___
  Payslip batch gen (50K):          [ ] Met  [ ] Miss — actual: ___
  PF ECR (50K):                     [ ] Met  [ ] Miss — actual: ___
  Dashboard (50K):                  [ ] Met  [ ] Miss — actual: ___
  Invoice + annexure (50K):         [ ] Met  [ ] Miss — actual: ___

DOCUMENTED MVP LIMITATIONS (if any)
  ___

DEFECTS OUTSTANDING
  Critical:   ___
  High:       ___
  Medium:     ___
  Low:        ___

FINAL VERDICT
  [ ] MVP READY      — all targets met; demo and pilot readiness confirmed
  [ ] CONDITIONAL    — minor issues documented; safe for demo, resolve before pilot
  [ ] NOT READY      — blocking issues found; cannot proceed to demo

Signed off by: _______________
Date: _______________
```

---

## 9. QA Dashboard — Status Summary

> Update as testing progresses across all 6 phases.

| Metric | Value | Status |
|---|---|---|
| **Total login users seeded** | 50 | ✅ Done |
| **Primary demo users (9) — login verified** | 0 / 9 | ⬜ Pending |
| **Primary demo users (9) — module-tested** | 0 / 9 | ⬜ Pending |
| **Additional users (41) — sampled login verified** | 0 / 18 (2 per role) | ⬜ Pending |
| **All 50 users — simultaneous load test** | — | ⬜ Pending |
| **Functional QA (20-worker demo seed)** | — | ⬜ Pending |
| **20,000-worker dataset — seeded** | — | ⬜ Pending |
| **20,000-worker dataset — payroll calc** | — | ⬜ Pending |
| **20,000-worker dataset — bank file** | — | ⬜ Pending |
| **20,000-worker dataset — payslips** | — | ⬜ Pending |
| **20,000-worker dataset — compliance reports** | — | ⬜ Pending |
| **20,000-worker dataset — dashboards** | — | ⬜ Pending |
| **20,000-worker dataset — invoices** | — | ⬜ Pending |
| **25,000-worker dataset — seeded** | — | ⬜ Pending |
| **25,000-worker dataset — payroll calc** | — | ⬜ Pending |
| **25,000-worker dataset — bank file** | — | ⬜ Pending |
| **25,000-worker dataset — compliance reports** | — | ⬜ Pending |
| **25,000-worker dataset — dashboards** | — | ⬜ Pending |
| **50,000-worker dataset — seeded** | — | ⬜ Pending |
| **50,000-worker dataset — payroll calc** | — | ⬜ Pending |
| **50,000-worker dataset — bank file** | — | ⬜ Pending |
| **50,000-worker dataset — payslips** | — | ⬜ Pending |
| **50,000-worker dataset — compliance reports** | — | ⬜ Pending |
| **50,000-worker dataset — dashboards** | — | ⬜ Pending |
| **50,000-worker dataset — invoices + annexure** | — | ⬜ Pending |
| **50,000-worker dataset — audit log pagination** | — | ⬜ Pending |
| **Performance targets met (all modules, all volumes)** | — | ⬜ Pending |
| **Load test: 50 concurrent users, < 0.5% error** | — | ⬜ Pending |
| **TypeScript typecheck (full workspace)** | Pass | ✅ Pass |
| **RBAC spot-check (`perm-finance-export`)** | Pass | ✅ Pass |
| **Bank file reconciliation** | Reconciled | ✅ Pass |
| **Invoice annexure reconciliation** | Reconciled | ✅ Pass |
| **PF ECR reconciliation** | Pass | ✅ Pass |
| **State compliance (KA + MH)** | Pass | ✅ Pass |
| **MH PT SME sign-off** | Confirmed | ✅ Done |
| **DB composite indexes (all tables)** | Added + migrated | ✅ Done |
| **Workers API server-side pagination** | page/pageSize, DB-level | ✅ Done |
| **Scale seed scripts (20K/25K/50K)** | scripts/src/seed-scale.ts | ✅ Done |
| **Reports route DB-level sort/filter** | audit + export logs | ✅ Done |
| **Final MVP readiness** | — | ⬜ Pending |

---

## 10. Out of Scope (MVP)

The following are explicitly excluded from this QA pass per user direction:

- No new future-phase feature additions
- No multi-tenant isolation testing beyond the `nexus` tenant
- No production deployment smoke testing (use deployed URL separately)
- No mobile/responsive UI testing
- Karnataka LWF frequency (half-yearly) — pending engine change
- MH LWF SME sign-off — pending
- KA statutory SME sign-off — pending
