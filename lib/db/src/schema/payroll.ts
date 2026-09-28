import { pgTable, text, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";

// Monthly payroll run header — maps to LOCK_DATA (locked state) + aggregates
export const payrollBatchesTable = pgTable("payroll_batches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  month: text("month").notNull(),              // YYYY-MM
  clientId: text("client_id"),
  siteId: text("site_id"),
  legalEntityId: text("legal_entity_id"),
  status: text("status").notNull().default("draft"), // draft | submitted | approved | locked | returned
  totalWorkers: integer("total_workers").notNull().default(0),
  processedWorkers: integer("processed_workers").notNull().default(0),
  exceptionCount: integer("exception_count").notNull().default(0),
  criticalExceptionCount: integer("critical_exception_count").notNull().default(0),
  totalGross: numeric("total_gross", { precision: 14, scale: 2 }),
  totalNet: numeric("total_net", { precision: 14, scale: 2 }),
  totalDeductions: numeric("total_deductions", { precision: 14, scale: 2 }),
  totalPfEmployee: numeric("total_pf_employee", { precision: 14, scale: 2 }),
  totalPfEmployer: numeric("total_pf_employer", { precision: 14, scale: 2 }),
  totalEsi: numeric("total_esi", { precision: 14, scale: 2 }),
  totalPt: numeric("total_pt", { precision: 14, scale: 2 }),
  totalLwf: numeric("total_lwf", { precision: 14, scale: 2 }),
  totalEmployerCost: numeric("total_employer_cost", { precision: 14, scale: 2 }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedBy: text("submitted_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  returnedBy: text("returned_by"),
  reopenReason: text("reopen_reason"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payroll_batches_status_idx").on(t.status),
  index("payroll_batches_month_idx").on(t.month),
  index("payroll_batches_client_month_idx").on(t.clientId, t.month),
]);

// Per-worker payroll result — maps to ATTENDANCE (payroll output columns)
export const payrollRecordsTable = pgTable("payroll_records", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  workerId: text("worker_id").notNull(),
  // Attendance inputs
  totalWorkingDays: numeric("total_working_days", { precision: 5, scale: 1 }).notNull().default("26"),
  presentDays: numeric("present_days", { precision: 5, scale: 1 }).notNull().default("0"),
  payableDays: numeric("payable_days", { precision: 5, scale: 1 }).notNull().default("0"),
  lwpDays: numeric("lwp_days", { precision: 5, scale: 1 }).notNull().default("0"),
  otHours: numeric("ot_hours", { precision: 6, scale: 2 }).notNull().default("0"),
  otAmount: numeric("ot_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  // Earnings
  grossPay: numeric("gross_pay", { precision: 12, scale: 2 }).notNull().default("0"),
  allowances: numeric("allowances", { precision: 12, scale: 2 }).notNull().default("0"),
  incentives: numeric("incentives", { precision: 12, scale: 2 }).notNull().default("0"),
  // Deductions
  pfEmployee: numeric("pf_employee", { precision: 10, scale: 2 }).notNull().default("0"),
  pfEmployer: numeric("pf_employer", { precision: 10, scale: 2 }).notNull().default("0"),
  esi: numeric("esi", { precision: 10, scale: 2 }).notNull().default("0"),
  esiEmployer: numeric("esi_employer", { precision: 10, scale: 2 }).notNull().default("0"),
  pt: numeric("pt", { precision: 10, scale: 2 }).notNull().default("0"),
  lwf: numeric("lwf", { precision: 10, scale: 2 }).notNull().default("0"),
  lwfEmployer: numeric("lwf_employer", { precision: 10, scale: 2 }).notNull().default("0"),
  advanceDeduction: numeric("advance_deduction", { precision: 10, scale: 2 }).notNull().default("0"),
  manualDeductions: numeric("manual_deductions", { precision: 10, scale: 2 }).notNull().default("0"),
  otherDeductions: numeric("other_deductions", { precision: 10, scale: 2 }).notNull().default("0"),
  netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull().default("0"),
  employerCost: numeric("employer_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  // Overrides
  overrideValue: numeric("override_value", { precision: 12, scale: 2 }),
  overrideReason: text("override_reason"),
  overrideBy: text("override_by"),
  overrideAt: timestamp("override_at", { withTimezone: true }),
  // Status
  status: text("status").notNull().default("calculated"),
  hasException: text("has_exception").notNull().default("false"),
  payStatus: text("pay_status").notNull().default("unpaid"), // unpaid | paid — maps to SALARYPAYSTATUS
  paidAt: timestamp("paid_at", { withTimezone: true }),
  // JSON snapshots
  components: text("components").notNull().default("{}"),
  traceJson: text("trace_json").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payroll_records_batch_idx").on(t.batchId),
  index("payroll_records_worker_idx").on(t.workerId),
  index("payroll_records_batch_worker_idx").on(t.batchId, t.workerId),
  index("payroll_records_status_idx").on(t.status),
  index("payroll_records_pay_status_idx").on(t.payStatus),
]);

// Itemized earnings / deductions per payroll record
export const payrollLineItemsTable = pgTable("payroll_line_items", {
  id: text("id").primaryKey(),
  recordId: text("record_id").notNull(),
  batchId: text("batch_id").notNull(),
  workerId: text("worker_id").notNull(),
  componentName: text("component_name").notNull(),
  componentCode: text("component_code").notNull(),
  componentType: text("component_type").notNull(), // earning | deduction | employer_contribution
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payroll_line_items_record_idx").on(t.recordId),
  index("payroll_line_items_batch_idx").on(t.batchId),
]);

// Payroll validation exceptions
export const payrollExceptionsTable = pgTable("payroll_exceptions", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  workerId: text("worker_id").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  severity: text("severity").notNull().default("warning"), // critical | error | warning | info
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ignoreReason: text("ignore_reason"),
  ignoredBy: text("ignored_by"),
  ignoredAt: timestamp("ignored_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payroll_exceptions_batch_idx").on(t.batchId),
  index("payroll_exceptions_batch_status_idx").on(t.batchId, t.status),
]);

// Step-by-step payroll computation trace
export const payrollTraceTable = pgTable("payroll_trace", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  recordId: text("record_id").notNull(),
  workerId: text("worker_id").notNull(),
  step: text("step").notNull(),
  formula: text("formula").notNull(),
  inputs: text("inputs").notNull().default("{}"),
  output: numeric("output", { precision: 12, scale: 4 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payroll_trace_record_idx").on(t.recordId),
  index("payroll_trace_batch_idx").on(t.batchId),
]);
