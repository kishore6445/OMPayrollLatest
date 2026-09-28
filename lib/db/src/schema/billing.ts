import { pgTable, text, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";

// Billing rate rules per client — markup / service charge configuration
export const billingRulesTable = pgTable("billing_rules", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  siteId: text("site_id"),
  name: text("name").notNull(),
  ruleType: text("rule_type").notNull(),       // percent_markup | fixed_per_worker | percent_of_gross
  value: numeric("value", { precision: 10, scale: 4 }).notNull(),
  components: text("components").notNull().default("[]"),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("billing_rules_client_idx").on(t.clientId),
]);

// Client invoices — maps to BILL
export const invoicesTable = pgTable("invoices", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  clientId: text("client_id").notNull(),
  month: text("month").notNull(),              // YYYY-MM
  batchId: text("batch_id"),
  status: text("status").notNull().default("draft"), // draft | approved | sent | paid | cancelled
  workerCount: integer("worker_count").notNull().default(0),
  // Amounts
  grossPayTotal: numeric("gross_pay_total", { precision: 14, scale: 2 }).notNull().default("0"),
  serviceFeeTotal: numeric("service_fee_total", { precision: 14, scale: 2 }).notNull().default("0"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  // GST
  gstRate: numeric("gst_rate", { precision: 6, scale: 4 }).notNull().default("18"),
  cgst: numeric("cgst", { precision: 14, scale: 2 }).notNull().default("0"),
  sgst: numeric("sgst", { precision: 14, scale: 2 }).notNull().default("0"),
  igst: numeric("igst", { precision: 14, scale: 2 }).notNull().default("0"),
  gst: numeric("gst", { precision: 14, scale: 2 }).notNull().default("0"),
  // Adjustments
  tdsAmount: numeric("tds_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  deductionAmount: numeric("deduction_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  dueAmount: numeric("due_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  // Dates
  dueDate: text("due_date"),
  billPeriodFrom: text("bill_period_from"),
  billPeriodTo: text("bill_period_to"),
  // E-Invoice (IRN/ACK) — maps to BILL.Irn, AckNo, EinvoiceDate
  irn: text("irn"),
  ackNumber: text("ack_number"),
  ackDate: text("ack_date"),
  eInvoiceDate: text("e_invoice_date"),
  cancelReason: text("cancel_reason"),
  // Meta
  notes: text("notes"),
  generatedBy: text("generated_by"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("invoices_client_idx").on(t.clientId),
  index("invoices_batch_idx").on(t.batchId),
  index("invoices_status_idx").on(t.status),
  index("invoices_month_idx").on(t.month),
]);

// Invoice line items by designation — maps to CREATEBILL
export const invoiceLineItemsTable = pgTable("invoice_line_items", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull(),
  workerId: text("worker_id"),
  workerName: text("worker_name"),
  employeeCode: text("employee_code"),
  siteId: text("site_id"),
  siteName: text("site_name"),
  designationId: text("designation_id"),
  designationName: text("designation_name"),
  presentDays: numeric("present_days", { precision: 5, scale: 1 }),
  grossPay: numeric("gross_pay", { precision: 12, scale: 2 }).notNull(),
  serviceFee: numeric("service_fee", { precision: 12, scale: 2 }).notNull(),
  totalBeforeGst: numeric("total_before_gst", { precision: 12, scale: 2 }).notNull(),
  gst: numeric("gst", { precision: 12, scale: 2 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("invoice_line_items_invoice_idx").on(t.invoiceId),
  index("invoice_line_items_worker_idx").on(t.workerId),
]);

// Generated payslips
export const payslipsTable = pgTable("payslips", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  batchId: text("batch_id").notNull(),
  month: text("month").notNull(),
  grossPay: numeric("gross_pay", { precision: 12, scale: 2 }).notNull(),
  netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("generated"),
  fileUrl: text("file_url"),
  earnings: text("earnings").notNull().default("[]"),
  deductions: text("deductions").notNull().default("[]"),
  employerContributions: text("employer_contributions").notNull().default("[]"),
  downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
  downloadedBy: text("downloaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payslips_batch_idx").on(t.batchId),
  index("payslips_worker_idx").on(t.workerId),
]);

// Payslip print template config
export const payslipTemplatesTable = pgTable("payslip_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isDefault: text("is_default").notNull().default("false"),
  logoUrl: text("logo_url"),
  headerConfig: text("header_config").notNull().default("{}"),
  footerConfig: text("footer_config").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Bank NEFT file per payroll batch
export const bankFilesTable = pgTable("bank_files", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  bankName: text("bank_name").notNull(),
  format: text("format").notNull(),            // SBI | HDFC | ICICI | generic
  workerCount: integer("worker_count").notNull().default(0),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  payrollNetTotal: numeric("payroll_net_total", { precision: 14, scale: 2 }),
  reconciliationStatus: text("reconciliation_status").notNull().default("pending"),
  status: text("status").notNull().default("generated"),
  fileUrl: text("file_url"),
  createdBy: text("created_by"),
  downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
  downloadedBy: text("downloaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("bank_files_batch_idx").on(t.batchId),
]);

// Bank payment dispatch batches
export const payoutBatchesTable = pgTable("payout_batches", {
  id: text("id").primaryKey(),
  payrollBatchId: text("payroll_batch_id").notNull(),
  name: text("name").notNull(),
  bankName: text("bank_name").notNull(),
  format: text("format").notNull().default("txt"),
  status: text("status").notNull().default("pending"),
  workerCount: integer("worker_count").notNull().default(0),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  payrollNetTotal: numeric("payroll_net_total", { precision: 14, scale: 2 }).notNull().default("0"),
  reconciliationStatus: text("reconciliation_status").notNull().default("pending"),
  fileUrl: text("file_url"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("payout_batches_payroll_idx").on(t.payrollBatchId),
]);

// Individual payout line per worker
export const payoutItemsTable = pgTable("payout_items", {
  id: text("id").primaryKey(),
  payoutBatchId: text("payout_batch_id").notNull(),
  workerId: text("worker_id").notNull(),
  payrollRecordId: text("payroll_record_id").notNull(),
  accountNumber: text("account_number").notNull(),
  ifscCode: text("ifsc_code").notNull(),
  bankName: text("bank_name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payout_items_batch_idx").on(t.payoutBatchId),
]);
