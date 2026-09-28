# Grade + Category Master — Local implementation (19 Sep 2026)

## What was added
- Setup > Grades
  - list/search
  - Add Grade
  - View Grade
  - Edit Grade
  - writes to existing `GRADEMASTER`
- Setup > Categories
  - list/search
  - Company/Entity filter
  - Add Category
  - View Category
  - Edit Category
  - writes to `categorymaster`
- Employee form continues to only consume values from `/api/masters/grades` and `/api/masters/categories?compid=...`.

## Ownership
- Grade is shared/global because `GRADEMASTER` has no `compid` in the legacy design.
- Category is company-scoped by `compid`.

## Important local DB note
`GRADEMASTER` already exists locally. `categorymaster` was confirmed missing locally.
Run `migrations/20260919_create_categorymaster_local.sql` once against the local `payrollom_client` database before using Categories.

This SQL does not modify existing tables and uses `CREATE TABLE IF NOT EXISTS`.

## Permissions
The new master screens reuse the existing `departments:read` / `departments:write` setup-master permission family. Admin bypass remains unchanged. No app_permissions schema/data migration is required.

## No delete yet
Delete was intentionally not added here. Dependency-safe deletion belongs to the separate client enhancement for employee/client/organization deletion.
