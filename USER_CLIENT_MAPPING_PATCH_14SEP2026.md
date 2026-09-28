# User ↔ Client / Employee Mapping Patch — 14 Sep 2026

## What changed

### 1. Employee login creation is tied to EMPMAST
When Role = `Employee`, Add User now shows an employee search by code/name.
Selecting an employee:
- fills the employee name
- sets the username to the employee code
- shows derived company/client/branch/unit
- sends `employee_code` + `compid` to the API

The API validates that the `(compid, EmpCode)` exists in EMPMAST and blocks duplicate employee logins.
Client/branch/unit are not manually duplicated in `app_users`; they remain derived from EMPMAST.

### 2. Client scope for restricted operational roles
For roles other than `Admin`, `Payroll Manager`, and `Employee`, Add/Edit User now shows the existing Company → Branch → Client access selector.
At least one client must be selected.
Assignments are saved to:
- USERCOMPANY
- USERBRANCH
- USERCLIENT

### 3. Worker list scope tightened
Restricted operational users are now filtered by both assigned company and assigned client(s), rather than company alone.

### 4. Safety rule
An existing non-Employee user cannot simply be edited into the `Employee` role, because that could create an Employee account without an EMPMAST identity mapping. Employee accounts must be created through Add User + employee selection.

## Important
The local database must contain these columns in `app_users` (they already exist in the current local database used for the 171 mapped employees):
- `employee_code text`
- `compid integer`

## Test checklist
1. Create HR Manager/Finance Manager/etc. and assign Company → Branch → Client.
2. Login as that user and confirm only assigned client employees are visible.
3. Create Employee user by searching EMPMAST.
4. Confirm employee code, company, client, branch and unit are displayed from EMPMAST.
5. Confirm an employee who already has a login is disabled in search results.
6. Confirm new Employee row has `employee_code` and `compid` populated.
7. Confirm first login still forces password change.
