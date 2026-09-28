# User Organization selector source fix — 24 Sep 2026

## Requirement
In Admin > Add/Edit User, the Organization selector must show every Organization from COMPANYMAST. Previously it was derived from active BRANCHCLIENT rows, so Organizations without an active Branch–Client mapping were hidden.

## Change
- Organization selector now loads from `GET /api/masters/companies` (COMPANYMAST).
- Existing Client assignment options continue to come from active Branch–Client mappings, because USERCLIENT scope persists company + branch + client.
- Selecting an Organization that currently has no active Client mapping is allowed; the Client section simply shows no matching Clients for that Organization.
- Organization labels use the existing human-readable `displayLabel` (`Company — City — ID`).

## Database impact
No schema or migration changes required.
