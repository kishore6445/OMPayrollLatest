import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

// Employee master — maps to EMPMAST (core demography + classification)
export const workersTable = pgTable("workers", {
  id: text("id").primaryKey(),
  employeeCode: text("employee_code").notNull().unique(),
  name: text("name").notNull(),
  gender: text("gender"),                        // M | F | Other
  dateOfBirth: text("date_of_birth"),            // YYYY-MM-DD
  dateOfJoining: text("date_of_joining").notNull(),
  dateOfLeaving: text("date_of_leaving"),         // DOL — maps to EMPMAST.DOL
  dolReason: text("dol_reason"),                  // resignation | termination | retirement | death
  // Classification
  designationId: text("designation_id"),          // FK → designation_master
  gradeId: text("grade_id"),                      // FK → grade_master
  departmentId: text("department_id"),            // FK → department_master
  categoryId: text("category_id"),               // FK → worker_category_master
  // Deployment
  clientId: text("client_id"),
  siteId: text("site_id"),
  branchId: text("branch_id"),                   // FK → branch_master
  zoneId: text("zone_id"),                       // FK → zone_master
  legalEntityId: text("legal_entity_id"),         // FK → legal_entities
  state: text("state"),
  // Contact / Identity
  phone: text("phone"),
  phoneAlt: text("phone_alt"),
  email: text("email"),
  aadhar: text("aadhar"),
  panNumber: text("pan_number"),                  // needed for TDS
  fatherName: text("father_name"),
  motherName: text("mother_name"),               // EMPMAST.mothername
  spouseName: text("spouse_name"),
  bloodGroup: text("blood_group"),
  maritalStatus: text("marital_status"),          // single | married | divorced | widowed
  // Identity cards — maps to EMPMAST.CardNo / tokanno
  cardNo: text("card_no"),                        // Security card / ID card number
  tokenNo: text("token_no"),                      // Token / badge number
  // Addresses — maps to EMPMAST.localadd1/localadd2 + permanentadd1/permanentadd2
  localAddress: text("local_address"),
  localPin: text("local_pin"),
  permanentAddress: text("permanent_address"),
  permanentPin: text("permanent_pin"),
  // Payment
  modeOfPay: text("mode_of_pay").notNull().default("bank"), // bank | cash | cheque
  // Status
  status: text("status").notNull().default("active"),       // active | inactive | left
  workStatus: text("work_status"),               // posted | transferred | on_leave etc.
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("workers_status_idx").on(t.status),
  index("workers_client_idx").on(t.clientId),
  index("workers_site_idx").on(t.siteId),
  index("workers_state_idx").on(t.state),
  index("workers_created_idx").on(t.createdAt),
  index("workers_branch_idx").on(t.branchId),
]);

// Bank account details — maps to EMPMAST (bank cols) + EmpBankVerify
export const workerBankDetailsTable = pgTable("worker_bank_details", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull().unique(),
  bankMasterId: text("bank_master_id"),           // FK → bank_master
  accountNumber: text("account_number").notNull(),
  bankName: text("bank_name").notNull(),
  ifscCode: text("ifsc_code").notNull(),
  accountType: text("account_type").notNull().default("savings"), // savings | current
  holderName: text("holder_name"),                // name as in bank
  bankBranchName: text("bank_branch_name"),       // EMPMAST.BankBranchName
  verified: boolean("verified").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("worker_bank_worker_idx").on(t.workerId),
]);

// Statutory enrollments — maps to EMPMAST (statutory flags) + EMPPFMASTER
export const workerStatutoryProfilesTable = pgTable("worker_statutory_profiles", {
  id: text("id").primaryKey(),
  workerId: text("worker_id").notNull().unique(),
  pfUan: text("pf_uan"),                         // UAN number
  pfNumber: text("pf_number"),
  esiNumber: text("esi_number"),
  esicDispensaryCode: text("esic_dispensary_code"),
  ptRegistrationNumber: text("pt_registration_number"),
  pfEnrolled: boolean("pf_enrolled").notNull().default(false),
  esiEnrolled: boolean("esi_enrolled").notNull().default(false),
  ptApplicable: boolean("pt_applicable").notNull().default(false),
  lwfApplicable: boolean("lwf_applicable").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("worker_statutory_worker_idx").on(t.workerId),
]);
