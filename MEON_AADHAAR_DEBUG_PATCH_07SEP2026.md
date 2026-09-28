# Meon Aadhaar DigiLocker Debug Patch — 07 Sep 2026

This patch keeps the existing Aadhaar/UAN DigiLocker implementation unchanged and only improves Meon API error visibility.

## Change
- `artifacts/api-server/src/lib/meon-digilocker-service.ts`
- Meon non-2xx responses now include the provider's returned error message/body in the OMpayroll error.
- Sensitive response fields whose names contain secret/token/password/authorization/Aadhaar/PAN/UAN are redacted.
- Plain-text provider errors are also captured.

## Test
1. Keep the same `.env` configuration.
2. Restart the backend after replacing the project/build.
3. Open New Employee → Aadhaar → Verify via DigiLocker.
4. If it fails, inspect Network → `/api/aadhaar/digilocker/start` → Response.
5. The response should now contain the actual Meon error detail rather than only `Meon DigiLocker request failed (400)`.

Do not share API secrets or full identity values when sending the error back for diagnosis.
