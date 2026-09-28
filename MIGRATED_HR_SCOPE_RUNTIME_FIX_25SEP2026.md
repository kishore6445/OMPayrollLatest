# Migrated HR User scope runtime fix — 25 Sep 2026

This patch fixes migrated users whose role is changed from Employee to a restricted operational role such as HR Manager.

- Explicit USERCOMPANY/USERUNIT scope still wins.
- If explicit scope is absent, loadUserScope now safely derives the user's existing Organization and Unit from app_users + EMPMAST.
- /api/scoped/companies now falls back directly to app_users.compid, so Company / Entity does not disappear after a role change.
- Worker list/create/update/delete scope enforcement uses the same fallback through loadUserScope, so the UI lookup and backend authorization stay consistent.
- No database schema or data changes are required.
