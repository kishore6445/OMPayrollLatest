# Organization / Entity Code display fix — 26 Sep 2026

- Visible organization labels now use `COMPANYMAST.corpID` as the actual Organization / Entity Code.
- `compid` is no longer shown as a substitute/fake Organization Code.
- If `corpID` is blank, the UI shows only the Company Name until the real code is entered.
- Company Master already exposes `Organization Code / Location Code` for maintaining `corpID`.
- Migration 011 backfills only verified legacy mappings found in OM reconciliation data: 1=OMUS, 4=SY, 6=OMUP, 7=OMH, 8=OS. It does not overwrite an existing code.
- Add/Edit User and Add Employee dropdowns consume the corrected `displayLabel`.
