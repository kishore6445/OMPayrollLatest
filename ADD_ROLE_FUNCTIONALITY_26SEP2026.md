# Add Role Functionality — 26 Sep 2026

Implemented custom Role creation in the existing Roles & Permissions module.

## Backend
- Added `POST /api/roles` guarded by `users:write` (Admin bypass applies through existing RBAC middleware).
- Validates role name, duplicate names (case-insensitive), description length, and permission names.
- Creates the role and selected permissions in one database transaction.
- Does not alter seeded roles or existing users.
- Logs `role.create` to the existing audit log.
- No database migration is required; uses existing `app_roles` and `app_permissions` tables.

## Frontend
- Added **Add Role** button on Roles & Permissions page for authorized users.
- Role Name + Description fields.
- Permission matrix grouped by module with Read / Write / Export / Delete checkboxes.
- Requires at least one permission.
- New role refreshes immediately after creation and becomes available in User Management because the existing User role dropdown already loads `/api/roles`.

## Verification
- TypeScript syntax/transpile check passed for modified backend and frontend files.
