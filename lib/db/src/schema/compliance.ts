import { pgTable, text, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";

// Compliance rules — min wage, LWF, state-level config not covered by pt_slabs / payroll_params
export const complianceRulesTable = pgTable("compliance_rules", {
  id: text("id").primaryKey(),
  legalEntityId: text("legal_entity_id"),
  state: text("state").notNull(),
  type: text("type").notNull(),               // min_wage | lwf | pf_exemption | esi_exemption
  name: text("name").notNull(),
  configJson: text("config_json").notNull().default("{}"),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  isPlaceholder: text("is_placeholder").notNull().default("true"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("compliance_rules_state_idx").on(t.state),
  index("compliance_rules_type_idx").on(t.type),
]);

// Monthly statutory liabilities (PF / ESI / PT / LWF) per batch
export const complianceLiabilitiesTable = pgTable("compliance_liabilities", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  legalEntityId: text("legal_entity_id"),
  month: text("month").notNull(),
  type: text("type").notNull(),               // pf | esi | pt | lwf
  employeeContribution: numeric("employee_contribution", { precision: 14, scale: 2 }).notNull().default("0"),
  employerContribution: numeric("employer_contribution", { precision: 14, scale: 2 }).notNull().default("0"),
  totalLiability: numeric("total_liability", { precision: 14, scale: 2 }).notNull().default("0"),
  workerCount: integer("worker_count").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | filed | paid
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("compliance_liabilities_batch_idx").on(t.batchId),
  index("compliance_liabilities_month_idx").on(t.month),
  index("compliance_liabilities_type_idx").on(t.type),
]);

// PF ECR / ESI return / PT return generated files — maps to UNITPFCHALLAN + UNITESICHALLAN
export const complianceReportsTable = pgTable("compliance_reports", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull(),
  type: text("type").notNull(),               // pf_ecr | esi_return | pt_return | lwf_return | form_3a
  month: text("month").notNull(),
  legalEntityId: text("legal_entity_id"),
  siteId: text("site_id"),
  status: text("status").notNull().default("generated"),
  rowCount: integer("row_count"),
  fileUrl: text("file_url"),
  generatedBy: text("generated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("compliance_reports_batch_idx").on(t.batchId),
  index("compliance_reports_type_idx").on(t.type),
  index("compliance_reports_month_idx").on(t.month),
]);
