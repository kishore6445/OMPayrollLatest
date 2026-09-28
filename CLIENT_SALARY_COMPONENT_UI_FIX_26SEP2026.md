# Client Salary Component UI Fix — 26 Sep 2026

- Salary component names are no longer editable in Client Master.
- Existing Client edit uses that Client's own UNITMASTER.SalHead1..17 values.
- Brand-new Client creation loads salary-head labels from existing Client Master (UNITMASTER) data after Organization selection.
- For each slot, Organization-specific Client Master usage is preferred; global Client Master usage is fallback.
- Admin enters only SalHeadDefault1..17 values.
- Blank salary-head slots are hidden.
- Employee onboarding continues to inherit these default values into EMPMAST.SalHead1..17.
- No additional DB migration is required beyond migration 009 for SalHeadDefault1..17.
