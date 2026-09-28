# OMpayroll — UIDAI Test/UAT Mode

## Purpose
This build separates Aadhaar Face Authentication into three modes:

- `mock` — OMpayroll-only workflow testing; no UIDAI call.
- `uidai_test` — UIDAI developer/UAT workflow using UIDAI-published dummy Aadhaar values.
- `provider` — production AUA/Sub-AUA integration.

## UIDAI public test values currently configured

- AUA code: `public`
- Sub-AUA code: `public`
- Auth 2.5 URL: `https://developer.uidai.gov.in/authserver/2.5`
- Test Aadhaar: `999941057058`
- Test Aadhaar: `999971658847`

These are development/UAT values only.

## Enable UIDAI test mode

Set in `.env`:

```env
AADHAAR_FACE_MODE=uidai_test
UIDAI_TEST_AUA_CODE=public
UIDAI_TEST_SUB_AUA_CODE=public
UIDAI_TEST_AUTH_URL=https://developer.uidai.gov.in/authserver/2.5
UIDAI_TEST_ALLOW_REAL_AADHAAR=false
UIDAI_TEST_FACE_RD_REQUEST=
UIDAI_TEST_AUTH_PROXY_URL=
UIDAI_TEST_SIMULATE_RESULT=false
```

Restart with `pnpm dev`.

## What works immediately

1. Manual Aadhaar entry.
2. Only UIDAI-published dummy Aadhaar numbers are accepted by default.
3. Consent/session creation.
4. Android deep-link and QR handoff.
5. DB polling/status handling.
6. A clearly-labelled non-production button **Simulate UIDAI UAT response** for testing the OMpayroll workflow.

The simulation does not contact CIDR and is never labelled as production verification.

## What is still required for a real Face RD UAT transaction

UIDAI's public authentication environment still requires valid request/signing material. UIDAI states that the public-AUA p12 signing keystore can be requested from its authentication support channel. Alternatively, an AUA can supply a sandbox/pre-production integration.

When official Face RD request material is available, place only the generated test request in `UIDAI_TEST_FACE_RD_REQUEST`, or connect an adapter through `UIDAI_TEST_AUTH_PROXY_URL` which builds/signs/submits the Auth 2.5 request. Do not manufacture or hard-code fake transaction/signature data.

## No DB migration required

This update does not change the schema. Migrations `004` and `005` from the Android build remain sufficient.
