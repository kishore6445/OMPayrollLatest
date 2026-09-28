# Client enhancements — local pass — 18 Sep 2026

Implemented safely on the 15 Sep local baseline:

1. Aadhaar DigiLocker popup auto-close
   - OMpayroll retains the popup window handle and attempts to close it after Aadhaar data is successfully fetched.
   - Browser/provider restrictions are tolerated; failure to close never blocks Aadhaar fetch.
   - Existing auto-fetch and manual Fetch fallback remain.

2. Client dropdown scrolling
   - Shared select menu now has a bounded height and vertical scrolling, so long client lists can be reached.

Already present in this local baseline:
- Previous Employee / Rejoin check (`/api/workers/rejoin-check` + Add Employee UI).
- Local/current address PIN (`localpin`).
- Manual Aadhaar input is a normal visible text field while being entered.
- IFSC partial-update validation fix.
- Obsolete Aadhaar Face save blocker removal.

Not silently implemented because the current EMPMAST contract has no confirmed writable permanent-address PIN column:
- Permanent-address PIN persistence. A real persisted field needs the authoritative EMPMAST column/schema decision before code or migration is added. We did not invent/reuse another legacy field.

Note on manually entered Aadhaar:
- The Add/Edit form already displays the number typed manually in the Aadhaar field during the session.
- Read/detail APIs intentionally mask Aadhaar for users without export/all permission. This pass does not weaken that existing security rule.
