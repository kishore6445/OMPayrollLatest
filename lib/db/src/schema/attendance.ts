import { pgTable, text, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";

// Attendance period — monthly open/close tracker per client
export const attendancePeriodsTable = pgTable("attendance_periods", {
  id: text("id").primaryKey(),
  month: text("month").notNull(),              // YYYY-MM
  clientId: text("client_id"),
  status: text("status").notNull().default("open"), // open | submitted | approved | locked
  totalWorkingDays: integer("total_working_days").notNull().default(26),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
  uploadedBy: text("uploaded_by"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("att_periods_month_idx").on(t.month),
  index("att_periods_client_month_idx").on(t.clientId, t.month),
]);

// Attendance upload batch
export const attendanceBatchesTable = pgTable("attendance_batches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  month: text("month").notNull(),
  clientId: text("client_id"),
  status: text("status").notNull().default("uploaded"), // uploaded | validated | submitted | approved | locked | returned
  totalRecords: integer("total_records").notNull().default(0),
  validRecords: integer("valid_records").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  warningCount: integer("warning_count").notNull().default(0),
  uploadedBy: text("uploaded_by").notNull(),
  submittedBy: text("submitted_by"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  remarks: text("remarks"),
  returnRemarks: text("return_remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("att_batches_month_idx").on(t.month),
  index("att_batches_client_idx").on(t.clientId),
  index("att_batches_status_idx").on(t.status),
]);

// Per-worker monthly attendance record — maps to ATTENDANCE (attendance portion)
export const attendanceRecordsTable = pgTable("attendance_records", {
  id: text("id").primaryKey(),
  batchId: text("batch_id"),
  workerId: text("worker_id").notNull(),
  clientId: text("client_id").notNull(),
  siteId: text("site_id"),
  month: text("month").notNull(),              // YYYY-MM
  // Working days
  totalWorkingDays: numeric("total_working_days", { precision: 5, scale: 1 }).notNull().default("26"),
  presentDays: numeric("present_days", { precision: 5, scale: 1 }).notNull().default("0"),
  payableDays: numeric("payable_days", { precision: 5, scale: 1 }).notNull().default("0"),
  lwpDays: numeric("lwp_days", { precision: 5, scale: 1 }).notNull().default("0"),
  // Leave types — maps to ATTENDANCE.EL, CL, SL, PL, FL columns
  elDays: numeric("el_days", { precision: 5, scale: 1 }).notNull().default("0"),
  clDays: numeric("cl_days", { precision: 5, scale: 1 }).notNull().default("0"),
  slDays: numeric("sl_days", { precision: 5, scale: 1 }).notNull().default("0"),
  plDays: numeric("pl_days", { precision: 5, scale: 1 }).notNull().default("0"),
  // Off types
  holidayDays: numeric("holiday_days", { precision: 5, scale: 1 }).notNull().default("0"),
  weeklyOffDays: numeric("weekly_off_days", { precision: 5, scale: 1 }).notNull().default("0"),
  compOffDays: numeric("comp_off_days", { precision: 5, scale: 1 }).notNull().default("0"),
  // Overtime
  otHours: numeric("ot_hours", { precision: 6, scale: 2 }).notNull().default("0"),
  otDays: numeric("ot_days", { precision: 5, scale: 2 }).notNull().default("0"),
  // Arrear
  arrearDays: numeric("arrear_days", { precision: 5, scale: 1 }).notNull().default("0"),
  status: text("status").notNull().default("pending"),
  uploadId: text("upload_id"),
  exceptions: text("exceptions").notNull().default("[]"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("att_records_month_idx").on(t.month),
  index("att_records_worker_idx").on(t.workerId),
  index("att_records_client_idx").on(t.clientId),
  index("att_records_batch_idx").on(t.batchId),
  index("att_records_status_idx").on(t.status),
  index("att_records_worker_month_idx").on(t.workerId, t.month),
]);

// Attendance validation exceptions
export const attendanceExceptionsTable = pgTable("attendance_exceptions", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  recordId: text("record_id"),
  rowNumber: integer("row_number"),
  exceptionCode: text("exception_code").notNull(),
  severity: text("severity").notNull().default("error"), // error | warning | info
  field: text("field"),
  message: text("message").notNull(),
  originalValue: text("original_value"),
  correctedValue: text("corrected_value"),
  status: text("status").notNull().default("open"), // open | resolved | ignored
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("att_exceptions_batch_idx").on(t.batchId),
]);

// Month-level attendance approval lock — maps to LOCK_DATA
export const attendanceLocksTable = pgTable("attendance_locks", {
  id: text("id").primaryKey(),
  month: text("month").notNull(),
  clientId: text("client_id").notNull(),
  batchId: text("batch_id"),
  siteId: text("site_id"),
  status: text("status").notNull().default("approved"),
  lockedBy: text("locked_by").notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  remarks: text("remarks"),
}, (t) => [
  index("att_locks_month_idx").on(t.month),
  index("att_locks_client_idx").on(t.clientId),
]);
