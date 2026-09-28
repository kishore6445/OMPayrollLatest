# Employee Excel Import / Export — 26 Sep 2026

## Implemented

- Employees page now has **Template**, **Import**, and **Export** actions.
- Template downloads as a real `.xlsx` workbook without adding a new npm dependency.
- Import accepts `.xlsx` and follows: **Upload → Validate → Preview errors → Confirm Import**.
- No EMPMAST row is written during validation.
- Commit is all-or-nothing: if any row fails validation, import is blocked.
- Maximum 5,000 rows per upload.
- Employee export downloads a real `.xlsx` workbook and respects current list filters and logged-in user scope.
- Sensitive fields are exported only through the existing `workers:export` permission path.

## Validation / safety

- Required: EmpCode, EmpName, compid, DOJ, workstatus.
- Validates Company, Client/Unit, Department, active Designation, Grade and Category.
- Enforces logged-in User Organization/Client scope.
- Blocks duplicate `(compid, EmpCode)` both within the workbook and against EMPMAST.
- Rejoin rows require a different oldEmpcode and confirmed prior separation evidence; Inactive/Suspended alone does not qualify.
- When salary values are blank, configured Client Master `SalHeadDefault1..17` values are inherited during import.

## Aadhaar / UAN / ESIC rule

Excel may contain Aadhaar, UAN and ESIC/IP numbers, but import never treats them as verified.

- Aadhaar import sets KYC to No; DigiLocker/QR verification must be completed later from Employee Master.
- UAN number imports with `uan_verification_status = PENDING`.
- ESIC/IP number imports with `esic_verification_status = PENDING`.
- Verification timestamp/provider/reference remain null until the normal verification flow succeeds.

## Database changes

No new database migration is introduced specifically for Employee Import/Export.
The build still requires previously added migrations to have been applied:
- `008_pf_esic_verification.sql`
- `009_client_salary_component_defaults.sql`
- `010_designation_active_status.sql`
