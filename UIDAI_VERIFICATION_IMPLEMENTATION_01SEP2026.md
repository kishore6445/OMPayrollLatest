# UIDAI Aadhaar Verification Enhancement — 01 Sep 2026

Implemented in Employee Onboarding (`/workers`) without database schema changes.

## Implemented
- Distinguishes UIDAI Secure QR authenticity from OCR-only extraction.
- Secure QR API now returns `UIDAI_VERIFIED` only when the UIDAI certificate signature check actually ran and passed.
- Development signature bypass is reported as `AUTHENTICITY_NOT_VERIFIED`, never as UIDAI verified.
- IDfy camera/OCR results are reported as `OCR_ONLY`, never as UIDAI verified.
- Compares Aadhaar vs employee form for Name, DOB, Gender and Address.
- Name normalization + token similarity for partial matches.
- Exact DOB comparison; year-only Aadhaar values require review.
- Normalized gender comparison.
- Address comparison with component-aware score and PIN/state weighting.
- Mobile is deliberately reported `NOT_AVAILABLE` in QR/OCR flow rather than guessed.
- UI shows overall Aadhaar verification status and per-field result.
- Removed IDfy debug logs that could expose response metadata/PII.
- No database migrations and no employee data changes.

## Mobile verification
UIDAI Paperless Offline e-KYC supports registered-mobile verification using the hashed mobile value, share code and Aadhaar-reference last digit. This enhancement does not falsely treat Secure QR/OCR as full mobile verification. A signed Offline e-KYC XML/ZIP verifier should be added before enabling `Mobile VERIFIED`.

## Production requirement
Set a valid `UIDAI_QR_CERT` secret. Never enable `UIDAI_QR_SKIP_VERIFY=true` in production.
