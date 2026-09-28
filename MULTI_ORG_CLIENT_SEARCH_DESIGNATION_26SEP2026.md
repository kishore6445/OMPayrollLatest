# Multi-Organization User Scope + Client Search + Organization Label + Designation Master

Implemented on 26-Sep-2026 on top of `OMpayroll_Edit_User_Change_Client_26Sep2026`.

## 1. Multiple Organizations per User
- Add User and Edit User now allow selecting more than one Organization.
- Each selected Organization has its own Client selector.
- At least one Client must be selected under every selected Organization.
- Saving continues to use the existing `USERCOMPANY` and `USERUNIT` tables; no new DB migration is required.
- Removing an Organization from the UI also removes its selected Client mappings from the submitted scope.
- Backend validation rejects Client mappings that do not belong to a selected Organization.

## 2. Client Search
- Client selector supports search by:
  - Client ID / Unit Code
  - Client Name
  - available location text
- Works independently under each selected Organization.

## 3. Organization Display Format
- `/api/masters/companies` now returns a compact label: `Company Name — Organization Code`.
- Legacy `COMPANYMAST` has no `LocationCode`/`OrgCode` column. `corpID` is used as the existing organization-code field when populated; otherwise the stable `compid` is used as fallback.
- Example output when `corpID = OMUS`: `OM Unique Pvt Ltd — OMUS`.

## 4. Designation Master
- Added `/designations` setup page.
- Added Add Designation and Edit Designation forms using existing `DESIGNATIONMASTER`.
- Fields: Designation Code, Designation Name, Display Name, Duty Hours, Description.
- Duplicate code/name validation included.
- Uses existing `departments:read` / `departments:write` master permissions.
- No database migration required.

## Safety
- No existing employee records are changed.
- No existing User scope tables are structurally changed.
- Existing explicit USERCOMPANY/USERUNIT mappings continue to be used.
- Migrated-user EMPMAST fallback behavior remains intact until explicit scope is saved.
