# OM Payroll hardening fixes — 26 Sep 2026

Included on top of OMpayroll_Client_Salary_Defaults_26Sep2026.

1. Designation Activate / Deactivate
- Added nullable-safe `DESIGNATIONMASTER.is_active` migration (010).
- Added activate/deactivate API actions.
- Designation list shows status and actions.
- Employee designation dropdown keeps inactive designations visible but disabled, so old employee records remain readable while inactive designations cannot be newly selected through the UI.

2. User + Organization/Client scope atomic save
- Add User now sends user fields and scope in one API request.
- Backend creates the user and writes USERCOMPANY / USERBRANCH / USERCLIENT / USERUNIT in one DB transaction.
- If scope validation or writing fails, user creation rolls back.
- Edit User now sends scope in the same PATCH only when the admin explicitly changes scope.
- User field changes and scope changes commit or roll back together.
- Role-only/name/email edits still preserve existing scope and migrated-user fallback.

3. Organization display source
- COMPANYMAST has no LocationCode/OrgCode column in the legacy schema.
- UI/API continue to use COMPANYMAST.corpID as the Organization Code, with compid as a fallback when corpID is blank.
- Display format remains `Company Name — Organization Code`.

4. Existing salary-default enhancement retained
- Migration 009 adds nullable UNITMASTER.SalHeadDefault1..17.
- Client defaults continue to prefill new employee EMPMAST.SalHead1..17 values without overwriting existing employees.

Required local DB migrations before testing this build:
- migrations/009_client_salary_component_defaults.sql
- migrations/010_designation_active_status.sql

TypeScript syntax/transpile checks passed for all files modified in this hardening pass. Full workspace typecheck was not runnable in this isolated environment because project node_modules are not installed here.
