# Local PIN DigiLocker Fix — 22 Sep 2026

- Employee onboarding uses the canonical `pages/workers/form.tsx` form.
- DigiLocker Aadhaar data now fills both `EMPMAST.localpin` and `EMPMAST.permanentpin` from the returned PIN code.
- Local PIN remains editable so HR can change it when current/local address differs from permanent/Aadhaar address.
- Local PIN input is restricted to numeric 6 digits, matching the Permanent PIN field.
- Existing backend save/read mapping already includes both `localpin` and `permanentpin`; no database migration is required.
