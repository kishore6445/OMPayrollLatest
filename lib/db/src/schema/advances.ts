import { pgTable, text, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";

// Advance / loan account per worker — maps to ADVANCE_EMP + ADVANCE header
export const advanceAccountsTable = pgTable("advance_accounts", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  advanceType: text("advance_type").notNull().default("salary"), // salary | tool | security | emergency
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  installmentAmount: numeric("installment_amount", { precision: 10, scale: 2 }).notNull(),
  installmentCount: integer("installment_count").notNull().default(1),
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull(),
  disbursedDate: text("disbursed_date").notNull(),  // YYYY-MM-DD
  disbursedBy: text("disbursed_by"),
  status: text("status").notNull().default("active"), // active | closed | written_off
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("advance_accounts_worker_idx").on(t.workerId),
  index("advance_accounts_status_idx").on(t.status),
]);

// Monthly advance deduction against payroll — maps to ADVANCEMONTHLY + ADVANCEDETAIL
export const advanceTransactionsTable = pgTable("advance_transactions", {
  id: text("id").primaryKey(),
  advanceAccountId: text("advance_account_id").notNull(),
  workerId: text("worker_id").notNull(),
  month: text("month").notNull(),              // YYYY-MM
  installmentNumber: integer("installment_number").notNull(),
  deductionAmount: numeric("deduction_amount", { precision: 10, scale: 2 }).notNull(),
  runningBalance: numeric("running_balance", { precision: 12, scale: 2 }).notNull(),
  payrollBatchId: text("payroll_batch_id"),
  payrollRecordId: text("payroll_record_id"),
  status: text("status").notNull().default("scheduled"), // scheduled | deducted | skipped | reversed
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("advance_transactions_account_idx").on(t.advanceAccountId),
  index("advance_transactions_worker_month_idx").on(t.workerId, t.month),
  index("advance_transactions_batch_idx").on(t.payrollBatchId),
]);
