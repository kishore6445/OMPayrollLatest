# User Organization → Client dropdown mapping fix — 24 Sep 2026

## Issue
After selecting an Organization in Add/Edit User, the Client dropdown could be empty because its options were sourced only from active `BRANCHCLIENT` rows.

## Fix
- Organization dropdown continues to load all Organizations from `COMPANYMAST` via `/api/masters/companies`.
- After Organization selection, Client dropdown now loads that Organization's actual Clients directly from `CLIENTMASTER` via `/api/masters/clients?compid=<id>`.
- Existing `BRANCHCLIENT` rows are still used only to derive the branch rows required by existing `USERCLIENT` persistence.
- Client(s) with no active Branch mapping are shown but disabled, with `No active Branch mapping`, so the UI no longer falsely reports that the Organization has no Clients.
- No database schema change is required.

## Persistence
No changes to `app_users`, `USERCOMPANY`, `USERBRANCH`, or `USERCLIENT` schema. Existing scope save APIs remain unchanged.
