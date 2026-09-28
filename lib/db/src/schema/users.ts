import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// RBAC roles — maps to app_roles
export const rolesTable = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  isSystem: text("is_system").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Permission catalog — maps to app_permissions
export const permissionsTable = pgTable("permissions", {
  id: text("id").primaryKey(),
  module: text("module").notNull(),
  action: text("action").notNull(),
  label: text("label").notNull(),
  description: text("description"),
});

// Role → permission mapping
export const rolePermissionsTable = pgTable("role_permissions", {
  id: text("id").primaryKey(),
  roleId: text("role_id").notNull(),
  permissionId: text("permission_id").notNull(),
}, (t) => [
  index("role_permissions_role_idx").on(t.roleId),
]);

// System users — maps to app_users
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  roleId: text("role_id").notNull(),
  status: text("status").notNull().default("active"), // active | inactive | locked
  phone: text("phone"),
  branchId: text("branch_id"),                // optional branch restriction
  clientId: text("client_id"),                // optional client restriction (field executive)
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("users_role_idx").on(t.roleId),
  index("users_status_idx").on(t.status),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true, lastLoginAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
