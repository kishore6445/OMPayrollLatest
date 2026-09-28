# USERUNIT Scope Consistency Fix — 24 Sep 2026

- Adds additive `USERUNIT` mapping for app user -> business Client (`UNITMASTER.unitcode`).
- Add/Edit User Organization -> Client selector now lists UNITMASTER Clients.
- Restricted Employee creation uses scoped Companies/Clients.
- `/api/scoped/units` now enforces USERUNIT for restricted roles.
- Employee list/read/write scope uses `EMPMAST.unitcode`.
- Client Master Organization dropdowns use `/api/scoped/companies`.
- Existing legacy `USERCLIENT` is preserved; `app_users` schema is unchanged.

## Local DB setup
Run `migrations/20260924_create_userunit_scope.sql` once against the local payroll DB.
Then preview existing-user mappings with `pnpm backfill:user-unit-scope`.
Apply only after reviewing counts: `pnpm backfill:user-unit-scope -- --apply`.
