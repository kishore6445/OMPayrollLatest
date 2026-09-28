# OMpayroll — Aadhaar Face Authentication implementation

## Implemented flow
1. HR enters the employee Aadhaar number manually in Workers > Add/Edit Employee.
2. Employee consent is recorded before authentication starts.
3. OMpayroll creates a 10-minute Face Authentication session.
4. The web UI renders an Android handoff QR/deep link.
5. The OMpayroll Android companion/AUA provider launches UIDAI Aadhaar Face RD.
6. Provider posts the terminal result to `/api/aadhaar/face/provider-callback`.
7. The web form polls the session and changes to `Face verified` on success.
8. Employee save is blocked if an Aadhaar number is present but the verification session is missing, failed, expired, belongs to another user, or was created for a different Aadhaar number.

## Security design
- Raw face images / biometric PID are never accepted or stored by OMpayroll.
- Raw Aadhaar is not written to the Face Authentication session table; only SHA-256 hash + last 4 digits are stored there.
- Provider callbacks require `X-Aadhaar-Face-Secret` matching `AADHAAR_FACE_CALLBACK_SECRET`.
- Sessions expire after 10 minutes.
- Mock completion is disabled in production.

## Required migration
Run `migrations/004_aadhaar_face_auth.sql` against the client database.

## Environment
- `AADHAAR_FACE_MODE=mock` for staging.
- Set `AADHAAR_FACE_MODE=provider` only after an authorized AUA/Sub-AUA partner is selected.
- Configure provider base URL/API key and callback secret.

## Provider contract expected by the adapter
`POST {AADHAAR_FACE_PROVIDER_BASE_URL}/face-auth/sessions`
Request contains Aadhaar number, merchant session ID, callback URL, purpose, and `captureMode=AADHAAR_FACE_RD`.
Expected response contains `providerSessionId` and `handoffUrl` (or equivalent aliases handled by the adapter).

The exact provider payload can be adapted in `artifacts/api-server/src/lib/aadhaar-face-service.ts` once the authorized provider supplies its API specification.

## Android companion added — 02 Sep 2026

Android source is under `android/ompayroll-face-verify/`.

Additional migration: `migrations/005_aadhaar_face_android_handoff.sql` adds only one-time mobile handoff metadata to the already-new `aadhaar_face_sessions` table. It does not alter payroll/worker master tables.

The companion receives the QR deep link, validates a short-lived token, asks the backend for the authorized provider's Face RD request, invokes UIDAI Face RD using the Android capture intent, forwards the opaque Face RD response to the backend, and never stores or logs the biometric/PID response.

Important: `AADHAAR_FACE_MODE=mock` can test the web/session flow but cannot produce a valid UIDAI Face RD capture request. Live camera capture through Face RD requires `AADHAAR_FACE_MODE=provider` and the authorized AUA/Sub-AUA provider contract/credentials.
