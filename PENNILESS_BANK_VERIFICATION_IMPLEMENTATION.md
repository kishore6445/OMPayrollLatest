# Penny-Less Bank Verification Implementation

Provider integrated: Sandbox.co.in Bank Account Verification [Penny-Less].

## What changed
- Added backend Sandbox authentication with 23-hour in-process JWT cache.
- Added server-side penny-less bank verification API call.
- Added protected endpoints:
  - `POST /api/workers/:EmpCode/bank/verify-penniless`
  - `POST /api/employees/:EmpCode/bank/verify-penniless`
- Bank account number and IFSC are loaded from the database on the server before verification.
- `isAcctVarify` and `VerifiedBeneficiaryName` are no longer client-writable.
- Changing account number or IFSC automatically invalidates a previous verification.
- Worker and Employee Bank tabs now show a `Verify Bank Account` button and system-controlled verification status.
- Beneficiary name returned by the provider is stored in `VerifiedBeneficiaryName`.
- Sensitive account details and beneficiary names are not written to the verification audit log.

## Environment variables
Add these to the Replit Secrets / production environment:

```env
SANDBOX_API_BASE_URL=https://test-api.sandbox.co.in
SANDBOX_API_KEY=your_test_api_key
SANDBOX_API_SECRET=your_test_api_secret
SANDBOX_API_VERSION=1.0
```

Use the test URL and test credentials first. For production change the base URL to `https://api.sandbox.co.in` and use live credentials.

## User flow
1. Create/save the employee or worker.
2. Enter account number + IFSC and save them.
3. Open edit screen → Bank tab.
4. Click `Verify Bank Account`.
5. Backend authenticates with Sandbox and calls the penny-less endpoint.
6. If `account_exists=true`, the application marks the account verified and stores `name_at_bank`.

## Important
Sandbox Penny-Less supports selected banks only. If the provider reports an unsupported/offline bank, the application leaves the account unverified and shows the provider error.

The uploaded source did not contain `node_modules`, so a full dependency-aware TypeScript build could not be run in this environment. All modified TS/TSX files were syntax-transpiled with TypeScript successfully.
