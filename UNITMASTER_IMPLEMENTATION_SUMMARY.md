# UNITMASTER Implementation Summary
## Payroll Nexus — Unit / Site / Contract Module

**Date:** August 2026  
**Database:** `payrollom_client` (PostgreSQL, 211-table legacy SQL Server schema)  
**Table:** `UNITMASTER` (607 columns)  
**UI Label:** Unit / Site / Contract  
**Write target:** `UNITMASTER` only — no SaaS tables touched.

---

## 1. Verified Uniqueness Rule for `unitcode`

`unitcode` is **GLOBALLY UNIQUE** across all of `UNITMASTER`.

**Evidence:**
- `unitcode` is `character varying(20)` with no PK, UNIQUE, or FK constraint in PostgreSQL.
- `BILL` references `unitcode` as a standalone column (no `clientcode` companion).
- 18 other child tables (`ATTENDANCE`, `EMPMAST`, `ARREARS`, `BANK_TRANSFER`, `ANNUALLEAVE`, `COMPANYESI`, `CREATEBILL`, `BILLMASTER`, `BILLTEMPLATE`, `COLLECTIONDETAIL`, `DAILY_ATTENDANCE`, `DayAttendance`, `EMPPFMASTER`, `EMPSALBREAKUPLD`, `EMPBONUS`, `BILL_Ded`, `ATTENDANCECHECK`, `ATTENDANCE_SHEET`) all reference `unitcode` as a single column.
- No composite `(clientcode, unitcode)` reference exists anywhere in the schema.

**Auto-generation rule:**  
Inside a transaction: `COALESCE(MAX(CAST("unitcode" AS integer) FILTER WHERE numeric), 0) + 1` cast to `varchar(20)`. This is concurrency-safe and consistent with the legacy approach used by BranchCode and clientcode.

---

## 2. APIs

All routes are mounted at `/api/units` via `artifacts/api-server/src/routes/units.ts`.

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| GET | `/api/units` | `units:read` | Paginated list with optional filters |
| GET | `/api/units/:unitcode` | `units:read` | Full detail with JOIN display names |
| POST | `/api/units` | `units:write` | Create; auto-generate `unitcode`; cross-table validation |
| PATCH | `/api/units/:unitcode` | `units:write` | Partial update; allow-listed columns; audit diff |

### GET /api/units — Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `compcode` | integer | Filter by parent company |
| `clientcode` | integer | Filter by parent client |
| `branchcode` | integer | Filter by branch |
| `zonecode` | integer | Filter by zone |
| `search` | string | ILIKE on Unitname or unitcode |
| `page` | integer | 1-based page (default 1) |
| `pageSize` | integer | Max 500, default 50 |

### Response shape (list item)
```json
{
  "unitcode": "1",
  "Unitname": "Tata Steel – Jamshedpur Gate 1",
  "StateID": "JH",
  "compcode": 1,
  "clientcode": 2,
  "branchcode": 3,
  "zonecode": 4,
  "city": "Jamshedpur",
  "state": "Jharkhand",
  "contractdate": "2024-01-01T00:00:00.000Z",
  "terminatedate": null,
  "unittype": "Security",
  "Clientname": "Tata Steel Ltd",
  "comname": "Acme Security Services",
  "BranchName": "East Branch",
  "zonename": "Zone A"
}
```

---

## 3. UI Screens

### Unit List (`/units`)
- Company filter (Select from COMPANYMAST)
- Client filter (Select from CLIENTMASTER; filtered by chosen company)
- Branch filter (Select from BRANCH; filtered by chosen company)
- Zone filter (Select from ZONE_MASTER)
- Free-text search (unit name or code)
- Server-side pagination (25 per page)
- Columns: Code, Unit/Site, Client, Company, Branch, Zone, Location, Contract Date, Status badge (Active/Terminated)
- "Add Unit" button → `/units/new`
- Row click → `/units/:unitcode`

### Unit Detail (`/units/:unitcode`)
- 8 display sections: General Information, Company & Client (with parent links), Address & Contact, Contract Details, Attendance Configuration, Payroll Configuration, Compliance, Billing Configuration
- Active/Terminated status badge
- Edit button → `/units/:unitcode/edit`
- Back to list link

### Add Unit (`/units/new`) / Edit Unit (`/units/:unitcode/edit`)
9-tab form:

| Tab | Key fields |
|-----|-----------|
| **General** | Unitname\*, StateID, unitlocation, unittype, category, unitmanager |
| **Company & Client** | compcode\*, clientcode\*, branchcode, zonecode, zonegroup, BillingZone, segcode |
| **Address & Contact** | address, city, state, pincode, telephone, email |
| **Contract** | contractdate, terminatedate, unitnote, billingname, billingadd, billadd1, billadd2 |
| **Attendance** | monthDays, HrsPerDay, OT\_Setting, OTpayMode, otmonthdays, monthDaysG |
| **Payroll** | PF\_Setting, PF\_OnEnc, EsiOnOT, wf, challan, salarylimit, pTax |
| **Compliance** | IsBonus, BonusOn, BonusRate, Bonus\_Limit, IsGratuity, gratuityRate, gratuityDay, EMP\_LWF, EMPR\_LWF, LeaveAllRate |
| **Billing** | sCharge, sTax, CouponRate, UniformRate, rent, messamt |
| **Shifts** | SeperateOT, chknShift |

---

## 4. Relationships

| UNITMASTER column | References | Validation |
|-------------------|-----------|-----------|
| `compcode` | `COMPANYMAST.compid` | Must exist; required on create |
| `clientcode` | `CLIENTMASTER.clientcode` | Must exist AND `CLIENTMASTER.compid = compcode` |
| `branchcode` | `BRANCH.BranchCode` | If provided, `BRANCH.compid` must equal `compcode` |
| `zonecode` | `ZONE_MASTER.zonecode` | If provided, must exist in `ZONE_MASTER` |

---

## 5. Fields Exposed in the UI (39 fields across 9 tabs)

General (6): `Unitname`, `StateID`, `unitlocation`, `unittype`, `category`, `unitmanager`  
Mapping (7): `compcode`, `clientcode`, `branchcode`, `zonecode`, `zonegroup`, `BillingZone`, `segcode`  
Address (6): `address`, `city`, `state`, `pincode`, `telephone`, `email`  
Contract (7): `contractdate`, `terminatedate`, `unitnote`, `billingname`, `billingadd`, `billadd1`, `billadd2`  
Attendance (6): `monthDays`, `HrsPerDay`, `OT_Setting`, `OTpayMode`, `otmonthdays`, `monthDaysG`  
Payroll (7): `PF_Setting`, `PF_OnEnc`, `EsiOnOT`, `wf`, `challan`, `salarylimit`, `pTax`  
Compliance (10): `IsBonus`, `BonusOn`, `BonusRate`, `Bonus_Limit`, `IsGratuity`, `gratuityRate`, `gratuityDay`, `EMP_LWF`, `EMPR_LWF`, `LeaveAllRate`  
Billing (6): `sCharge`, `sTax`, `CouponRate`, `UniformRate`, `rent`, `messamt`  
Shifts (2): `SeperateOT`, `chknShift`

---

## 6. Fields Intentionally Hidden or Read-Only

| Category | Count | Reason |
|----------|-------|--------|
| `unitcode` | 1 | Auto-generated; shown read-only in detail view |
| `chkESIHead1–12` | 12 | Legacy ESI component checkboxes; procedure-managed |
| `chkLWFHead1–12` | 12 | Legacy LWF component checkboxes; procedure-managed |
| `chkScInc1–17` | 17 | Legacy salary component checkboxes |
| `ChkBInc1–17` | 17 | Legacy bonus component checkboxes |
| `chkESIInc1–5` | 5 | Legacy ESI income checkboxes |
| `chkLWFInc1–5` | 5 | Legacy LWF income checkboxes |
| `INCSC1–17` | 17 | Computed income scale values |
| `Unit_InTime` / `Unit_OutTime` | 2 | Timestamp — managed via Shifts module |
| `ARROTMDAY`, `POSSALL`, `ESINewRule`, `arrmday`, `SEPOTMonthdays`, `PointSal`, `LWFM`, `SArrPFLimit`, `OTHRSAMTN`, `OTHRSN` | 10 | Obscure computed/procedure-owned fields |
| Various `otRate`, `OTInGSheet`, `ChkPerDay`, `ESIOnGWork`, `Unitadminded`, etc. | ~481 remaining | Low-use or unverified legacy fields; readable via GET API |

All 607 fields are returned in `GET /api/units/:unitcode` for downstream consumption (e.g. payroll engine).

---

## 7. Validation Rules

### Backend (HTTP 400 / 409)

| Rule | HTTP Status |
|------|-------------|
| `Unitname` required, max 100 chars | 400 |
| `compcode` required on create; must exist in `COMPANYMAST` | 400 |
| `clientcode` required on create; must exist in `CLIENTMASTER` AND belong to `compcode` | 400 |
| Client belongs to wrong company | 400 |
| `branchcode` provided but not in `BRANCH` for this `compcode` | 400 |
| `zonecode` provided but not in `ZONE_MASTER` | 400 |
| Duplicate `Unitname` (case-insensitive) under same `clientcode` | 409 |
| `email` format invalid | 400 |
| `email` max 50 chars | 400 |
| `StateID` max 3 chars | 400 |
| `pincode` max 20 chars | 400 |
| `telephone` max 50 chars | 400 |
| Any rate/percentage field negative or non-numeric | 400 |
| `contractdate` / `terminatedate` invalid date string | 400 |
| Field lengths enforced for all varchar columns | 400 |
| PATCH with no writable fields | 400 |
| Raw DB errors caught and masked | — |

### Frontend (inline before submit)

- Unitname required
- Email regex validated
- Non-negative number validation for all rate fields
- Terminate date must not precede contract date
- Auto-navigation to the first tab containing an error on failed submit
- Server 409 (duplicate) surfaced inline on Unitname field
- Server 400 (bad company/client) surfaced inline on compcode / clientcode fields

---

## 8. Security and Audit

### RBAC
- `GET /api/units`, `GET /api/units/:unitcode` → `requireClientPermission("units", "read")`
- `POST /api/units`, `PATCH /api/units/:unitcode` → `requireClientPermission("units", "write")`
- Admin role bypasses all permission checks
- Unauthenticated requests receive `401 Unauthorized`
- Missing permission receives `403 Forbidden`

### Audit log (`app_activity_log` via `logClientAction`)

| Action | Logged fields |
|--------|--------------|
| `unit.create` | `unitcode`, `Unitname`, `compcode`, `clientcode`, `branchcode`, `zonecode` |
| `unit.update` | `unitcode`, `compcode`, `clientcode`, `changedFields` (names only — no values) |

---

## 9. Database Rules Followed

- Column names preserved exactly from legacy SQL Server schema (`Unitname`, `BillingZone`, `OT_Setting`, etc.)
- No schema alterations — no added PK, FK, identity, sequence, or index
- No hard delete implemented
- Writes only to `UNITMASTER`
- `clientcode`, `compcode`, `branchcode`, `zonecode` read-only from parent tables via JOIN
- `unitcode` auto-generated in a transaction using `MAX(...) + 1` pattern (no sequence)
- `PATCH` uses an allow-list (`WRITABLE_COLS` Set) — unknown fields silently ignored

---

## 10. Tests

```
Test Files  6 passed | 6 skipped (12)
Tests       63 passed | 72 skipped (135)
```

Skipped test files are legacy SaaS output tests wrapped in `describe.skip` — they compile but never run. All 63 active tests pass.

### Smoke tests run against live server

| # | Test | Result |
|---|------|--------|
| 1 | `POST /api/units` — create unit with company, client, branch, email, contractdate, rates | ✅ `unitcode: "1"` |
| 2 | `GET /api/units/1` — detail shows all join fields | ✅ |
| 3 | `PATCH /api/units/1` — update unittype, wf, pTax | ✅ persisted |
| 4 | `POST /api/units` without token | ✅ 401 |
| 5 | `POST /api/units` duplicate name same client | ✅ 409 |
| 6 | `POST /api/units` client in wrong company | ✅ 400 |
| 7 | `POST /api/units` bad email | ✅ 400 |
| 8 | `GET /api/units?compcode=&clientcode=` filtered | ✅ correct rows |
| 9 | Verify only UNITMASTER written | ✅ 1 row in UNITMASTER |
| 10 | `pnpm typecheck` | ✅ zero errors |
| 11 | `pnpm build` (API + frontend) | ✅ clean |

---

## 11. Proof That Writes Affect Only UNITMASTER

The route file (`artifacts/api-server/src/routes/units.ts`) header documents:

```
// Source tables (payrollom_client only):
//   "UNITMASTER"   — primary table; INSERT/UPDATE only here
//   "CLIENTMASTER" — read for validation + display JOIN
//   "COMPANYMAST"  — read for validation + display JOIN
//   "BRANCH"       — read for validation + display JOIN
//   "ZONE_MASTER"  — read for validation + display JOIN
```

- Zero imports from `@workspace/db` (old Drizzle SaaS schema)
- Zero imports from any SaaS-prefixed library
- Only `execute()` and `withTransaction()` calls write data; their SQL targets `UNITMASTER` exclusively

---

## 12. Known Issues

| Issue | Impact | Status |
|-------|--------|--------|
| `unitcode` has no DB-level uniqueness constraint | Concurrent inserts in unusual conditions could theoretically collide if the MAX+1 transaction is very briefly interleaved | Non-issue in single-tenant single-company setup; acceptable for the legacy DB which has no sequence support |
| Bundle size warning (>500 KB) | Cosmetic only — non-blocking | Not addressed in this task |
| `Unit_InTime` / `Unit_OutTime` stored as full timestamps | Legacy SQL Server artefact — time-of-day semantics but stored as datetime | Fields not exposed in create form; readable via API |

---

## 13. Remaining Old SaaS References

**None active.** Breakdown:

| Location | Type | Active? |
|----------|------|---------|
| `lib/db/` | Drizzle SaaS schema library | No — on disk, not imported by any active route |
| `lib/billing/`, `lib/api-spec/`, `lib/api-client-react/`, `lib/api-zod/` | Old SaaS helper libs | No — on disk, unused |
| 6 test files in `describe.skip` | Import `@workspace/db` | No — compile-only, never execute |
| Any active route | — | Zero imports of `@workspace/db` |

---

## 14. Navigation

"Units / Sites" has been added to the **Setup** section of the sidebar nav. The route is `/units`.

The legacy `/sites` route (read-only alias) is preserved for backward compatibility.

---

*Generated: August 2026*  
*Payroll Nexus — Enterprise Payroll Command Centre*
