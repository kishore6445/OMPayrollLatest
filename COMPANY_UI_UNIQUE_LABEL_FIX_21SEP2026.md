# Company / Organization UI Unique Label Fix — 21 Sep 2026

## Requirement
Multiple COMPANYMAST records may have the same `comname`. Users must be able to distinguish them in the UI without changing the existing database key model.

## Implementation
- `compid` remains the actual selected/stored value.
- `/api/masters/companies` now also returns `city`, `state`, and `displayLabel`.
- Visible label format:
  - `Company Name — City — ID <compid>` when City exists.
  - `Company Name — ID <compid>` when City is blank.
- No database migration is required.

## UI areas updated
- Actual Client / Unit Master create/edit and filters
- Employee onboarding and employee filters
- Worker onboarding
- Category Master create/filter
- Branch create/filter flows
- Branch Office form
- Legacy Client create/filter screens

## Example
If COMPANYMAST contains three rows named `OM Enterprise`, users may see:
- `OM Enterprise — Hyderabad — ID 7`
- `OM Enterprise — Bengaluru — ID 12`
- `OM Enterprise — ID 19`

The selected value remains 7 / 12 / 19 respectively.

## Validation
Modified TypeScript/TSX files were transpile/syntax checked: 13 files, 0 syntax errors.
