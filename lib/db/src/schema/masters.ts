import { pgTable, text, timestamp, numeric, integer, boolean, index } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Reference / lookup masters — maps to STATEMASTER, DEPTMAST, DESIGNATIONMASTER,
// GRADEMASTER, categorymaster, ZONE_MASTER, BANKMASTER, PFZONE, HOLIDAY*
// ---------------------------------------------------------------------------

// State config + LWF rates — maps to STATEMASTER
export const stateMasterTable = pgTable("state_master", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),       // e.g. "KA", "MH"
  name: text("name").notNull(),
  lwfEmployeeRate: numeric("lwf_employee_rate", { precision: 8, scale: 2 }).notNull().default("0"),
  lwfEmployerRate: numeric("lwf_employer_rate", { precision: 8, scale: 2 }).notNull().default("0"),
  lwfFrequency: text("lwf_frequency").notNull().default("annual"), // annual | semi_annual | monthly
  lwfApplicableMonth: text("lwf_applicable_month"), // month code "06","12" etc
  minWage: numeric("min_wage", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// PT slabs — maps to PROFESSIONALTAX
export const ptSlabsTable = pgTable("pt_slabs", {
  id: text("id").primaryKey(),
  stateCode: text("state_code").notNull(),
  frequency: text("frequency").notNull().default("monthly"), // monthly | annual
  lowLimit: numeric("low_limit", { precision: 10, scale: 2 }).notNull().default("0"),
  highLimit: numeric("high_limit", { precision: 10, scale: 2 }),   // null = no upper limit
  ptAmount: numeric("pt_amount", { precision: 8, scale: 2 }).notNull().default("0"),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("pt_slabs_state_idx").on(t.stateCode),
]);

// PF/ESI statutory rates — maps to PAYPRAM
export const payrollParamsTable = pgTable("payroll_params", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  // PF rates
  pfEmployeeRate: numeric("pf_employee_rate", { precision: 6, scale: 4 }).notNull().default("12"),
  pfEmployerRate: numeric("pf_employer_rate", { precision: 6, scale: 4 }).notNull().default("12"),
  pfAdminChargeRate: numeric("pf_admin_charge_rate", { precision: 6, scale: 4 }).notNull().default("0.50"),
  epsRate: numeric("eps_rate", { precision: 6, scale: 4 }).notNull().default("8.33"),
  pfWageCeiling: numeric("pf_wage_ceiling", { precision: 10, scale: 2 }).notNull().default("15000"),
  // ESI rates
  esiEmployeeRate: numeric("esi_employee_rate", { precision: 6, scale: 4 }).notNull().default("0.75"),
  esiEmployerRate: numeric("esi_employer_rate", { precision: 6, scale: 4 }).notNull().default("3.25"),
  esiWageCeiling: numeric("esi_wage_ceiling", { precision: 10, scale: 2 }).notNull().default("21000"),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payroll_params_company_idx").on(t.companyId),
]);

// PF zones / establishments — maps to PFZONE
export const pfZonesTable = pgTable("pf_zones", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  pfEstCode: text("pf_est_code"),
  state: text("state"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("pf_zones_company_idx").on(t.companyId),
]);

// Department master — maps to DEPTMAST
export const departmentMasterTable = pgTable("department_master", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Designation master — maps to DESIGNATIONMASTER
export const designationMasterTable = pgTable("designation_master", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  dutyHours: numeric("duty_hours", { precision: 5, scale: 2 }),
  category: text("category"),                 // Security / Housekeeping / Facility
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Grade / pay-band master — maps to GRADEMASTER
export const gradeMasterTable = pgTable("grade_master", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  hraRate: numeric("hra_rate", { precision: 6, scale: 4 }),   // percentage
  minBasic: numeric("min_basic", { precision: 10, scale: 2 }),
  maxBasic: numeric("max_basic", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Worker category — maps to categorymaster (Security / Housekeeping / Facility / Manpower)
export const workerCategoryMasterTable = pgTable("worker_category_master", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Zone master — maps to ZONE_MASTER + BILLINGZONE
export const zoneMasterTable = pgTable("zone_master", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  zoneType: text("zone_type").notNull().default("billing"), // billing | geographic | esi
  state: text("state"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Bank master — maps to BANKMASTER
export const bankMasterTable = pgTable("bank_master", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  ifscPrefix: text("ifsc_prefix"),           // first 4 chars of IFSC (bank code)
  corpId: text("corp_id"),                    // net-banking corporate login ID
  neftFormat: text("neft_format"),            // SBI | HDFC | ICICI | generic
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Holiday calendar — maps to HOLIDAY + UNITHOLIDAY
export const holidayCalendarTable = pgTable("holiday_calendar", {
  id: text("id").primaryKey(),
  siteId: text("site_id"),                    // null = company-wide holiday
  stateCode: text("state_code"),              // null = all states
  holidayDate: text("holiday_date").notNull(), // YYYY-MM-DD
  name: text("name").notNull(),
  holidayType: text("holiday_type").notNull().default("national"), // national | state | optional | restricted
  year: integer("year").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("holidays_year_idx").on(t.year),
  index("holidays_site_year_idx").on(t.siteId, t.year),
]);

// Site payroll config — decomposed from UNITMASTER (OT / days / shift settings)
export const sitePayrollConfigTable = pgTable("site_payroll_config", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull().unique(),
  // Working days config
  monthDays: integer("month_days").notNull().default(26),
  otMonthDays: integer("ot_month_days").notNull().default(26),
  hrsPerDay: numeric("hrs_per_day", { precision: 5, scale: 2 }).notNull().default("8"),
  // OT settings: 0=none 1=hrs 2=days
  otSetting: integer("ot_setting").notNull().default(0),
  otRateMultiplier: numeric("ot_rate_multiplier", { precision: 5, scale: 2 }).notNull().default("1.5"),
  // Per-day rate calculation: gross | basic | basic_da
  perDayRateMode: text("per_day_rate_mode").notNull().default("gross"),
  esiOnOt: boolean("esi_on_ot").notNull().default(false),
  pfOnOt: boolean("pf_on_ot").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Site compliance config — decomposed from UNITMASTER (bonus / gratuity / LWF overrides)
export const siteComplianceConfigTable = pgTable("site_compliance_config", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull().unique(),
  // Bonus
  isBonus: boolean("is_bonus").notNull().default(false),
  bonusRate: numeric("bonus_rate", { precision: 6, scale: 4 }).notNull().default("8.33"),
  bonusLimit: numeric("bonus_limit", { precision: 10, scale: 2 }),
  bonusMinWage: numeric("bonus_min_wage", { precision: 10, scale: 2 }),
  // Gratuity
  isGratuity: boolean("is_gratuity").notNull().default(false),
  gratuityRate: numeric("gratuity_rate", { precision: 6, scale: 4 }).notNull().default("4.81"),
  // LWF overrides (null = use state defaults from state_master)
  empLwfOverride: numeric("emp_lwf_override", { precision: 8, scale: 2 }),
  emprLwfOverride: numeric("empr_lwf_override", { precision: 8, scale: 2 }),
  // PT override
  ptExempt: boolean("pt_exempt").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
