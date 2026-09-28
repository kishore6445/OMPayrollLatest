# Aadhaar DigiLocker Fetch Patch — 09 Sep 2026

Implemented a complete fetch mechanism after Meon DigiLocker Aadhaar verification.

## Frontend changes
- The Aadhaar DigiLocker session token is persisted in `sessionStorage`, so the fetch step survives component remounts/navigation during the same browser session.
- `Fetch Aadhaar Details` is now always visible; it is enabled after a DigiLocker session starts.
- When the user returns to the OMpayroll tab after completing DigiLocker consent, OMpayroll makes one automatic fetch attempt.
- If automatic fetch is not ready yet, the session remains available and the user can click `Fetch Aadhaar Details` manually.
- Successful fetch clears the temporary session token and shows `Aadhaar Fetched`.

## Employee form mapping
On successful fetch, available DigiLocker data is mapped into the worker form:
- Aadhaar number only when Meon returns a full 12-digit value (masked references are not written into the 12-digit field)
- Employee Name
- Name on Aadhaar
- Father / Spouse Name
- DOB
- Gender
- Nationality
- Permanent Address Line 1 / 2
- State
- District
- PIN Code

## Backend
No new Meon provider contract was invented. The existing verified backend flow is reused:
- `POST /api/aadhaar/digilocker/start`
- `POST /api/aadhaar/digilocker/complete`
- Meon `/v2/send_entire_data`

## Validation note
Static code inspection completed. Runtime typecheck/build could not be executed in this sandbox because `pnpm` is not installed here. Run the repository's normal `pnpm` typecheck/build in Replit before deployment.
