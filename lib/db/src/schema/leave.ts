import { pgTable, text, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";

// Leave type definitions — maps to LEAVE_MASTER
export const leaveTypesTable = pgTable("leave_types", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),       // EL | CL | SL | PL | FL | ML
  name: text("name").notNull(),
  isEncashable: text("is_encashable").notNull().default("false"),
  carryForward: text("carry_forward").notNull().default("false"),
  maxCarryForwardDays: numeric("max_carry_forward_days", { precision: 5, scale: 1 }),
  accrualFrequency: text("accrual_frequency").notNull().default("annual"), // annual | monthly
  accrualDays: numeric("accrual_days", { precision: 5, scale: 1 }),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Running leave balance per worker per year — maps to LEAVEBALANCE
export const leaveBalancesTable = pgTable("leave_balances", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  leaveTypeId: text("leave_type_id").notNull(),
  year: integer("year").notNull(),             // calendar year e.g. 2026
  openingBalance: numeric("opening_balance", { precision: 6, scale: 1 }).notNull().default("0"),
  earned: numeric("earned", { precision: 6, scale: 1 }).notNull().default("0"),
  availed: numeric("availed", { precision: 6, scale: 1 }).notNull().default("0"),
  encashed: numeric("encashed", { precision: 6, scale: 1 }).notNull().default("0"),
  lapsed: numeric("lapsed", { precision: 6, scale: 1 }).notNull().default("0"),
  balance: numeric("balance", { precision: 6, scale: 1 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("leave_balances_worker_year_idx").on(t.workerId, t.year),
  index("leave_balances_worker_type_idx").on(t.workerId, t.leaveTypeId),
]);

// Leave applications and approvals — maps to LEAVE_TRANSACTION + LEAVEAPPROVAL
export const leaveTransactionsTable = pgTable("leave_transactions", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  leaveTypeId: text("leave_type_id").notNull(),
  fromDate: text("from_date").notNull(),        // YYYY-MM-DD
  toDate: text("to_date").notNull(),
  days: numeric("days", { precision: 5, scale: 1 }).notNull(),
  halfDay: text("half_day").notNull().default("false"),
  reason: text("reason"),
  status: text("status").notNull().default("applied"), // applied | approved | rejected | cancelled
  appliedBy: text("applied_by").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  month: text("month"),                         // YYYY-MM of the leave period
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("leave_transactions_worker_idx").on(t.workerId),
  index("leave_transactions_month_idx").on(t.month),
  index("leave_transactions_status_idx").on(t.status),
]);

// Leave encashment records — maps to LEAVEENCASHMENT
export const leaveEncashmentsTable = pgTable("leave_encashments", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  leaveTypeId: text("leave_type_id").notNull(),
  year: integer("year").notNull(),
  days: numeric("days", { precision: 5, scale: 1 }).notNull(),
  perDayAmount: numeric("per_day_amount", { precision: 10, scale: 2 }).notNull(),
  encashmentAmount: numeric("encashment_amount", { precision: 12, scale: 2 }).notNull(),
  payrollBatchId: text("payroll_batch_id"),     // linked payroll batch if paid via payroll
  month: text("month"),                         // YYYY-MM when paid
  status: text("status").notNull().default("pending"), // pending | processed | paid
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("leave_encashments_worker_idx").on(t.workerId),
]);
