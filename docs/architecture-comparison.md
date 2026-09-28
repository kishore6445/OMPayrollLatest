# Architecture Comparison: Payroll Nexus ↔ PAYROLLDATA_OM (Client SQL Server)

> **Status:** Analysis only. No migrations or code changes. Awaiting approval before any implementation.  
> **Date:** 2026-07-28  
> **Client DB:** `PAYROLLDATA_OM` — SQL Server 2017 (Compat Level 100), single-company per install  
> **Current App:** Payroll Nexus — PostgreSQL, multi-tenant SaaS, 45 tables

---

## 1. Current Application ER Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        TENANCY & AUTH LAYER                                  │
│                                                                              │
│  tenants ──────── organizations ──── legal_entities                         │
│     │                                      │                                 │
│  packages ── tenant_packages           (PF/ESI/PT/LWF registration)         │
│     │                                                                        │
│  users ─── roles ─── role_permissions ─── permissions                       │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       MASTER DATA LAYER                                      │
│                                                                              │
│  clients ─────────── sites ─────────── salary_structures                    │
│     │                   │                    │                               │
│     │            billing_rules         salary_components                     │
│     │                   │                                                    │
│     └──────── compliance_rules                                               │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       WORKER LAYER                                           │
│                                                                              │
│  workers ─────┬───── worker_bank_details                                     │
│               ├───── worker_statutory_profiles                               │
│               └───── assignments (worker → client → site → legal_entity)    │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     ATTENDANCE LAYER                                         │
│                                                                              │
│  attendance_periods                                                          │
│  attendance_batches ─── attendance_records ─── attendance_exceptions        │
│  attendance_locks                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       PAYROLL LAYER                                          │
│                                                                              │
│  payroll_batches ─── payroll_records ─── payroll_line_items                 │
│       │                    │                                                 │
│  payroll_exceptions   payroll_trace                                          │
│       │                                                                      │
│  payslips ─── payslip_templates                                              │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│               COMPLIANCE & OUTPUT LAYER                                      │
│                                                                              │
│  compliance_reports ─── compliance_liabilities                              │
│  bank_files ─── payout_batches ─── payout_items                             │
│  invoices ─── invoice_line_items                                             │
│  billing_rules                                                               │
│  export_logs ─── file_objects ─── file_access_logs                          │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     SYSTEM LAYER                                             │
│                                                                              │
│  audit_logs    system_jobs    job_logs    report_definitions                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Total: 45 tables**

---

## 2. Client SQL Server ER Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                   COMPANY / TENANCY LAYER                                    │
│  (Single-tenant install; compid acts as company discriminator)               │
│                                                                              │
│  COMPANY / COMPANYMAST ──── CompanyAddressMaster                            │
│       │                                                                      │
│  BRANCH ─── BRANCHOFFICE ─── BRANCHFO_ISSUE ─── BRANCHFO_ITEMSTOCK         │
│       │                                                                      │
│  USERCOMPANY ─── UserMaster / USERS / app_users                             │
│                       │                                                      │
│               app_roles ─── app_permissions                                 │
│               mnuMASTER ─── mnuAccessibility ─── Menu_Master                │
└──────────────────────────────────────────────────────────────────────────────┘
              │ compid
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     MASTER DATA LAYER                                        │
│                                                                              │
│  CLIENTMASTER ─── UNITMASTER ────────── BILLMASTER ─── UnitBillSetting     │
│       │                │                                                     │
│  ZONE_MASTER     BILLINGZONE           PFZONE                               │
│  STATEMASTER     DEPTMAST             GRADEMASTER                           │
│  categorymaster  DESIGNATIONMASTER    BANKMASTER                            │
│  SEGMENT_MASTER  SHIFTMASTER          UNITSHIFT                             │
│  PROFESSIONALTAX PAYPRAM              COMPANYESI                            │
│  HOLIDAY         HOLIDAYLIST          UNITHOLIDAY                           │
│  LEAVE_MASTER    SACHSNMASTER         Area                                  │
└──────────────────────────────────────────────────────────────────────────────┘
              │ unitcode + clientcode
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       EMPLOYEE MASTER LAYER                                  │
│                                                                              │
│  EMPMAST (≈350 cols: demography + salary rates + statutory flags inline)    │
│       │                                                                      │
│  EMPRATE      EMPUNITRATE    EMPSALBREAKUPLD                                │
│  EMPPFMASTER  EMPFAMILY      empInsurance                                   │
│  EmpBankVerify EMPFRM2PEN    EMPPartA / EMPPartB                            │
│  EMPUPDATE    EMPUPLD        empcodechange                                  │
└──────────────────────────────────────────────────────────────────────────────┘
              │ empcode + unitcode
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│               ATTENDANCE / PAYROLL PROCESSING LAYER                          │
│  (Denormalized: attendance input + full payroll result in same table)        │
│                                                                              │
│  ATTENDANCE (≈300 cols: all salary components, statutory deductions,        │
│              OT, leave days, billing fields combined in one row per emp/mo) │
│  DAILY_ATTENDANCE ─── DAILY_PUNCHING ─── DayAttendance                     │
│  ATTENDANCE_SHEET ─── ATTENDANCECHECK ─── ATTENDANCE_ARR                   │
│  MONTH_ATTENDANCE ─── MUSTERROLL ─── OPEN_CLOSE_BALANCE                    │
│  SITEWISE_ATT ─── SITE_ATTENDANCE ─── UNITKG_ATTENDANCE                    │
│  LOCK_DATA                                                                  │
│                                                                              │
│  SALARY (facility-management payroll: separate from ATTENDANCE)             │
│  SALARYPAYSTATUS ─── SALARYBILLAMT                                          │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                 STATUTORY / COMPLIANCE LAYER                                 │
│                                                                              │
│  UNITPFCHALLAN ─── PFZONE                                                  │
│  UNITESICHALLAN ─── ZONEESI ─── ZONEESI_Attendance                         │
│  PROFESSIONALTAX ─── STATEMASTER                                            │
│  WELFAREDATA ─── TempLWFData                                                │
│  TDSDEPOSITED ─── TDSOFCOMPUTATION ─── EMPTDS                              │
│  ITAXCOMPUTATION ─── ITAXCOMPUTATION_PRE ─── ITAXSLAB                      │
│  FORM3A_DATA ─── EMPFRM2PEN                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    LEAVE & ADVANCE LAYER                                     │
│                                                                              │
│  LEAVE_MASTER ─── LEAVE_TRANSACTION ─── LEAVEAPPROVAL                      │
│  LEAVEBALANCE ─── LEAVEENCASHMENT ─── ANNUALLEAVE                          │
│  ADVANCE ─── ADVANCE_EMP ─── ADVANCE_GUARD                                 │
│  ADVANCEDETAIL ─── ADVANCEMONTHLY ─── DR_CR_ADVANCE                        │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                  SETTLEMENT / SUPPLEMENTAL PAY LAYER                        │
│                                                                              │
│  FULL_FINAL ─── FULL_FINAL_GUARD ─── FULL_FINAL_GUARD_DETAIL               │
│  ARREARS ─── ARRDAY ─── ARREARS_GUARD ─── ATTENDANCE_ARR                   │
│  EMPBONUS ─── BONUSRATE ─── GRATUITYMASTER                                 │
│  SALINCREMENT ─── GWAPAYMENT ─── OTHER_PAYMENT                             │
│  OTHERHEADPROVISION ─── UNITPROVISION ─── SB_PROVISION_DESIGNATION         │
│  HOLD_RELEASE ─── UNPAIDSALARY ─── UNITPAIDSALARY                          │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      BILLING / INVOICE LAYER                                 │
│                                                                              │
│  BILL ─── CREATEBILL ─── BILLMASTER ─── BILLCATEGORY                       │
│  BILL_Ded ─── SALARYBILLAMT ─── UnitBillSetting                            │
│  COLLECTIONDETAIL ─── CREDITNOTES ─── DEBITNOTES                           │
│  CreditNoteProvison ─── DEBITNoteProvison                                  │
│  RECEVEBILL ─── PAYMENTRECEVE ─── VOUCHER_PAYMENT                          │
│  EinvoiceCancelIrn ─── EinvoiceError ─── BatchDetail                       │
└──────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│           INVENTORY / UNIFORM / LOGISTICS LAYER (non-payroll)               │
│                                                                              │
│  ITEMMASTER ─── ITEMRATE ─── SIZEMASTER ─── COLORMASTER ─── MEASUREUNIT   │
│  VENDOR ─── PURCHASEORDER ─── POITEM ─── PORECEIVE ─── RETURNTOVENDOR     │
│  COMPANY_ISSUE ─── COMPANY_ITEMSTOCK                                        │
│  BRANCHFO_ISSUE ─── BRANCHFO_ITEMSTOCK ─── ITEMRECEIVEFROMBRANCH           │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Total: 424 tables**

---

## 3. Master Tables

### 3a. Current App Master Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `tenants` | SaaS tenant config | id, slug, name, status |
| `organizations` | Legal entity grouping | id, tenant_id, name, pan, gstin |
| `legal_entities` | PF/ESI/PT registration | id, org_id, state, pfNumber, esiNumber, pfWageBasis |
| `clients` | Client companies | id, tenant_id, name, gstin, state |
| `sites` | Client deployment sites | id, client_id, name, state, zone_tag |
| `salary_structures` | Wage templates | id, tenant_id, name, wageType, components[] |
| `roles` | RBAC roles | id, tenant_id, name |
| `permissions` | Permission catalog | id, name, group |
| `packages` | SaaS plan tiers | id, name, features |
| `compliance_rules` | PT slabs, PF/ESI/LWF config | id, type, state, config JSON |

### 3b. Client SQL Server Master Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `COMPANYMAST` | Company config (= Tenant) | compid, compname, PAN, GSTIN, PFNo, ESINo |
| `CLIENTMASTER` | Client roster | clientcode, Clientname, compid |
| `UNITMASTER` | Site + billing + payroll config (≈200 cols) | unitcode, clientcode, StateID, branchcode, OT_Setting, PF_Setting, monthDays, BonusRate... |
| `STATEMASTER` | State metadata + LWF rates | StateID, StateName, EmprWF, EmpWF, emplwf, emprlwf |
| `DEPTMAST` | Department lookup | deptcode, Deptname |
| `DESIGNATIONMASTER` | Designation lookup | DESICODE, DESINAME, DUTYHRS |
| `GRADEMASTER` | Grade/Pay-band lookup | GradeCode, GradeName, HraRate |
| `categorymaster` | Worker category (Security/House/Facility) | catcode, catname |
| `PAYPRAM` | PF/ESI statutory rates | compcode, empfpfrt, emprfpfrt, esiemprt, esiemprrt |
| `PROFESSIONALTAX` | PT slab table | StateCode, LowLimit, Uplimit, Ptax |
| `PFZONE` | PF establishment zones | PFZoneCode, PFEsttCode, compid |
| `BANKMASTER` | Bank routing config | bankcode, bankname, CompIFSCCode |
| `BRANCH` | Regional branch office | BranchCode, BranchName, ESIZonecode |
| `ZONE_MASTER` | Geographic zones | (zone codes used in EMPMAST) |
| `BILLINGZONE` | Billing rate zones | billzonecode, billzonename |
| `LEAVE_MASTER` | Leave type config | (leave type codes) |
| `SHIFTMASTER` / `UNITSHIFT` | Shift definitions | shift timings, rates |
| `HOLIDAY` / `HOLIDAYLIST` / `UNITHOLIDAY` | Holiday calendar | by unit/state/year |
| `SACHSNMASTER` | GST SAC codes | SacID, SACCode, IGST/CGST/SGSTRate |
| `SEGMENT_MASTER` | Business segment | segcode |

---

## 4. Transaction Tables

### 4a. Current App Transaction Tables

| Table | Purpose |
|---|---|
| `workers` | Employee records |
| `worker_bank_details` | Bank account per worker |
| `worker_statutory_profiles` | PF/ESI/PT/LWF enrollment per worker |
| `assignments` | Worker↔Client↔Site↔LegalEntity mapping |
| `attendance_batches` | Attendance upload sessions |
| `attendance_records` | Monthly attendance per worker |
| `attendance_exceptions` | Attendance validation errors |
| `attendance_locks` | Attendance approval locks |
| `attendance_periods` | Period-level status tracker |
| `payroll_batches` | Monthly payroll run header |
| `payroll_records` | Computed payroll per worker per month |
| `payroll_line_items` | Itemized earnings/deductions |
| `payroll_exceptions` | Payroll validation issues |
| `payroll_trace` | Step-by-step computation log |
| `payslips` | Generated payslip records |
| `compliance_reports` | PF ECR / ESI return files |
| `compliance_liabilities` | Challan-level liability tracking |
| `bank_files` | NEFT/SBI bank file per batch |
| `payout_batches` | Bank payment dispatch batches |
| `payout_items` | Individual payment line per worker |
| `invoices` | Client invoices |
| `invoice_line_items` | Per-designation invoice lines |
| `billing_rules` | Markup/service charge per client |
| `export_logs` | File download tracking |
| `audit_logs` | All user actions |

### 4b. Client SQL Server Transaction Tables (Core Payroll)

| Table | Purpose |
|---|---|
| `EMPMAST` | Employee master + embedded salary rates (~350 cols) |
| `ATTENDANCE` | Monthly payroll processing result (~300 cols — attendance + all earnings/deductions combined) |
| `SALARY` | Facility-management payroll format (separate payroll run type) |
| `SALARYPAYSTATUS` | Per-employee payment flag (paid/unpaid) |
| `SALARYBILLAMT` | Bill amount cross-reference |
| `LOCK_DATA` | Month-level processing lock |
| `MUSTERROLL` | Muster roll data |
| `MONTH_ATTENDANCE` | Monthly attendance summary |
| `ATTENDANCE_SHEET` | Daily attendance sheet |
| `ATTENDANCECHECK` | Attendance validation results |
| `BILL` | Client invoice (~100 cols: all tax/GST/billing variants) |
| `CREATEBILL` | Invoice line items per designation |
| `UNITPFCHALLAN` | PF challan per unit per month |
| `UNITESICHALLAN` | ESI challan per unit per month |
| `ZONEESI` | ESI zone aggregation |
| `LEAVE_TRANSACTION` | Leave requests and approvals |
| `LEAVEBALANCE` | Running leave balance per employee |
| `LEAVEENCASHMENT` | Leave encashment payments |
| `ANNUALLEAVE` | Annual EL accrual |
| `ADVANCE` | Advance/loan header |
| `ADVANCEDETAIL` | Advance installment schedule |
| `ADVANCEMONTHLY` | Monthly advance deduction |
| `ARREARS` | Arrear computation (~300 cols mirror of ATTENDANCE) |
| `ATTENDANCE_ARR` | Attendance-linked arrear processing |
| `FULL_FINAL` | Full & final settlement |
| `EMPBONUS` | Statutory bonus computation |
| `BONUSRATE` | Quarterly bonus rates |
| `GRATUITYMASTER` | Gratuity on separation |
| `ITAXCOMPUTATION` | Annual income tax worksheet |
| `EMPTDS` | TDS per employee |
| `SALINCREMENT` | Salary increment history |
| `BANK_TRANSFER` | Bank NEFT file generation |
| `BatchDetail` | Bank batch API responses |
| `UNITPROVISION` | Unit-level payroll provisions |
| `HOLD_RELEASE` | Salary hold/release tracking |
| `UNPAIDSALARY` | Unpaid salary records |
| `OTHER_PAYMENT` | Ad-hoc other payments |
| `WELFAREDATA` | LWF annual aggregation |
| `FORM3A_DATA` | PF Form 3A data |

---

## 5. Relationship Diagram (OM-Relevant Subset)

```
COMPANY / COMPANYMAST (compid)
    │
    ├─── BRANCH (BranchCode) ──── BRANCHOFFICE
    │         │
    │    ZONE_MASTER (zonecode)
    │
    ├─── CLIENTMASTER (clientcode)
    │         │
    │    UNITMASTER (unitcode) ──── BILLMASTER ──── BILLINGZONE
    │         │
    │    STATEMASTER (StateID)
    │    DEPTMAST (deptcode)
    │    DESIGNATIONMASTER (DESICODE)
    │    GRADEMASTER (GradeCode)
    │    PAYPRAM (compcode)          ← PF/ESI rates
    │    PROFESSIONALTAX (StateCode) ← PT slabs
    │    PFZONE (PFZoneCode)
    │
    ├─── EMPMAST (EmpCode, unitcode, clientcode)
    │         │
    │         ├── EmpBankVerify (bank account data)
    │         ├── EMPPFMASTER (PF nomination)
    │         ├── EMPFAMILY (nominee details)
    │         ├── LEAVEBALANCE (EmpCode)
    │         ├── ADVANCE (EmpCode)
    │         └── FULL_FINAL (EmpCode)
    │
    ├─── ATTENDANCE (EmpCode, unitcode, salyear, salmonth)
    │         │
    │         ├── LOCK_DATA (month_lock, year_lock, compid)
    │         ├── SALARYPAYSTATUS (PayMonth, PayYear)
    │         └── UNITPFCHALLAN / UNITESICHALLAN
    │
    └─── BILL (unitcode, invmonth, invyear, compid)
              │
              └── CREATEBILL (bill_id, unitcode) ← line items by designation
```

---

## 6. Table Mapping (Current App → Client SQL Server)

| Current App Table | Client SQL Server Table(s) | Mapping Notes |
|---|---|---|
| `tenants` | `COMPANY` / `COMPANYMAST` | 1:1. compid = tenant identifier |
| `organizations` | `COMPANYMAST` (subset) | Merged into company; legal registrations in PAYPRAM/PFZONE |
| `legal_entities` | `PAYPRAM` + `PFZONE` + `COMPANYESI` | Client uses separate param tables per statutory type |
| `clients` | `CLIENTMASTER` | Direct map; client adds VAT/PAN |
| `sites` | `UNITMASTER` (core fields) | UNITMASTER has 200+ cols; core site fields are ~20 |
| `billing_rules` | `UNITMASTER` (billing cols) + `BILLMASTER` | Billing config is embedded in UNITMASTER |
| `salary_structures` | `EMPMAST` (salary component cols) + `EMPRATE` | Client embeds salary rates directly on employee, not as templates |
| `salary_components` | `EMPMAST` inline fields (basic, hra, vda, conv…) | No separate component table; head labels in `UNITMASTER.uSalHead1-12` |
| `workers` | `EMPMAST` (core demography fields) | EMPMAST has ~350 cols; split required |
| `worker_bank_details` | `EMPMAST` (acno, bankcode, IFSC_CODE) + `EmpBankVerify` | Bank data inline on EMPMAST; EmpBankVerify = verification log |
| `worker_statutory_profiles` | `EMPMAST` (IsPF, IsESI, IsLWF, pf, esi flags) + `EMPPFMASTER` | Statutory enrollment flags are inline on EMPMAST |
| `assignments` | `EMPMAST` (unitcode, clientcode, branchcode) | Assignment is static on employee record; no separate assignment table |
| `attendance_periods` | `LOCK_DATA` (month/year + status) | Client uses LOCK_DATA for period open/close |
| `attendance_batches` | No direct equivalent | Client doesn't separate upload batches; data goes straight to ATTENDANCE |
| `attendance_records` | `ATTENDANCE` (presentdays, paybledays, LWP, OT_HRS, EL, CL…) | ATTENDANCE contains both attendance input AND payroll output |
| `attendance_exceptions` | `ATTENDANCECHECK` | Validation check table |
| `attendance_locks` | `LOCK_DATA` | Month-level lock per company |
| `payroll_batches` | `LOCK_DATA` + `SALARYPAYSTATUS` | No explicit batch concept; lock = processed state |
| `payroll_records` | `ATTENDANCE` (totalearning, totaldeduction, netsalary, pf, esi…) | Payroll result is in the same row as attendance in ATTENDANCE |
| `payroll_line_items` | `ATTENDANCE` (each float column = one line item) | ~80 flat columns replicate what current app stores as rows |
| `payroll_trace` | No equivalent | Client has no computation trace/audit trail for payroll |
| `payroll_exceptions` | No equivalent | No payroll exception workflow |
| `payslips` | No equivalent (print-only) | Payslips generated on-the-fly from ATTENDANCE; not stored |
| `compliance_reports` | `UNITPFCHALLAN` + `UNITESICHALLAN` + `FORM3A_DATA` | Each compliance type has its own table |
| `compliance_liabilities` | `UNITPFCHALLAN` (sub-ac amounts) + `UNITESICHALLAN` | Embedded within challan tables |
| `compliance_rules` | `PAYPRAM` (PF/ESI) + `PROFESSIONALTAX` (PT) + `STATEMASTER` (LWF) | Split across 3+ tables; no unified rule registry |
| `bank_files` | `BANK_TRANSFER` + `BatchDetail` | BANK_TRANSFER = file; BatchDetail = bank API response log |
| `invoices` | `BILL` | Direct map; BILL has far more GST/tax columns |
| `invoice_line_items` | `CREATEBILL` | Per-designation billing rows |
| `billing_rules` | `BILLMASTER` + `UNITMASTER` (sCharge, sTax) | Service charge config in both places |
| `users` | `app_users` + `UserMaster` / `USERS` | Three user tables exist; app_users is the modern one |
| `roles` | `app_roles` + `MasterSetting` | app_roles is modern; MasterSetting has legacy role strings |
| `permissions` | `app_permissions` | Direct map (module + action pattern) |
| `role_permissions` | `app_permissions` (role_name + allowed bit) | Same concept, different structure |
| `audit_logs` | `app_activity_log` | Partial: app_activity_log exists but thin |
| `export_logs` | No equivalent | No file export tracking |
| `system_jobs` | No equivalent | No background job framework |

---

## 7. Field-Level Gap Analysis

### 7a. Workers ↔ EMPMAST

| Current Field | Client Field | Gap |
|---|---|---|
| `employee_code` | `EmpCode` | ✅ Maps |
| `name` | `EmpName` | ✅ Maps |
| `gender` | `Sex` | ✅ Maps (M/F/Male/Female normalization needed) |
| `date_of_birth` | `DOB` | ✅ Maps |
| `date_of_joining` | `DOJ` | ✅ Maps |
| `designation` (string) | `designation` (FK to DESIGNATIONMASTER) | ⚠️ Current app stores as free text; client uses code lookup |
| `category` | `category` (1-char code) | ⚠️ Client uses single-char codes (A/B/C) |
| `state` | `StateID` (FK to STATEMASTER) | ⚠️ Current stores state name; client uses numeric ID |
| `phone` | `contnoref` / `contnolocal` | ⚠️ Client has 2 phone fields |
| `aadhar` | `adharcardno` | ✅ Maps |
| — | `GradeCode` | ❌ MISSING in current app |
| — | `deptcode` | ❌ MISSING in current app (no department master) |
| — | `branchcode` | ❌ MISSING in current app (no branch hierarchy) |
| — | `zonecode` | ❌ MISSING in current app |
| — | `focode` (Field Officer) | ❌ MISSING |
| — | `modeofpay` (Cash/Bank/Cheque) | ❌ MISSING — critical for bank file routing |
| — | `PAN_no` | ❌ MISSING — needed for TDS |
| — | `DOL` (Date of Leaving) | ❌ MISSING — exit date not in workers |
| — | `workstatus` | ❌ MISSING (replaces `status` with more granular values) |
| — | `IsPFSettlement` | ❌ MISSING |

### 7b. Worker Bank Details ↔ EMPMAST (bank fields)

| Current Field | Client Field | Gap |
|---|---|---|
| `account_number` | `acno` | ✅ Maps |
| `bank_name` | `SavingBankName` | ✅ Maps |
| `ifsc_code` | `SavingIFSCCode` | ✅ Maps |
| `account_type` | — | ❌ Not in client |
| `holder_name` | `NameInBank` | ✅ Maps |
| `verified` | `isAcctVarify` | ✅ Maps (int vs boolean) |
| — | `bankcode` (FK to BANKMASTER) | ❌ MISSING — bank master reference |

### 7c. Worker Statutory ↔ EMPMAST (statutory fields)

| Current Field | Client Field | Gap |
|---|---|---|
| `pf_uan` | `EMPPFMASTER.UANNo` (inferred) | ⚠️ In separate EMPPFMASTER |
| `pf_number` | — | ❌ Not explicitly stored |
| `esi_number` | — | ❌ Not explicitly in EMPMAST |
| `pf_enrolled` | `IsPF` (Y/N string) | ✅ Maps (type conversion) |
| `esi_enrolled` | `IsESI` (Y/N string) | ✅ Maps |
| `pt_applicable` | `PTax` (float; 0 = no) | ⚠️ Implicit |
| `lwf_applicable` | `IsLWF` (Y/N string) | ✅ Maps |

### 7d. Sites ↔ UNITMASTER (core fields only)

| Current Field | Client Field | Gap |
|---|---|---|
| `name` | `Unitname` | ✅ Maps |
| `state` | `StateID` | ✅ Maps (with lookup) |
| `address` | `address` / `city` | ✅ Maps |
| `zone_tag` (KA Zone 1/2) | `category` / `BillingZone` | ⚠️ Partial; client uses billing zone differently |
| — | `branchcode` | ❌ Branch hierarchy missing |
| — | `segcode` (Segment) | ❌ No segment in current app |
| — | `OT_Setting` | ❌ OT computation mode not stored in sites |
| — | `monthDays` / `otmonthdays` | ❌ Working days config not in sites |
| — | `EsiOnOT` | ❌ ESI on OT flag not in sites |
| — | `IsBonus` / `BonusRate` / `Bonus_Limit` | ❌ Bonus rules not in sites |
| — | `IsGratuity` / `gratuityRate` | ❌ Gratuity config missing |
| — | `pTax` (PT exemption rule per unit) | ❌ PT per-site config missing |
| — | `EMP_LWF` / `EMPR_LWF` | ❌ LWF rates per unit missing |

### 7e. Attendance Records ↔ ATTENDANCE

| Current Field | Client Field | Gap |
|---|---|---|
| `present_days` | `presentdays` | ✅ Maps |
| `total_working_days` | `MonthDays` | ✅ Maps |
| `lwp_days` | `LWP` (Loss of Pay) | ✅ Maps |
| `ot_hours` | `OT_HRS` | ✅ Maps |
| — | `EL`, `CL`, `SL`, `PL`, `FL` | ❌ Leave types not in attendance_records |
| — | `Holiday`, `weeklyOff`, `CompOff` | ❌ Holiday/off tracking missing |
| — | `ArrearDays` | ❌ Arrear days not tracked |
| — | `paybledays` (actual payable days after leave) | ⚠️ Different from present_days |

### 7f. Payroll Records ↔ ATTENDANCE (payroll output section)

| Current Field | Client Field | Gap |
|---|---|---|
| `gross_pay` | `totalearning` | ✅ Maps |
| `net_pay` | `netsalary` | ✅ Maps |
| `pf` (employee) | `pf` | ✅ Maps |
| `pf_employer` | `PFEmpr` | ✅ Maps |
| `esi` (employee) | `esi` | ✅ Maps |
| `esi_employer` | `esiEmpr` | ✅ Maps |
| `pt` | `PTax` | ✅ Maps |
| `lwf_employee` | `emp_WF` | ✅ Maps |
| `lwf_employer` | `Empr_WF` | ✅ Maps |
| — | `basicpay`, `VDA`, `hra`, `conv`, `washall`... (20+ component cols) | ⚠️ Current app stores as `payroll_line_items` rows; client uses flat columns |
| — | `billAmt` / `serviceCharge` / `serviceTax` | ❌ Billing amounts inline in ATTENDANCE |
| — | `OT_Hrs_Amt` / `OT_Day_Amt` | ⚠️ OT amounts separate from salary components in client |

### 7g. Invoices ↔ BILL

| Current Field | Client Field | Gap |
|---|---|---|
| `invoice_number` | `invoiceno` | ✅ Maps |
| `period_month` | `invmonth` / `invyear` | ✅ Maps |
| `gross_payroll` | `total` | ✅ Maps |
| `service_charge` | `servicecharge` | ✅ Maps |
| `gstin_igst` | `IGSTAmt` | ✅ Maps |
| `gstin_cgst` | `CGSTAmt` | ✅ Maps |
| `gstin_sgst` | `SGSTAmt` | ✅ Maps |
| `total_amount` | `grandtotal` | ✅ Maps |
| `status` | No direct field (inferred from `dueamount`) | ⚠️ No status field; payment status derived |
| — | `tds` | ❌ TDS deduction not in current invoices |
| — | `deduction` | ❌ General deduction field missing |
| — | `paidamt` | ❌ Partial payment tracking not in current app |
| — | `AckNo`, `Irn`, `EinvoiceDate` | ❌ E-Invoice IRN/ACK not in current app |
| — | `BillPeriodFrom` / `BillPeriodTo` | ❌ Explicit billing period range missing |
| — | `QrCode` (binary) | ❌ QR code storage missing |

---

## 8. Missing Modules

The following modules exist in the client schema but have **no equivalent** in the current application:

| # | Module | Client Tables | Priority for OM |
|---|---|---|---|
| 1 | **Leave Management** | `LEAVE_MASTER`, `LEAVE_TRANSACTION`, `LEAVEBALANCE`, `LEAVEAPPROVAL`, `ANNUALLEAVE`, `LEAVEENCASHMENT` | 🔴 High — leave days affect payroll calc |
| 2 | **Advance / Loan Management** | `ADVANCE`, `ADVANCE_EMP`, `ADVANCE_GUARD`, `ADVANCEDETAIL`, `ADVANCEMONTHLY`, `DR_CR_ADVANCE` | 🔴 High — advance deductions in payroll |
| 3 | **Arrears Processing** | `ARREARS`, `ARRDAY`, `ARREARS_GUARD`, `ATTENDANCE_ARR`, `attendance_otsarrn` | 🔴 High — salary arrear run cycle |
| 4 | **Department & Designation Masters** | `DEPTMAST`, `DESIGNATIONMASTER`, `GRADEMASTER`, `categorymaster` | 🟡 Medium — currently free-text fields in current app |
| 5 | **Branch / Zone Hierarchy** | `BRANCH`, `BRANCHOFFICE`, `ZONE_MASTER`, `BILLINGZONE`, `PFZONE` | 🟡 Medium — needed for multi-branch reporting |
| 6 | **Full & Final Settlement** | `FULL_FINAL`, `FULL_FINAL_GUARD`, `FULL_FINAL_GUARD_DETAIL` | 🟡 Medium — exit processing |
| 7 | **Bonus Management** | `EMPBONUS`, `BONUSRATE`, `GRATUITYMASTER` | 🟡 Medium — statutory bonus cycle |
| 8 | **Salary Increment History** | `SALINCREMENT` | 🟡 Medium — salary revision audit trail |
| 9 | **Holiday Management** | `HOLIDAY`, `HOLIDAYLIST`, `UNITHOLIDAY` | 🟡 Medium — holiday calendar for attendance |
| 10 | **Income Tax / TDS** | `ITAXCOMPUTATION`, `ITAXCOMPUTATION_PRE`, `ITAXSLAB`, `EMPTDS`, `TDSDEPOSITED` | 🟠 Low-Medium — relevant for Form 16 only |
| 11 | **Muster Roll** | `MUSTERROLL`, `MONTH_ATTENDANCE`, `OPEN_CLOSE_BALANCE` | 🟠 Low — operations-level |
| 12 | **Payment Collection Tracking** | `COLLECTIONDETAIL`, `CREDITNOTES`, `DEBITNOTES`, `PAYMENTRECEVE` | 🟠 Low — AR/finance module |
| 13 | **E-Invoice (IRN/QR)** | `EinvoiceCancelIrn`, `EinvoiceError` | 🟠 Low — GST e-invoice integration |
| 14 | **Salary Hold/Release** | `HOLD_RELEASE`, `UNPAIDSALARY`, `UNITPAIDSALARY` | 🟠 Low |
| 15 | **Bank Transfer API** | `BANK_TRANSFER`, `BatchDetail`, `apisetting` | 🟠 Low (current app has bank_files) |

---

## 9. Legacy Tables That Can Be Ignored

The following 60+ tables from the client schema should be excluded from any migration or mapping work:

### 9a. Client-Specific Project Snapshots
| Table | Reason |
|---|---|
| `attendance_SIYARAM` | Snapshot for Siyaram client only |
| `empmAST_SIYARAM` | Snapshot for Siyaram client only |
| `attso2`, `month_attso2` | Temporary/project-specific |
| `LSTEMPDT1152010LSTEMPDT` | Archive of employee data from 2010 |
| `LSTEMPDT1392011LSTEMPDT` | Archive from 2011 |
| `BACK_BATCHDETAIL`, `BACK_EMPBANKVERIFY` | Manual backup tables |

### 9b. Inventory / Uniform / Logistics (Non-Payroll)
| Tables | Reason |
|---|---|
| `ITEMMASTER`, `ITEMRATE`, `SIZEMASTER`, `COLORMASTER`, `MEASUREUNIT` | Uniform/equipment catalogue |
| `VENDOR`, `PURCHASEORDER`, `POITEM`, `PORECEIVE`, `RETURNTOVENDOR` | Procurement |
| `COMPANY_ISSUE`, `COMPANY_ITEMSTOCK` | Uniform stock |
| `BRANCHFO_ISSUE`, `BRANCHFO_ITEMSTOCK` | Branch uniform |
| `ITEMRECEIVEFROMBRANCH`, `ITEMRECEIVEFROMEMPLOYEE` | Returns tracking |
| `ASSETSMASTER` | Fixed asset register |

### 9c. Temp / Scratch / Staging Tables
| Tables | Reason |
|---|---|
| `TEMP060924` | Temporary data |
| `tempattERROR`, `TempAttNew` | Attendance import staging |
| `TempLWFData` | LWF staging |
| `temprate`, `TempRateEmp` | Salary rate staging |
| `duplicate_table` | Duplicate-check utility |
| `CheckDuplicate` | Utility |
| `EXCELDATA` | Excel import staging |
| `UploadEmpcheck` | Upload validation utility |
| `EMPUPLD`, `empuploadErr` | Employee upload staging |
| `OT_ATTENDANCE`, `OTHERSITE_TEMP` | Operational staging |

### 9d. Operational / Security-Guard-Specific
| Tables | Reason |
|---|---|
| `DAILY_PUNCHING`, `NEWDAILYATTPUNCHING` | Guard punch-in/out — ops level |
| `SITE_ATTENDANCE`, `SITEWISE_ATT` | Site-level ops tracking |
| `UNITKG_ATTENDANCE` | KG (security guard) specific |
| `DayAttendance` | Daily drill-down |
| `POST_DETAIL` | Guard post configuration |
| `DISPENSARYMASTER` | Medical dispensary |
| `FIELDOFFICERMASTER`, `OFFICER_MASTER` | Field supervisor rosters |
| `TimeTable` | Guard timetable |

### 9e. Financial/Non-OM Accounting
| Tables | Reason |
|---|---|
| `COMPANYEXPANCE` | Internal company expenses |
| `UNITEXPANCE` | Unit operating expenses |
| `UNITREIMB` | Reimbursements |
| `DR_CR_ADVANCE` | DR/CR adjustment (accounting) |
| `VOUCHER_PAYMENT` | Voucher-based payments |
| `Sales` | Test/demo table |
| `GWAPAYMENT` | Goodwill Attendance Payment (niche) |
| `RELIEFREWARD` | Relief/reward for guard shifts |
| `WELFAREDATA` | Annual LWF aggregation (superseded by compliance_liabilities) |
| `CreditNoteProvison`, `DEBITNoteProvison` | Provision entries |
| `RECEVEBILL` | Bill receipt tracking |

### 9f. System / Config / Legacy Auth
| Tables | Reason |
|---|---|
| `AA` | Empty scratch table |
| `App_Master` | Application registry |
| `app_report_templates` | Hardcoded report config |
| `MasterSetting` | Legacy settings blob |
| `MODULEVERSION` | Version tracking |
| `mnuMASTER`, `MNUMASTER_M_HOUSE`, `Menu_Master`, `mnuAccessibility` | Menu permission config (legacy) |
| `UserAccess`, `USERCOMPANY` | Legacy user-company mapping |
| `USERS` | Legacy user table (superseded by app_users) |
| `UserMaster` | Legacy (superseded by app_users) |
| `OFFERLETTER` | Offer letter printing |
| `empcodechange` | Employee code change log |
| `EMPUPDATE` | Employee update staging |
| `EmpBankVerify_ZH_HOM` | Project-specific bank verification copy |

---

## 10. Tenant Dependency Analysis

### Current App — True Multi-Tenancy
- Every table has `tenant_id TEXT NOT NULL` as a mandatory discriminator
- All queries are scoped to `tenant_id` at the middleware level
- IDs are UUIDs generated per tenant; no cross-tenant key collisions possible
- Auth tokens carry `tenantId`; no tenant = no access

### Client SQL Server — Pseudo Single-Tenancy via `compid`
- Most tables have a `compid INT` column (not enforced as FK, not in all tables)
- Tables WITHOUT `compid`: `DEPTMAST`, `DESIGNATIONMASTER`, `STATEMASTER`, `GRADEMASTER`, `PROFESSIONALTAX`, `SACHSNMASTER`, `COLORMASTER`, `SIZEMASTER`, `ITEMMASTER`, `LEAVE_MASTER`, `ITAXSLAB` — these are true lookup/reference tables shared across companies
- The system is installed per-company; multi-tenancy is not a design goal
- `compid` = integer identity from `COMPANY` table (`Compid IDENTITY(1,1)`)

### Impact on OM-Only Target Architecture

| Dimension | Decision |
|---|---|
| Tenancy mode | Single tenant per deployment (map compid=1 → one fixed tenantId) |
| Isolation | `tenant_id` filter remains on all tables (future-proof for SaaS extension) |
| Reference tables | `STATEMASTER`, `DESIGNATIONMASTER`, `GRADEMASTER`, `DEPTMAST` become shared lookups scoped to tenant |
| Auth | Keep current app's `users → roles → permissions` model; import `app_users` / `app_roles` / `app_permissions` data |
| Company structure | COMPANY → `tenants` + `organizations`; BRANCH → add `branches` table under organization |

---

## 11. Recommended Target Architecture for OM-Only Implementation

### Design Principles
1. **Keep current app's normalized schema** as the foundation — do not flatten to ATTENDANCE's 300-column style
2. **Add missing OM modules** as new tables with proper FK relationships and `tenant_id`
3. **Enrich existing tables** with fields the current app lacks (grade, dept, zone, branch, mode_of_pay, dol)
4. **Reference data** (department, designation, grade, state) becomes proper lookup tables instead of free-text strings
5. **UNITMASTER's 200+ config columns** should be decomposed into:
   - `sites` (core location/address)
   - `site_payroll_config` (OT settings, month days, ESI on OT, per-day rate mode)
   - `site_compliance_config` (bonus, gratuity, LWF override, PT exemptions)
   - `billing_rules` (existing, enhanced with designation-level rates)

### Target Table Set (OM Implementation)

#### A. Enrich Existing Tables (no new tables, add columns)

| Table | Fields to Add |
|---|---|
| `workers` | `grade_id`, `dept_id`, `branch_id`, `zone_id`, `mode_of_pay`, `pan_number`, `date_of_leaving`, `dol_reason`, `father_name`, `blood_group`, `marital_status`, `spouse_name` |
| `worker_statutory_profiles` | `uan_number` (move from pf_uan), `esic_dispensary_code`, `pt_registration_number` |
| `worker_bank_details` | `bank_master_id` (FK to new bank_master) |
| `sites` | `branch_id`, `segment_id`, `billing_zone_id`, `pf_zone_id` |
| `attendance_records` | `el_days`, `cl_days`, `sl_days`, `holiday_days`, `weekly_off_days`, `comp_off_days`, `arrear_days`, `payable_days` |
| `invoices` | `tds_amount`, `deduction_amount`, `paid_amount`, `due_amount`, `bill_period_from`, `bill_period_to`, `irn`, `ack_number`, `ack_date`, `e_invoice_date`, `cancel_reason` |
| `legal_entities` | `pf_zone_id`, `esi_zone_id`, `branch_id` |
| `organizations` | `branch_state_code`, `local_office` |

#### B. New Master Tables

| New Table | Maps From | Key Columns |
|---|---|---|
| `department_master` | `DEPTMAST` | id, tenant_id, code, name |
| `designation_master` | `DESIGNATIONMASTER` | id, tenant_id, code, name, duty_hrs |
| `grade_master` | `GRADEMASTER` | id, tenant_id, code, name, hra_rate |
| `worker_category_master` | `categorymaster` | id, tenant_id, code, name |
| `branch_master` | `BRANCH` + `BRANCHOFFICE` | id, tenant_id, code, name, state, gstin |
| `zone_master` | `ZONE_MASTER` + `BILLINGZONE` | id, tenant_id, zone_type, code, name |
| `bank_master` | `BANKMASTER` | id, tenant_id, code, name, ifsc_code, corp_id |
| `site_payroll_config` | `UNITMASTER` (OT/days cols) | site_id, ot_setting, month_days, ot_month_days, hrs_per_day, per_day_rate_mode, esi_on_ot |
| `site_compliance_config` | `UNITMASTER` (bonus/gratuity/LWF cols) | site_id, is_bonus, bonus_rate, bonus_limit, is_gratuity, gratuity_rate, emp_lwf, empr_lwf, pt_exemption |
| `holiday_calendar` | `HOLIDAY` + `UNITHOLIDAY` | id, tenant_id, site_id, holiday_date, name, year |

#### C. New Transaction Tables

| New Table | Maps From | Key Columns |
|---|---|---|
| `leave_types` | `LEAVE_MASTER` | id, tenant_id, code, name, encashable, carry_forward |
| `leave_balances` | `LEAVEBALANCE` | id, tenant_id, worker_id, year, leave_type_id, opening, earned, availed, balance |
| `leave_transactions` | `LEAVE_TRANSACTION` | id, tenant_id, worker_id, leave_type_id, from_date, to_date, days, status, approved_by |
| `advance_accounts` | `ADVANCE_EMP` | id, tenant_id, worker_id, advance_type, total_amount, installment_amount, balance, status |
| `advance_transactions` | `ADVANCE` + `ADVANCEMONTHLY` | id, tenant_id, worker_id, advance_account_id, month, deduction_amount, running_balance |
| `arrear_batches` | `ARREARS` (header fields) | id, tenant_id, month, year, type, status |
| `arrear_records` | `ARREARS` + `ATTENDANCE_ARR` | id, tenant_id, worker_id, arrear_batch_id, component, amount, pf_on_arrear, esi_on_arrear |
| `salary_increments` | `SALINCREMENT` | id, tenant_id, worker_id, effective_date, old_components JSONB, new_components JSONB |
| `fnf_settlements` | `FULL_FINAL` | id, tenant_id, worker_id, dol, gross_earned, gratuity, leave_encashment, bonus, net_pay, status |
| `bonus_computations` | `EMPBONUS` + `BONUSRATE` | id, tenant_id, worker_id, year, bonus_type, bonus_amount, paid_month |
| `gratuity_records` | `GRATUITYMASTER` | id, tenant_id, worker_id, doj, dol, years_of_service, gratuity_amount |

---

### Architecture Decision Summary

```
KEEP as-is:
  tenants, organizations, packages, tenant_packages
  roles, permissions, role_permissions
  users
  clients
  salary_structures, salary_components
  payroll_batches, payroll_records, payroll_line_items, payroll_trace
  payroll_exceptions, payslips
  compliance_reports, compliance_liabilities, compliance_rules
  bank_files, payout_batches, payout_items
  invoices (+ enrich), invoice_line_items
  billing_rules
  audit_logs, export_logs, system_jobs, job_logs
  attendance_batches, attendance_exceptions, attendance_periods

ENRICH (add columns):
  workers           ← grade_id, dept_id, branch_id, pan, dol, mode_of_pay
  worker_bank_details ← bank_master_id
  worker_statutory_profiles ← uan_number, esic_dispensary
  sites             ← branch_id, billing_zone_id, pf_zone_id
  attendance_records ← payable_days, leave breakdown cols
  invoices          ← tds, deductions, paid_amount, IRN, e-invoice cols
  legal_entities    ← pf_zone_id, branch_id

ADD new tables:
  department_master, designation_master, grade_master
  worker_category_master, branch_master, zone_master, bank_master
  site_payroll_config, site_compliance_config
  holiday_calendar
  leave_types, leave_balances, leave_transactions
  advance_accounts, advance_transactions
  arrear_batches, arrear_records
  salary_increments
  fnf_settlements, bonus_computations, gratuity_records

DECOMPOSE UNITMASTER →
  sites (core)
  + site_payroll_config (OT, days, shift)
  + site_compliance_config (bonus, gratuity, LWF override)
  + billing_rules (existing, enhanced)

IGNORE (client DB tables, no migration needed):
  All inventory/uniform tables (60+ tables)
  All SIYARAM/LSTEMPDT snapshot tables
  All TEMP*/staging tables
  All ops-level daily punch/site-attendance tables
  Legacy auth: UserMaster, USERS, UserAccess, mnuMASTER
  Financial non-OM: COMPANYEXPANCE, UNITEXPANCE, Sales, GWAPAYMENT
```

---

## Summary of Key Differences

| Dimension | Payroll Nexus (Current) | PAYROLLDATA_OM (Client) |
|---|---|---|
| Database | PostgreSQL | SQL Server 2017 |
| Table count | 45 | 424 |
| Tenancy | Multi-tenant (UUID tenant_id everywhere) | Single-company (compid integer discriminator) |
| Normalization | 3NF / normalized | Highly denormalized (ATTENDANCE = 300-col god-table) |
| Salary components | Normalized rows in payroll_line_items | Flat columns (basicpay, VDA, hra, conv…) |
| Employee record | 3 tables (workers + bank + statutory) | 1 giant table EMPMAST with 350 cols |
| Site config | 2 tables (sites + billing_rules) | 1 table UNITMASTER with 200+ cols |
| Payroll state | Explicit batch status workflow | Implicit via LOCK_DATA + SALARYPAYSTATUS |
| FK enforcement | Logical only (text IDs, no DB-level FK) | None enforced at DB level |
| Leave management | ❌ Not present | ✅ Full module |
| Advance management | ❌ Not present | ✅ Full module |
| Arrears | ❌ Not present | ✅ Full module |
| Full & Final | ❌ Not present | ✅ Present |
| Bonus | ❌ Not present | ✅ Statutory bonus |
| Gratuity | ❌ Not present | ✅ Present |
| Income Tax | ❌ Not present | ✅ Full TDS/Form 16 module |
| E-Invoice | ❌ Not present | ✅ IRN/ACK/QR code |
| Payroll trace | ✅ Full step-by-step trace | ❌ None |
| Multi-state compliance | ✅ Configurable rules | ✅ Per-unit config |
| Audit trail | ✅ Full audit_logs | ⚠️ Thin (app_activity_log only) |
| Branch hierarchy | ❌ Not modeled | ✅ Company → Branch → Client → Unit |
