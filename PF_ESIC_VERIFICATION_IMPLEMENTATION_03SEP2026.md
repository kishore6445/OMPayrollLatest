# PF/UAN + ESIC Verification — 03 Sep 2026

## Implemented
- New Employee PF tab: 12-digit UAN + Verify button.
- New Employee ESI tab: ESI Applicable + 10-digit ESIC/IP number + Verify button.
- Backend `POST /api/workers/statutory/verify`.
- Server-signed 15-minute verification proof; browser cannot self-mark a number verified.
- Employee creation blocks PF/ESI applicable records until the corresponding number has a valid verification proof.
- Migration 008 stores verification status/time/provider/reference.
- Audit logs omit UAN/ESIC numbers.

## Sandbox modes
`IDFY_STATUTORY_MODE=mock` is the default and tests the complete UI/backend flow. It is **not** a government verification and must never be represented as one.

Switch to `IDFY_STATUTORY_MODE=idfy` only after IDfy supplies the OMpayroll account's sandbox credentials and exact UAN/ESIC endpoint contracts. Set `IDFY_API_BASE_URL`, `IDFY_API_KEY`, `IDFY_ACCOUNT_ID`, `IDFY_UAN_ENDPOINT`, `IDFY_ESIC_ENDPOINT`. The IDfy adapter is isolated in `idfy-statutory-service.ts` so the final product-specific request/response mapping can be tightened without changing onboarding UI.

## Before running
Run `migrations/008_pf_esic_verification.sql` on `payrollom_client`.
