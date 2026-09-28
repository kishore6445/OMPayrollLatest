# User → Client Assignment (23 Sep 2026)

- No `app_users` schema change.
- Non-employee restricted users are assigned directly to one or more Clients in Add/Edit User.
- UI loads active Client–Branch mappings from `BRANCHCLIENT`, displays each Client once, and automatically derives Company/Branch scope.
- Persistence continues through existing `PUT /api/users/:id/scope` into `USERCLIENT`, `USERBRANCH`, and `USERCOMPANY`.
- Editing a user now loads only active `USERCLIENT` / `USERBRANCH` mappings.
- Employee users remain derived from `EMPMAST`; Admin and Payroll Manager remain unrestricted per existing role rules.
