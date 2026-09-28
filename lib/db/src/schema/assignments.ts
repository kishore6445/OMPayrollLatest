import { pgTable, text, timestamp, numeric, integer, index } from "drizzle-orm/pg-core";

// Salary component catalog — component head definitions
export const salaryComponentsTable = pgTable("salary_components", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  type: text("type").notNull(),               // earning | deduction | employer_contribution
  isTaxable: text("is_taxable").notNull().default("true"),
  isPfWage: text("is_pf_wage").notNull().default("false"),
  isEsiWage: text("is_esi_wage").notNull().default("false"),
  calcType: text("calc_type").notNull().default("fixed"), // fixed | percent_of_basic | percent_of_gross
  calcValue: numeric("calc_value", { precision: 8, scale: 4 }),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Worker assignment to client / site / legal entity
export const assignmentsTable = pgTable("assignments", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  clientId: text("client_id").notNull(),
  siteId: text("site_id").notNull(),
  legalEntityId: text("legal_entity_id"),
  designationId: text("designation_id"),       // FK → designation_master
  gradeId: text("grade_id"),                   // FK → grade_master
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("assignments_worker_idx").on(t.workerId),
  index("assignments_client_idx").on(t.clientId),
  index("assignments_site_idx").on(t.siteId),
  index("assignments_status_idx").on(t.status),
]);

// Per-worker salary structure + component breakdown — maps to EMPMAST salary cols + EMPRATE
export const salaryStructuresTable = pgTable("salary_structures", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull(),
  clientId: text("client_id"),
  siteId: text("site_id"),
  legalEntityId: text("legal_entity_id"),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  wageType: text("wage_type").notNull().default("monthly"), // monthly | daily
  grossMonthly: numeric("gross_monthly", { precision: 12, scale: 2 }).notNull(),
  dailyWage: numeric("daily_wage", { precision: 10, scale: 2 }),
  basicAmount: numeric("basic_amount", { precision: 12, scale: 2 }),
  hraAmount: numeric("hra_amount", { precision: 12, scale: 2 }),
  vdaAmount: numeric("vda_amount", { precision: 12, scale: 2 }),
  conveyanceAmount: numeric("conveyance_amount", { precision: 12, scale: 2 }),
  // Full component breakdown as JSON array of {code, amount}
  components: text("components").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("salary_structures_worker_idx").on(t.workerId),
  index("salary_structures_worker_effective_idx").on(t.workerId, t.effectiveFrom),
  index("salary_structures_client_idx").on(t.clientId),
]);
