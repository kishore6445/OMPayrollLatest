# Client Excel Import / Export — 26 Sep 2026

Implemented on the Client Master (`UNITMASTER`) flow.

## UI
- Client Master now shows Template, Import and Export actions based on `units:write` / `units:export` permissions.
- Template downloads `Client_Import_Template.xlsx`.
- Import uses Upload -> Validate -> Review Errors -> Confirm Import.
- Import is all-or-nothing; no rows are written when validation errors exist.
- Export downloads the currently filtered/scope-limited Client records.

## Import validation
- Required: `Unitname`, `compcode`.
- `unitcode` is optional. If blank it is auto-generated safely; if provided it must be globally unique.
- Existing Organization is required; import never creates Organizations implicitly.
- Zone is validated when supplied.
- Non-unrestricted users may import only inside their assigned Organization scope.
- Duplicate Client ID and duplicate Client name under the same Organization are blocked, including duplicates inside the workbook.
- Salary component names (`SalHead1..17`) and Client defaults (`SalHeadDefault1..17`) are supported.
- A salary default without its matching component name is blocked.

## Export
- Requires `units:export`.
- Respects logged-in User Client scope.
- Respects current Company, Zone and Search filters.
- Includes Client Master fields and Salary Component names/default values.

## Database
No new migration specifically for Client Import/Export. Migration `009_client_salary_component_defaults.sql` must already be applied because the template/export includes the 17 Client salary-default columns.
