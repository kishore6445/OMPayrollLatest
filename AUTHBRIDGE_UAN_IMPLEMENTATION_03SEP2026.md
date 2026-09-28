# OMpayroll — AuthBridge UAN Integration

Implemented a provider adapter for AuthBridge UAN verification while leaving ESIC in mock mode.

## Current modes
- `UAN_VERIFICATION_MODE=mock` — current safe/default demo mode.
- `UAN_VERIFICATION_MODE=authbridge` — calls AuthBridge after credentials and account IDs are configured.
- ESIC remains on the existing mock provider until an employee-IP-number provider is finalized.

## AuthBridge public v1.7 contract used
- Test endpoint: `https://authbridge.info/client_api_demo/AuthApi/post_data`
- Check type: `261` (Employment Verification via UAN)
- UAN field: `5748`
- Candidate name field: `5743`
- Auth headers: `username`, `timestamp`, `nonsense`, `signature`
- Signature: SHA-512 of `password|timestamp|nonsense`, uppercase.

## Required AuthBridge environment values
```
UAN_VERIFICATION_MODE=authbridge
AUTHBRIDGE_UAN_API_URL=https://authbridge.info/client_api_demo/AuthApi/post_data
AUTHBRIDGE_USERNAME=...
AUTHBRIDGE_PASSWORD=...
AUTHBRIDGE_LOCATION_ID=...
AUTHBRIDGE_PROCESS_ID=...
AUTHBRIDGE_UAN_SOURCE_VERIFICATION=Employment Verification via UAN
```

Do not put these credentials in frontend code or commit a populated `.env`.

## Employee data sent for UAN verification
The public AuthBridge v1.7 case API also requires candidate name, father/spouse name, contact number, DOB, location ID and process ID. OMpayroll now forwards name, FHName, local/permanent contact and DOB from the New Employee form.

## Important
AuthBridge may issue a newer/customer-specific Basic UAN endpoint or different location/process IDs. If they do, update only `authbridge-uan-service.ts`; the OMpayroll New Employee UI and signed verification-token workflow can remain unchanged.
