# Edit User – Change Client (26 Sep 2026)

Implemented in User Management Edit dialog.

## Behaviour
- Existing Organization and Client assignment is loaded when Edit User opens.
- Admin can change the selected Client(s) and save the new assignment.
- Explicit USERCOMPANY / USERUNIT mappings are updated through the existing transactional scope API.
- Migrated users with no explicit scope continue to load their existing Organization / Client from EMPMAST fallback; once changed and saved, the explicit mapping becomes authoritative.
- Role-only or name/email-only edits do not rewrite scope.
- Scope changes are validated before the user PATCH to avoid partial saves.
- Existing Employee Master data is not modified.

## Database
No migration required. Uses existing USERCOMPANY and USERUNIT tables.
