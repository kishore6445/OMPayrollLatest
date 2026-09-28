# Meon UAN DigiLocker Fix — 14 Sep 2026

Updated the UAN Card DigiLocker provider calls to match the Meon documentation supplied during testing.

## Changes

- UAN DigiLocker link creation now uses `POST /digi_url` instead of `/generate_link`.
- Request keeps `doctype: UNCRD`, `orgid: 002292`, `consent: Y`, and the 12-digit UAN inside `other_documents`.
- UAN result retrieval now uses `POST /v2/send_entire_data` instead of `/fetch_data`.
- Retrieval body uses the encrypted-session `client_token` and `state`, plus `status: true`.
- No provider response-field mapping was invented. The returned provider `data` is still passed through for the first successful live validation.

No database schema or production data changes are included in this patch.
