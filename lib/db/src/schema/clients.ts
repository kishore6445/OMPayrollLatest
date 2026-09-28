import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

// Client companies — maps to CLIENTMASTER
export const clientsTable = pgTable("clients", {
  id: text("id").primaryKey(),
  code: text("code").unique(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  gstin: text("gstin"),
  pan: text("pan"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  billingZoneId: text("billing_zone_id"),      // FK → zone_master
  industry: text("industry"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("clients_status_idx").on(t.status),
  index("clients_state_idx").on(t.state),
]);

// Deployment sites / units — maps to UNITMASTER (core fields only)
// OT / days / bonus / gratuity config lives in site_payroll_config and site_compliance_config
export const sitesTable = pgTable("sites", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  code: text("code"),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state").notNull(),
  pincode: text("pincode"),
  // Hierarchy / classification
  branchId: text("branch_id"),                 // FK → branch_master (new in OM)
  segmentId: text("segment_id"),               // Security / Housekeeping / Facility
  billingZoneId: text("billing_zone_id"),       // FK → zone_master
  pfZoneId: text("pf_zone_id"),                // FK → pf_zones
  legalEntityId: text("legal_entity_id"),       // FK → legal_entities
  zone: text("zone"),                           // min-wage zone tag (e.g. Zone 1 / Zone 2 / Zone 3)
  // Contract period — maps to UNITMASTER.contractdate / terminatedate
  contractDate: text("contract_date"),            // date contract started (YYYY-MM-DD)
  terminationDate: text("termination_date"),      // date contract ended / expected to end
  unitType: text("unit_type"),                    // UNITMASTER.unittype — e.g. Residential / Commercial / Industrial
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sites_client_idx").on(t.clientId),
  index("sites_state_idx").on(t.state),
  index("sites_branch_idx").on(t.branchId),
  index("sites_status_idx").on(t.status),
]);

// Segment master — maps to SEGMENT_MASTER (Security / Housekeeping / Facility / Manpower)
export const segmentMasterTable = pgTable("segment_master", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Branch / regional office — maps to BRANCH + BRANCHOFFICE
export const branchMasterTable = pgTable("branch_master", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  state: text("state"),
  city: text("city"),
  address: text("address"),
  gstin: text("gstin"),
  esiZoneCode: text("esi_zone_code"),
  managerName: text("manager_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
