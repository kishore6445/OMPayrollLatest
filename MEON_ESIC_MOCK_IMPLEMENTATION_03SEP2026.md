# OMpayroll — Meon ESIC Mock Integration

Implemented a Meon-labelled ESIC mock provider for the New Employee statutory-verification flow.

## Current mode
```env
ESIC_VERIFICATION_MODE=meon-mock
```

## What it does
- Accepts the employee ESIC/IP number from the existing New Employee form.
- Requires the existing 10-digit OMpayroll ESIC/IP format check.
- Returns the normal OMpayroll statutory verification result with provider `meon-mock-sandbox`.
- Generates the existing signed 15-minute verification proof before employee save.
- Leaves UAN/AuthBridge logic untouched.
- Leaves Aadhaar/UIDAI work untouched.

## Important
This is a DEMO/DEVELOPMENT MOCK ONLY. It makes no network request to Meon or ESIC and must not be described as a live statutory verification.

Meon's public ESIC page states that its ESIC workflow can accept an ESIC number or employee identifier and verify registration/eligibility. We still need Meon's actual sandbox credentials and issued API contract before implementing the real provider adapter.

When Meon credentials/docs arrive, replace only the mock provider implementation/selection. The OMpayroll UI, route, signed verification token, audit logging and save-blocking workflow can remain.
