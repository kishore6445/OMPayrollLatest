# Client Salary Components + Default Values — 26 Sep 2026

Implemented on top of the Multi-Organization / Client Search / Designation build.

## Behaviour
- Client Master Payroll tab exposes the existing 17 legacy salary component slots (`SalHead1..17`).
- Admin can maintain each component name and an optional default numeric value.
- Default values are stored in new nullable `UNITMASTER.SalHeadDefault1..17` columns.
- Employee onboarding continues to map salary component N to `EMPMAST.SalHeadN`.
- When a new Employee selects a Client, configured default values are prefilled.
- HR can edit the employee-level amounts before saving.
- When HR deliberately changes Client, salary head slots are reset to the newly selected Client's defaults.
- Editing an existing Employee does not overwrite saved employee salary values merely by opening the form.

## DB migration
Run `migrations/009_client_salary_component_defaults.sql` against the intended database before using the new Client salary-default fields.
The migration is additive only and all 17 new columns are nullable.
