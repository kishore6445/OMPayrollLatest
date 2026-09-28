# Employee, Client & Organisation Deletion — Local change (19 Sep 2026)

Implemented on top of the Grade + Category local build.

## Employee deletion
- Added `DELETE /api/workers/:EmpCode?compid=<id>`.
- Available from Employee Detail for users with `workers:write`.
- Permanently deletes the `EMPMAST` row and the mapped `app_users` Employee login in one transaction.
- Scope checks still apply.
- If PostgreSQL reports a foreign-key dependency (payroll/attendance/history), deletion is blocked with HTTP 409 instead of forcing it.

## Client deletion
- Added `DELETE /api/clients/:clientcode` using existing `clients:write` permission.
- **Hard rule:** a client cannot be deleted when any `EMPMAST` rows are assigned to that `clientcode`.
- The API returns HTTP 409 with the assigned employee count.
- When there are zero employees, app-owned scope mappings and the client's `UNITMASTER` rows are deleted with the client in one transaction.
- Unknown legacy FK dependencies remain protected by PostgreSQL and return HTTP 409.

## Organisation / Company deletion
- Added `DELETE /api/company/:compid`.
- An organisation can only be deleted when it is empty: zero employees, clients, sites and branches.
- App-owned user-scope mappings and optional company categories are cleaned up when deletion is allowed.
- Unknown legacy FK dependencies remain protected by PostgreSQL.

## UI
Delete buttons with destructive confirmation dialogs were added to:
- Employee Detail
- Client Detail
- Company / Organisation Detail

The API error text is shown to the user when deletion is blocked.

## Database changes
No new schema or migration is required for deletion.
