import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";

// Full user action log
export const auditLogsTable = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  entityId: text("entity_id").notNull(),
  entityType: text("entity_type").notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  ipAddress: text("ip_address"),
  changes: text("changes").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_logs_created_idx").on(t.createdAt),
  index("audit_logs_module_idx").on(t.module),
  index("audit_logs_user_idx").on(t.userId),
  index("audit_logs_entity_idx").on(t.entityId),
]);

// File export / download log
export const exportLogsTable = pgTable("export_logs", {
  id: text("id").primaryKey(),
  module: text("module").notNull(),
  exportType: text("export_type").notNull(),
  filters: text("filters").notNull().default("{}"),
  rowCount: integer("row_count"),
  fileUrl: text("file_url"),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("export_logs_created_idx").on(t.createdAt),
  index("export_logs_module_idx").on(t.module),
]);

// Background job tracker
export const systemJobsTable = pgTable("system_jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"), // pending | running | done | failed
  progress: integer("progress"),
  total: integer("total"),
  result: text("result").notNull().default("{}"),
  error: text("error"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("system_jobs_status_idx").on(t.status),
]);

// Step-by-step job log
export const jobLogsTable = pgTable("job_logs", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull(),
  level: text("level").notNull().default("info"),
  message: text("message").notNull(),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("job_logs_job_idx").on(t.jobId),
]);

// Report template definitions
export const reportDefinitionsTable = pgTable("report_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  reportType: text("report_type").notNull(),
  description: text("description"),
  configJson: text("config_json").notNull().default("{}"),
  isSystem: text("is_system").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Stored file objects
export const fileObjectsTable = pgTable("file_objects", {
  id: text("id").primaryKey(),
  module: text("module").notNull(),
  entityId: text("entity_id"),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  sizeBytes: integer("size_bytes"),
  storageUrl: text("storage_url"),
  status: text("status").notNull().default("available"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("file_objects_entity_idx").on(t.entityId),
  index("file_objects_module_idx").on(t.module),
]);

// File access / download log
export const fileAccessLogsTable = pgTable("file_access_logs", {
  id: text("id").primaryKey(),
  fileObjectId: text("file_object_id").notNull(),
  userId: text("user_id").notNull(),
  userName: text("user_name").notNull(),
  ipAddress: text("ip_address"),
  accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("file_access_file_idx").on(t.fileObjectId),
]);
