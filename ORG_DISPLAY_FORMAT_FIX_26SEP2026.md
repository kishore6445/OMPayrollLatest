# Organization Display Format Fix — 26 Sep 2026

Requirement: Organization should display as `Company Name — Organization Code / Location Code` (example: `OM Unique Pvt Ltd — OMUS`).

Implemented using existing `COMPANYMAST.corpID` as the Organization Code / Location Code. If `corpID` is blank, `compid` is used as a safe fallback.

Updated:
- `/api/scoped/companies` now returns `corpID`, `orgCode`, and `displayLabel` for unrestricted, explicitly scoped, and migrated-user fallback flows.
- Employee Add/Edit Company dropdown now receives the formatted label from the scoped API.
- User Add/Edit multi-organization selector continues to use the same formatted label.
- User Management list now shows organization labels with code.
- Company list now shows `Company Name — Code`.
- Company detail title and identity field now show Organization Code / Location Code.
- Company Add/Edit field previously labelled `Corp ID` is now labelled `Organization Code / Location Code`.

No DB migration is required. This uses the existing `corpID` column.
