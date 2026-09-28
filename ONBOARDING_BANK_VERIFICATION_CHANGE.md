# Onboarding Bank Verification Update — 24 Aug 2026

This build enables Sandbox Penny-Less bank verification during `/workers` Add Employee, before EMPMAST is created.

## Flow

1. Select Company (and Branch/Client as applicable).
2. Set Mode of Payment = Bank.
3. Enter Name in Bank, Account Number and IFSC.
4. Click **Verify Bank Account**.
5. Backend calls Sandbox Penny-Less immediately.
6. On success, the frontend stores a short-lived signed verification proof in form state.
7. On **Create Employee**, the backend validates that proof against the same Account Number + IFSC and writes `isAcctVarify=1` and `VerifiedBeneficiaryName` server-side.
8. Changing Name in Bank, Account Number or IFSC clears the verification and requires re-verification.

## Security

`isAcctVarify` and `VerifiedBeneficiaryName` remain server-controlled; the client cannot directly mark an account verified. The pre-create proof expires after 15 minutes and is signed using `BANK_VERIFICATION_TOKEN_SECRET`, falling back to `SESSION_SECRET` if the dedicated secret is not set.

## Existing employee flow

Edit Worker continues using the existing saved-worker endpoint and verifies stored EMPMAST bank details.

## Database

No database migration is required.
