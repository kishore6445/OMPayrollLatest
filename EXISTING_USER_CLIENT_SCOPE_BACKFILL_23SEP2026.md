# Existing User Client Scope Backfill — 23 Sep 2026

## Requirement

Existing Users in `app_users` already carry their Organization in `app_users.compid`.
For rollout, Users who do not already have a Client restriction should initially receive access to **all active Clients under that Organization**.
If OM later provides a narrower User-to-Client list, Admin can edit the User and restrict the assignments.

## Database impact

No schema change is required.

Existing tables are reused:

- `app_users.compid` — existing Organization reference
- `USERCOMPANY` — Organization access
- `USERBRANCH` — Branch access
- `USERCLIENT` — Client access
- `BRANCHCLIENT` — source of active Organization/Branch/Client relationships

## UI

The Add/Edit User scope section now explicitly follows:

1. Select Organization(s)
2. View Clients only from the selected Organization(s)
3. Select one or more Clients
4. Save to the existing scope tables

Removing an Organization in the form removes its Client/Branch selections before save.

## Existing User backfill

A safe one-time script was added:

```bash
pnpm backfill:user-client-scope
```

This is DRY RUN by default.

To apply after reviewing the preview:

```bash
pnpm backfill:user-client-scope -- --apply
```

### Safety rules

- Does not alter `app_users` or any schema.
- Skips `Admin` and `Payroll Manager` because those roles are unrestricted.
- Only targets active restricted Users with `app_users.compid` and **no active `USERCLIENT` mapping**.
- Users already having a Client mapping are left untouched so existing restrictions are never broadened accidentally.
- Uses active `BRANCHCLIENT` rows to create/re-activate `USERBRANCH` and `USERCLIENT` access.
- Users whose Organization has no active `BRANCHCLIENT` mappings are reported and skipped.
