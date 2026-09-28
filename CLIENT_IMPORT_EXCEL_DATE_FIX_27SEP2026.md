# Client Import Excel Date Fix — 27 Sep 2026

## Issue
Client Excel import validation could show rows as valid, but Confirm Import could fail with PostgreSQL errors such as:

`invalid input syntax for type timestamp: "46291"`

Excel stores genuine date cells internally as serial numbers. The lightweight XLSX parser correctly exposes the raw serial, but Client Import was passing it unchanged to `UNITMASTER.contractdate` / `UNITMASTER.terminatedate`.

## Fix
- Added date normalisation in `artifacts/api-server/src/routes/units.ts`.
- Excel serial dates are converted using the Excel 1900 date system (`1899-12-30` epoch).
- Example: `46291` -> `2026-09-26`.
- Supported text formats:
  - `YYYY-MM-DD`
  - ISO timestamps beginning with `YYYY-MM-DD`
  - `DD/MM/YYYY`
  - `DD-MM-YYYY`
- Invalid dates are now rejected during validation, before Confirm Import.
- Both normal Client create parsing and Client Excel import use the same date normaliser.

No database schema change is required.
