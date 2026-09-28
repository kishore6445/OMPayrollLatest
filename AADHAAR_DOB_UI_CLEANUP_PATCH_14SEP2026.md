# Aadhaar DigiLocker DOB + Onboarding UI Patch — 14 Sep 2026

## Changes

1. Fixed Aadhaar DigiLocker DOB autofill shifting one day backwards.
   - Aadhaar DOB is now normalized as a date-only value.
   - Supports `DD-MM-YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, and `YYYY/MM/DD` style values.
   - No `new Date(year, month, day).toISOString()` timezone conversion is used in the DigiLocker DOB mapping.
   - Example: `10-08-1980` stays `1980-08-10` in the form instead of becoming the previous day.

2. Removed the legacy UIDAI Face test flow from the employee onboarding Aadhaar section.
   - Removed the "Legacy UIDAI Face test flow" expandable UI.
   - Removed the legacy/test wording from the Aadhaar field hint.
   - The existing Aadhaar Face implementation files/backend are left untouched; only the onboarding UI entry point was removed.

## File changed

- `artifacts/payroll-nexus/src/pages/workers/form.tsx`

## Validation note

A full TypeScript build was not run in this sandbox because project dependencies / pnpm are not installed here. The patch is intentionally limited to the employee onboarding form.
