# User List Client Display Patch — 14 Sep 2026

## What changed

The User Management list now shows a **Client / Access** column.

- **Employee users:** client, branch and unit are derived automatically from `EMPMAST` using `app_users.employee_code + app_users.compid`. This means all existing 171 mapped Employee users display their current client without creating new `USERCLIENT` rows.
- **Restricted non-Employee users:** client/branch/company labels are aggregated from active `USERCLIENT` assignments.
- **Admin / Payroll Manager:** display `All clients` because those roles are intentionally unrestricted.
- If a restricted user has no active client assignment, the list displays `No client assigned`.

## Backend

`GET /api/users` now enriches each user row with:

- `company_display`
- `client_display`
- `branch_display`
- `unit_display`

No password/authentication data or access rules were changed.

## Frontend

`artifacts/payroll-nexus/src/pages/admin/users.tsx` displays the new scope information directly in the user table.
