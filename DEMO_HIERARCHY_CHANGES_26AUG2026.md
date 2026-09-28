# Demo Hierarchy Changes — 26 Aug 2026

This build is based on the last working `PayrollOM_Onboarding_PreCreate_Penniless_Complete_24Aug2026(2)` codebase and applies only the agreed onboarding/master-data changes.

## Final onboarding hierarchy

Company / Entity → Client → Department → Designation → Employee

- `Client` is a business/UI label backed by `UNITMASTER` (`unitcode`, `Unitname`, and all existing Unit configuration fields).
- Branch is not used in Employee Onboarding.
- The separate `CLIENTMASTER` step is not used in Employee Onboarding or the visible Client Master screen.
- Department is global (`DEPTMAST`).
- Designation is global (`DESIGNATIONMASTER`).
- `/workers` is the canonical Employee module.

## Client Master

The existing Unit form is reused as the Client form so none of the operational fields are lost. Create/Edit still calls `/api/units` and writes to `UNITMASTER`; the visible application route is `/clients`.

## Legacy compatibility

No legacy database tables were deleted or renamed. BRANCH, CLIENTMASTER and old Unit API routes remain available for compatibility, but are not shown in the main navigation/onboarding flow.

## Database migration

No new database migration is required for these hierarchy/UI changes.
