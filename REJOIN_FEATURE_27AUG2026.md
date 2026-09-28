# Rejoinee Check — 27 Aug 2026

Implemented in Add Employee without changing the existing Employee ID persistence policy.

## Flow
1. Add Employee shows **Check if this employee is a rejoinee** above the form.
2. HR enters the employee's previous Employee ID and clicks **Check Rejoinee**.
3. API checks `EMPMAST` using an exact, case-insensitive Employee Code match.
4. If no employee exists, normal new onboarding continues.
5. If the employee is Active, the UI warns **Employee already active** and does not load details.
6. If status is Inactive / Left / Suspended / Terminated, prior reusable details are loaded automatically.
7. Current Company/Client/Department/Designation/DOJ/work status and salary fields are not copied from the previous employment period.
8. Bank verification state/token is not copied; bank details can be re-verified.
9. Previous Employee ID is shown only as the matched historical record. The new form's Employee Code remains a fresh field.

## Pending client decision
Whether a rejoinee retains the old Employee ID or receives a new Employee ID is intentionally NOT implemented yet.

## API
`GET /api/workers/rejoin-check?empCode=<previous employee id>`

Requires `workers:write` permission and applies the existing worker scope check.
