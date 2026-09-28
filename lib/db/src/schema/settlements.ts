import { pgTable, text, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";

// Salary increment history — maps to SALINCREMENT
export const salaryIncrementsTable = pgTable("salary_increments", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  effectiveDate: text("effective_date").notNull(),   // YYYY-MM-DD
  incrementType: text("increment_type").notNull().default("annual"), // annual | promotion | revision | correction
  oldGross: numeric("old_gross", { precision: 12, scale: 2 }).notNull(),
  newGross: numeric("new_gross", { precision: 12, scale: 2 }).notNull(),
  incrementAmount: numeric("increment_amount", { precision: 12, scale: 2 }).notNull(),
  incrementPercent: numeric("increment_percent", { precision: 6, scale: 2 }),
  oldComponents: text("old_components").notNull().default("[]"), // JSON snapshot
  newComponents: text("new_components").notNull().default("[]"), // JSON snapshot
  reason: text("reason"),
  approvedBy: text("approved_by"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("salary_increments_worker_idx").on(t.workerId),
  index("salary_increments_effective_idx").on(t.effectiveDate),
]);

// Full & Final settlement on exit — maps to FULL_FINAL
export const fnfSettlementsTable = pgTable("fnf_settlements", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull().unique(), // one FnF per worker
  dateOfLeaving: text("date_of_leaving").notNull(),
  dolReason: text("dol_reason"),
  // Earnings
  salaryEarned: numeric("salary_earned", { precision: 12, scale: 2 }).notNull().default("0"),
  leaveEncashmentAmount: numeric("leave_encashment_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  gratuityAmount: numeric("gratuity_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  bonusAmount: numeric("bonus_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  otherEarnings: numeric("other_earnings", { precision: 12, scale: 2 }).notNull().default("0"),
  grossFnf: numeric("gross_fnf", { precision: 12, scale: 2 }).notNull().default("0"),
  // Deductions
  advanceRecovery: numeric("advance_recovery", { precision: 12, scale: 2 }).notNull().default("0"),
  pfEmployee: numeric("pf_employee", { precision: 10, scale: 2 }).notNull().default("0"),
  esi: numeric("esi", { precision: 10, scale: 2 }).notNull().default("0"),
  pt: numeric("pt", { precision: 10, scale: 2 }).notNull().default("0"),
  otherDeductions: numeric("other_deductions", { precision: 10, scale: 2 }).notNull().default("0"),
  netFnf: numeric("net_fnf", { precision: 12, scale: 2 }).notNull().default("0"),
  // Status
  status: text("status").notNull().default("draft"), // draft | approved | paid
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paymentMode: text("payment_mode"),              // bank | cash | cheque
  notes: text("notes"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("fnf_settlements_worker_idx").on(t.workerId),
  index("fnf_settlements_status_idx").on(t.status),
]);

// Gratuity computation on separation — maps to GRATUITYMASTER
export const gratuityRecordsTable = pgTable("gratuity_records", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  dateOfJoining: text("date_of_joining").notNull(),
  dateOfLeaving: text("date_of_leaving").notNull(),
  yearsOfService: numeric("years_of_service", { precision: 5, scale: 2 }).notNull(),
  lastBasicAmount: numeric("last_basic_amount", { precision: 12, scale: 2 }).notNull(),
  gratuityAmount: numeric("gratuity_amount", { precision: 12, scale: 2 }).notNull(),
  taxableAmount: numeric("taxable_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  exemptAmount: numeric("exempt_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("computed"), // computed | approved | paid
  fnfSettlementId: text("fnf_settlement_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("gratuity_records_worker_idx").on(t.workerId),
]);

// Statutory bonus computation — maps to EMPBONUS + BONUSRATE
export const bonusComputationsTable = pgTable("bonus_computations", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  financialYear: text("financial_year").notNull(), // e.g. "2025-26"
  bonusType: text("bonus_type").notNull().default("statutory"), // statutory | ex_gratia | festival
  eligibleWage: numeric("eligible_wage", { precision: 12, scale: 2 }).notNull(),
  bonusRate: numeric("bonus_rate", { precision: 6, scale: 4 }).notNull(),
  bonusAmount: numeric("bonus_amount", { precision: 12, scale: 2 }).notNull(),
  paidMonth: text("paid_month"),               // YYYY-MM
  payrollBatchId: text("payroll_batch_id"),
  status: text("status").notNull().default("computed"), // computed | approved | paid
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("bonus_computations_worker_idx").on(t.workerId),
  index("bonus_computations_year_idx").on(t.financialYear),
]);

// Arrear processing batch header — maps to ARREARS (header fields)
export const arrearBatchesTable = pgTable("arrear_batches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  arrearType: text("arrear_type").notNull().default("salary"), // salary | increment | bonus | ot
  forMonth: text("for_month").notNull(),        // YYYY-MM — the month arrear relates to
  processedInMonth: text("processed_in_month").notNull(), // YYYY-MM — month it was paid
  payrollBatchId: text("payroll_batch_id"),
  status: text("status").notNull().default("draft"), // draft | computed | approved | processed
  totalWorkers: integer("total_workers").notNull().default(0),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("arrear_batches_for_month_idx").on(t.forMonth),
  index("arrear_batches_status_idx").on(t.status),
]);

// Per-worker arrear lines — maps to ARREARS rows
export const arrearRecordsTable = pgTable("arrear_records", {
  id: text("id").primaryKey(),
  arrearBatchId: text("arrear_batch_id").notNull(),
  workerId: text("worker_id").notNull(),
  componentCode: text("component_code").notNull(),
  componentName: text("component_name").notNull(),
  oldAmount: numeric("old_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  newAmount: numeric("new_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  arrearAmount: numeric("arrear_amount", { precision: 12, scale: 2 }).notNull(),
  pfOnArrear: numeric("pf_on_arrear", { precision: 10, scale: 2 }).notNull().default("0"),
  esiOnArrear: numeric("esi_on_arrear", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("arrear_records_batch_idx").on(t.arrearBatchId),
  index("arrear_records_worker_idx").on(t.workerId),
]);
