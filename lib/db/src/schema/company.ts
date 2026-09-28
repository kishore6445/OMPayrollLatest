import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Single company config — maps to COMPANYMAST (one row per deployment)
export const companiesTable = pgTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  pan: text("pan"),
  cin: text("cin"),
  tan: text("tan"),
  gstin: text("gstin"),
  pfNumber: text("pf_number"),
  esiNumber: text("esi_number"),
  ptNumber: text("pt_number"),
  lwfNumber: text("lwf_number"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  logoUrl: text("logo_url"),
  financialYearStart: text("financial_year_start").notNull().default("04"), // month (01-12)
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Legal registrations per state / PF establishment — maps to PFZONE + COMPANYESI + PAYPRAM
export const legalEntitiesTable = pgTable("legal_entities", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  state: text("state").notNull(),
  pfNumber: text("pf_number"),
  pfZoneId: text("pf_zone_id"),
  pfEstCode: text("pf_est_code"),
  esiNumber: text("esi_number"),
  esiZoneId: text("esi_zone_id"),
  ptNumber: text("pt_number"),
  lwfNumber: text("lwf_number"),
  tan: text("tan"),
  gstin: text("gstin"),
  // PF wage calculation basis: prorated_earned | gross | basic_da
  pfWageBasis: text("pf_wage_basis").notNull().default("prorated_earned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("legal_entities_company_idx").on(t.companyId),
  index("legal_entities_state_idx").on(t.state),
]);

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;

export const insertLegalEntitySchema = createInsertSchema(legalEntitiesTable).omit({ createdAt: true, updatedAt: true });
export type InsertLegalEntity = z.infer<typeof insertLegalEntitySchema>;
export type LegalEntity = typeof legalEntitiesTable.$inferSelect;
