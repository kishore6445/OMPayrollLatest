# Employee Temporary Password Reset — 19 Sep 2026

## Purpose
Reset the temporary password for the migrated employee login accounts without changing any non-Employee account.

## Exact database scope
The script selects only:

```sql
role = 'Employee' AND employee_code IS NOT NULL
```

The current migration expectation is **171 records**. The script checks that number before writing and aborts if the live count differs.

## Password for this rollout
Set the secret/environment variable `EMPLOYEE_TEMP_PASSWORD` to:

`Demo@123`

The plain password is **not stored in source code or in the database**. Each user receives an independently salted PBKDF2-SHA512 hash using the same hashing format as the current application login.

## First run: preview only

```bash
EMPLOYEE_TEMP_PASSWORD='Demo@123' pnpm reset:employee-passwords
```

This prints the live Employee-account count and makes **no changes**.

## Apply
Only after the preview confirms the expected 171 mapped Employee accounts:

```bash
EMPLOYEE_TEMP_PASSWORD='Demo@123' pnpm reset:employee-passwords -- --apply
```

The script:
- updates only mapped `Employee` accounts;
- replaces `password_hash` with a fresh PBKDF2-SHA512 hash;
- sets `must_change_password = TRUE`;
- does **not** change `is_active`;
- does not alter Admin, HR, Finance, Payroll Manager, or other roles;
- runs inside a transaction and rolls back if the updated row count does not match the selected row count.

## User login after reset
- **Username:** employee's existing `app_users.username` (for migrated employees this is the employee code)
- **Temporary password:** `Demo@123`
- On successful login, the existing application flow sees `must_change_password = TRUE` and sends the employee to Change Password.

## Important
Do not put `Demo@123` directly into `password_hash`. `password_hash` must contain the PBKDF2 hash created by the script.
