# Meon Aadhaar + UAN DigiLocker — Local Integration (05 Sep 2026)

## Implemented

### Aadhaar DigiLocker
Backend endpoints:
- `POST /api/aadhaar/digilocker/start`
- `POST /api/aadhaar/digilocker/complete`

Provider flow implemented from supplied Meon documentation:
1. `POST /get_access_token`
2. `POST /digi_url`
3. Open returned DigiLocker URL
4. User completes consent
5. `POST /v2/send_entire_data`

The Meon `client_token` and `state` are never exposed directly to the browser. They are held inside a short-lived AES-GCM encrypted opaque session token bound to the authenticated OMpayroll user.

The employee form now includes **Meon DigiLocker Aadhaar**. Returned name, DOB, gender, father name and permanent-address fields are mapped into onboarding. Existing UIDAI Face test code is preserved under a collapsed legacy section.

### UAN Card Fetch
Backend endpoints:
- `POST /api/workers/uan/digilocker/start`
- `POST /api/workers/uan/digilocker/complete`

Known Meon flow implemented:
1. `POST /get_access_token`
2. `POST /generate_link`
3. DigiLocker consent
4. `POST /fetch_data`

`/generate_link` sends `other_documents` with `doctype=UNCRD`, `orgid=002292`, `consent=Y`, and the employee UAN as shown in the supplied Meon portal screenshots.

## Important UAN sandbox rule
The exact `/fetch_data` response schema was not visible in the supplied material. Therefore the code intentionally **does not mark UAN as VERIFIED yet** after fetch. The first real sandbox response should be inspected, then mapped to employee/UAN ownership fields before issuing OMpayroll's existing signed verification proof.

This avoids falsely claiming verification from an undocumented response shape.

## Required local environment variables
- `MEON_COMPANY_NAME`
- `MEON_SECRET_TOKEN`
- `SESSION_SECRET`

Optional/defaulted:
- `MEON_DIGILOCKER_BASE_URL=https://digilocker.meon.co.in`
- `MEON_DIGILOCKER_REDIRECT_URL=https://digilocker.meon.co.in/digilocker/thank-you-page`
- `MEON_AADHAAR_DOCUMENTS=aadhaar,pan`
- `MEON_UAN_BASE_DOCUMENTS=aadhaar,pan`

## Security
- Meon secret stays backend-only.
- Provider client token/state remain encrypted in an opaque browser session token.
- 30 minute DigiLocker session expiry.
- Provider secrets and identity payloads are not written to audit logs.
- Rotate/regenerate the Meon secret before production because it has previously been displayed on-screen during setup.

## Next test
1. Put Meon credentials in local `.env` only.
2. Start OMpayroll locally.
3. Test Aadhaar first.
4. Then test UAN with one genuine consenting employee/test user.
5. Capture the exact UAN `/fetch_data` response shape (redact sensitive values) and finalize UAN VERIFIED/name-match mapping.
6. Only after local success prepare the Replit production patch/prompt.

ESIC is intentionally untouched/parked.
