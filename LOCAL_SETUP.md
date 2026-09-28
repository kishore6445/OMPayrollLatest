# PayrollOM — Local Setup Guide
**Last updated:** 07 August 2026

---

## Prerequisites

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| Node.js | 20.x LTS | 22.x also works; avoid 18.x |
| pnpm | 9.x or 10.x | `npm install -g pnpm@10` |
| PostgreSQL | 15 or 16 | Two databases required (see below) |
| Git | any | To clone / browse history |

> **Windows users:** run all commands in PowerShell or Git Bash. The seed script requires `node` and `psql` on PATH. See the Windows Troubleshooting section at the end of this document.

---

## Repository Structure

```
workspace/
├── artifacts/
│   ├── api-server/            ← Express API (port 8080 by default)
│   └── payroll-nexus/         ← React / Vite frontend
├── lib/
│   ├── pg-client-db/          ← Raw-SQL client-DB access layer
│   ├── db/                    ← Drizzle ORM (SaaS DB — legacy)
│   ├── api-spec/              ← OpenAPI spec fragments
│   ├── api-zod/               ← Generated Zod schemas
│   ├── api-client-react/      ← Generated React Query hooks
│   └── billing/               ← Billing calculation helpers
├── migrations/
│   ├── 003_branch_client_scope.sql   ← Branch–Client mapping tables (this release)
│   └── 003_rollback.sql              ← Rollback for migration 003
├── scripts/
│   └── seed-client-admin.mjs  ← Seeds roles, permissions, admin user
├── DELIVERABLE_1_POSTGRESQL_DDL.sql  ← Full 211-table schema DDL
├── IMPLEMENTATION_STATUS.md          ← Feature completion status
├── LOCAL_SETUP.md                    ← This file
├── .env.example                      ← Environment variable template
├── pnpm-workspace.yaml
└── package.json
```

---

## PostgreSQL Setup

PayrollOM uses **two databases** on the same server:

| Database | Purpose |
|----------|---------|
| `heliumdb` | SaaS / workspace metadata (used by `lib/db` Drizzle schema) |
| `payrollom_client` | Client payroll data — all 211 tables including EMPMAST, COMPANYMAST, etc. |

### Create databases

```sql
-- Run as postgres superuser
CREATE DATABASE heliumdb;
CREATE DATABASE payrollom_client;
```

### Apply the base schema to `payrollom_client`

```bash
psql -U postgres -d payrollom_client -f DELIVERABLE_1_POSTGRESQL_DDL.sql
```

This creates all 211 tables, indexes, and constraints.

> The DDL is idempotent — safe to re-run on an empty database.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

### Required variables

| Variable | Purpose |
|----------|---------|
| `CLIENT_DATABASE_URL` | Full connection string to `payrollom_client` |
| `DATABASE_URL` | Full connection string to `heliumdb` (SaaS DB) |
| `SESSION_SECRET` | HMAC signing key — min 32 random characters |
| `ADMIN_SEED_PASSWORD` | Password for the seeded `systemadmin` account (seed script only) |

---

## Install Dependencies

```bash
# From the workspace root
pnpm install
```

This installs dependencies for all workspace packages:
- `artifacts/api-server`
- `artifacts/payroll-nexus`
- `lib/*`
- `scripts`

---

## Run Migration 003 — Branch–Client Scope Tables

Migration 003 creates three new tables in `payrollom_client`:

| Table | Purpose |
|-------|---------|
| `BRANCHCLIENT` | Maps a Client to one or more Branches (many-to-many) |
| `USERBRANCH` | Maps an HR Manager user to allowed Branches |
| `USERCLIENT` | Maps an HR Manager user to allowed Clients within a Branch |

### Run the migration

```bash
psql -U postgres -d payrollom_client -f migrations/003_branch_client_scope.sql
```

Expected output:
```
CREATE TABLE
CREATE TABLE
CREATE TABLE
```

> The migration uses `CREATE TABLE IF NOT EXISTS` — safe to re-run. It does **not** modify any existing tables.

### Verify the three tables were created

```bash
psql -U postgres -d payrollom_client -c "\dt BRANCHCLIENT USERBRANCH USERCLIENT"
```

Or, to verify column structure:

```bash
psql -U postgres -d payrollom_client -c "\d BRANCHCLIENT"
psql -U postgres -d payrollom_client -c "\d USERBRANCH"
psql -U postgres -d payrollom_client -c "\d USERCLIENT"
```

You should see tables with columns: `id`, `compid`, `branchcode`, `clientcode` / `usercode`, `is_active`, `created_by`, `created_at`, `updated_by`, `updated_at`.

### Verify existing data is unchanged

```bash
psql -U postgres -d payrollom_client \
  -c "SELECT COUNT(*) FROM \"EMPMAST\";" \
  -c "SELECT COUNT(*) FROM \"CLIENTMASTER\";" \
  -c "SELECT COUNT(*) FROM \"BRANCH\";"
```

Row counts must match your pre-migration baseline — the migration is strictly additive.

---

## Run the Rollback (if needed)

> ⚠️ The rollback **drops all data** from BRANCHCLIENT, USERBRANCH, and USERCLIENT. Only run it if you intend to fully remove this feature.

```bash
psql -U postgres -d payrollom_client -f migrations/003_rollback.sql
```

Expected output:
```
DROP TABLE
DROP TABLE
DROP TABLE
```

---

## Seed the Admin User

Run once after creating the `payrollom_client` database and applying the schema:

```bash
ADMIN_SEED_PASSWORD=YourPasswordHere node scripts/seed-client-admin.mjs
```

Or, if your `.env` has `ADMIN_SEED_PASSWORD` set, use:

```bash
node --env-file=.env scripts/seed-client-admin.mjs
```

This creates:
- 7 RBAC roles: Admin, HR Manager, Finance Executive, Finance Manager, Compliance Officer, Payroll Manager, Viewer
- All role permissions
- Admin user `systemadmin` (must change password on first login)

> On Replit the `ADMIN_SEED_PASSWORD` secret is pre-configured. Locally you must pass it explicitly as shown above.

**Demo users** (pre-seeded separately in the full dataset):

| Username | Password | Role |
|----------|----------|------|
| `admin@nexusstaffing.com` | `Admin@123` | Admin |
| `hr@nexusstaffing.com` | `Admin@123` | HR Manager |
| `payroll@nexusstaffing.com` | `Admin@123` | Finance Manager |
| `finance@nexusstaffing.com` | `Admin@123` | Finance Executive |
| `compliance@nexusstaffing.com` | `Admin@123` | Compliance Officer |
| `auditor@nexusstaffing.com` | `Admin@123` | Viewer |

---

## Build Workspace Libraries

```bash
pnpm run build:libs
```

This compiles `lib/pg-client-db`, `lib/db`, `lib/billing`, etc. with TypeScript project references.

---

## Start the API Server

```bash
# Development (builds then starts)
pnpm --filter @workspace/api-server run dev

# Or build + start separately:
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

**Default port:** `8080`  
**Health check:** `GET http://localhost:8080/api/health`

---

## Start the Frontend

```bash
pnpm --filter @workspace/payroll-nexus run dev
```

**Default port:** `5000` (locally) — controlled by `PORT` env var.  
**URL:** `http://localhost:5000`

> On Replit the PORT is injected automatically by the workflow manager and the reverse proxy routes `/payroll-nexus` → the Vite dev server.

---

## Type-Check All Packages

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/payroll-nexus run typecheck
```

Expected output: `0 errors` across both TypeScript projects.

---

## Run Tests

```bash
pnpm --filter @workspace/api-server run test
```

Expected: **81 passed, 72 skipped, 0 failures** (Vitest).

> Tests use a live connection to `payrollom_client`. Ensure the DB is running and seeded before running tests.

---

## Default Ports

| Service | Port | Env var |
|---------|------|---------|
| API Server | 8080 | `PORT` |
| Frontend (Vite) | 5000 (local) | `PORT` |
| PostgreSQL | 5432 | `PGPORT` |

---

## HR Manager Scope — How It Works

After migration 003, HR Manager users can be assigned an organisational scope through the Admin → Users UI:

1. Go to **Admin → Users**.
2. Add or edit a user with role **HR Manager**.
3. The **Access Scope** section appears. Select the Companies, Branches, and Clients that this HR Manager can see.
4. Save — the scope is written to `USERBRANCH` and `USERCLIENT`.

**Scope enforcement:**
- HR Manager sees only employees (`EMPMAST` rows) whose `compid`, `branchcode`, and `clientcode` match their scope.
- Admin and Payroll Manager always see all data.
- Accessing an out-of-scope employee returns **HTTP 403**.

---

## Client Branch Assignment — How It Works

Clients can now be assigned to multiple branches via the **Clients → Edit** form:

1. Go to **Clients**, open a client, click **Edit**.
2. The **Assigned Branches** section lists all branches for the selected company.
3. Check the branches that handle this client; uncheck to remove.
4. Save — the assignments are written to `BRANCHCLIENT`.

This mapping drives the `USERCLIENT` scope tree — clients appear under a branch in the HR Manager scope selector only after they are mapped via `BRANCHCLIENT`.

---

## Branch–Client API Reference

```bash
# List branch-client mappings for a company
GET /api/branch-clients?compid=1

# List mappings filtered by branch
GET /api/branch-clients?compid=1&branchcode=1

# List only active mappings
GET /api/branch-clients?compid=1&active=true

# Create a mapping
POST /api/branch-clients
Body: { "compid": 1, "branchcode": 1, "clientcode": 2 }

# Deactivate a mapping
PATCH /api/branch-clients/:id
Body: { "is_active": false }
```

## HR Manager Scope API Reference

```bash
# Get current scope for a user
GET /api/users/:id/scope
# Response: { companies: [1], branches: [{compid,branchcode}], clients: [{compid,branchcode,clientcode}] }

# Replace scope for a user (full replace — sends complete desired state)
PUT /api/users/:id/scope
Body: {
  "companies": [1],
  "branches": [{"compid": 1, "branchcode": 1}],
  "clients": [{"compid": 1, "branchcode": 1, "clientcode": 2}]
}

# Scoped dropdown lookups (return filtered data for HR Manager, all data for Admin/PM)
GET /api/scoped/companies
GET /api/scoped/branches?compid=1
GET /api/scoped/clients?compid=1&branchcode=1
GET /api/scoped/units?compid=1&branchcode=1&clientcode=2
```

---

## Unit/Site Company & Client Mapping — How It Works

The **Add/Edit Unit/Site** form enforces a three-level dependency for Company → Branch → Client:

### Field layout (Company & Client Mapping tab)

| Row | Left | Right |
|-----|------|-------|
| 1 | **Parent Company** | **Branch** |
| 2 | **Parent Client** | Zone |
| 3 | Zone Group | Billing Zone |
| 4 | Segment Code | _(empty)_ |

### Cascade rules

- **Branch** is disabled until a Company is selected. It loads from `BRANCH` filtered by `compid`.
- **Parent Client** is disabled until both Company and Branch are selected. It loads only clients that are **mapped to that branch via BRANCHCLIENT** (`GET /api/branch-clients?compid=&branchcode=&active=true`).
- Changing **Company** clears both Branch and Parent Client.
- Changing **Branch** clears Parent Client.

### Before adding a Unit/Site you must

1. Ensure the target Client is assigned to the target Branch via **Clients → Edit → Assigned Branches**.
2. That assignment writes a row to `BRANCHCLIENT`. Only then does the client appear in the Parent Client dropdown for that branch.

### Backend validation

`POST /api/units` and `PATCH /api/units/:id` verify:
1. The Company exists (`COMPANYMAST`).
2. The Client belongs to that Company (`CLIENTMASTER`).
3. The Branch belongs to that Company (`BRANCH`).
4. The **BRANCHCLIENT** row linking Company + Branch + Client exists with `is_active = TRUE`.

If validation 4 fails, the API returns HTTP 400 with a message directing you to Clients → Edit → Assigned Branches.

---

## Aadhaar Secure QR Autofill — Setup

> **No new database migration is required for this release.**
> The Aadhaar camera capture feature is entirely frontend + API — no schema changes.

### Canonical location

The Aadhaar scan and upload flow is implemented exclusively in the **Workers** module:

- **`/workers/new`** → Basic Information tab → Aadhaar Card Number field
- **`/workers/:id/edit`** → same field, same buttons

The old `/employees` module does **not** include Aadhaar functionality and must not be modified for this feature.

### How it works

**Workers → Add Employee / Edit Employee** shows two buttons below the **Aadhaar Card Number** field:

| Button | Behaviour |
|--------|-----------|
| **Scan Aadhaar** | Opens high-resolution camera dialog with QR alignment guide |
| **Upload Aadhaar** | Accepts JPEG, PNG, or PDF (max 5 MB) — server extracts + decodes the embedded QR |

**Camera scan flow (high-resolution capture):**

1. Opens camera with `facingMode: environment`, ideal resolution 1920×1080
2. Shows QR alignment guide (centered square with corner markers)
3. Background ZXing live scan runs every 700 ms (optional first attempt)
4. User clicks **Capture QR** — captures a still frame at full camera resolution
5. Crops the guide region (75% centered square)
6. Tries 6 preprocessed versions: original → grayscale → high-contrast → sharpened → 2× upscale → inverted
7. Each version tried with ZXing (TRY_HARDER + QR_CODE) then jsQR
8. If all 12 attempts fail → backend `decode-captured-qr` endpoint (sharp + jsQR)
9. On failure: shows amber retry message — camera stays open for **Retry Capture**
10. On success: stops camera, verifies UIDAI signature, shows field preview

Both camera and upload paths:
1. Show a **Consent dialog** first (required by Aadhaar Act 2016)
2. Verify the UIDAI digital signature (RSA-SHA256) before returning any data
3. Show a **Preview** of verified name / DOB / gender / address
4. Handle **conflicts** — side-by-side comparison if form already has values
5. Populate **only**: Aadhaar Card Number, Employee Name, DOB, Gender, Nationality, Address fields (Lines 1–2, District, State, PIN)

Fields **never** touched by autofill: Employee Code, Mobile, Email, PF, UAN, Bank, ESI, and all Employment fields.
No photograph is extracted or stored at any point.
No QR crop or image is written to disk — all processing is in-memory.

### Testing the Aadhaar flow at /workers/new

```bash
# 1. Start both services
pnpm --filter @workspace/api-server run dev      # port 8080
pnpm --filter @workspace/payroll-nexus run dev   # port 5000

# 2. Open the browser
open http://localhost:5000

# 3. Log in as Admin
#    Username: admin@nexusstaffing.com
#    Password: Admin@123

# 4. Navigate to Workers → Add Employee
#    URL: http://localhost:5000/workers/new

# 5. The Basic Information tab shows:
#    - Aadhaar Card Number field
#    - [Scan Aadhaar] button  → camera flow
#    - [Upload Aadhaar] button → file upload flow

# 6. Test camera scan
#    a. Click [Scan Aadhaar]
#    b. Click "Confirm Consent & Continue"
#    c. Allow camera access when prompted
#    d. Guide box appears — align Aadhaar QR inside it
#    e. Click [Capture QR]
#    f. If detected: preview shows; click "Use These Details"
#    g. If not detected: amber message appears; click [Retry Capture]
#    h. Click Cancel — camera stops, webcam light turns off

# 7. Test upload
#    a. Click [Upload Aadhaar]
#    b. Click "Confirm Consent & Continue"
#    c. Select a JPEG, PNG, or PDF containing an Aadhaar QR
#    d. Preview shows verified fields; confirm to autofill

# 8. Verify no Aadhaar scanner exists in /employees/new
#    URL: http://localhost:5000/employees/new
#    The Aadhaar Card Number field and Scan/Upload buttons must NOT appear there.
```

### API Endpoints

```bash
POST /api/aadhaar/verify-qr
  Body:    { "qrData": "<camera-decoded QR string>",
             "qrText": "<same>",
             "qrPayloadBase64": "<base64 of raw decoder bytes>" }
  Returns: { verified: true, source: "AADHAAR_SECURE_QR", data: { ... } }
  Auth:    workers:write (Admin or HR Manager only)
  Header:  X-Aadhaar-Consent: <base64-encoded consent JSON>
  Note:    qrPayloadBase64 is preferred; qrData accepted for backward compat

POST /api/aadhaar/extract-upload
  Body:    multipart/form-data, field "file" (JPEG / PNG / PDF, ≤ 5 MB)
  Returns: { verified: true, source: "AADHAAR_SECURE_QR", data: { ... } }
  Auth:    workers:write (Admin or HR Manager only)
  Header:  X-Aadhaar-Consent: <base64-encoded consent JSON>

POST /api/aadhaar/decode-captured-qr
  Body:    multipart/form-data, field "file" (JPEG or PNG crop only, ≤ 5 MB)
  Returns: { qrText: "<raw QR payload>" }   (or { qrText: null, error: "..." })
  Auth:    workers:write (Admin or HR Manager only)
  Note:    Backend fallback decoder — receives only the QR guide crop, never
           the full Aadhaar card image. No data is stored; buffer is in-memory only.
```

### Environment Variables

Add these to your `.env` for Aadhaar QR verification:

```bash
# UIDAI Production Certificate (PEM) — REQUIRED in production
# Obtain from: https://uidai.gov.in/ecosystem/authentication-devices-documents/about-aadhaar-qr-code-reader.html
# Leave unset in development — signature verification is auto-skipped with a warning.
UIDAI_QR_CERT=-----BEGIN CERTIFICATE-----
...your UIDAI certificate PEM here...
-----END CERTIFICATE-----

# Development only — explicitly bypass signature verification
# NEVER set this to "true" in production
# UIDAI_QR_SKIP_VERIFY=true
```

See `docs/uidai-cert-setup.md` for full certificate configuration instructions.

### Development behaviour (no cert needed)

When `UIDAI_QR_CERT` is not set and `NODE_ENV` ≠ `production`, the server auto-skips UIDAI signature verification with a startup warning. The QR format parsing and field extraction still work. This lets you test the full autofill flow locally using any valid Aadhaar QR code without setting up the production cert.

### Production requirement

In `NODE_ENV=production`, the server **throws at startup** if `UIDAI_QR_CERT` is not set (and `UIDAI_QR_SKIP_VERIFY` is not explicitly `true`). This prevents unverified QR data from being stored in production.

### Supported QR formats

| Format | Description |
|--------|-------------|
| V2 (current) | Large decimal number → big-integer → zlib-decompress → XML |
| V1 (legacy)  | Pipe-delimited text with hex RSA signature |

### PDF QR extraction

PDF uploads are processed by scanning the raw PDF bytes for embedded JPEG streams (SOI/EOI markers). This covers the vast majority of official e-Aadhaar PDFs where the QR is stored as a JPEG XObject. Vector-rendered QR codes in PDFs are not supported — use JPEG/PNG instead.

---

## Employee Master UI Walkthrough

1. Log in at `http://localhost:5000` with `admin@nexusstaffing.com` / `Admin@123`.
2. Navigate to **Workers** in the sidebar.
3. Click **Add Employee**.
4. On the **Employment** tab:
   - **Company** loads from `/api/scoped/companies` (filtered for HR Manager, full list for Admin).
   - **Branch** becomes enabled after selecting a company; loads from `/api/scoped/branches?compid=<id>`.
   - **Client** becomes enabled after selecting a branch; loads from `/api/scoped/clients?compid=<id>&branchcode=<code>`.
   - **Unit** becomes enabled after selecting a client; loads from `/api/scoped/units?compid=<id>&branchcode=<code>&clientcode=<code>`.
   - For HR Manager with a single assigned company/branch/client, these dropdowns **auto-select** the only available option.
5. Fill in at minimum: Employee Code, Employee Name, Date of Joining, Work Status.
6. Click **Create Employee**.

---

## Complete API Reference — Lookup Endpoints

These require only authentication (no module RBAC) and are used to populate dropdowns:

```bash
GET /api/masters/companies                               # [{compid, comname}]
GET /api/masters/clients?compid=1                        # [{clientcode, Clientname, compid}]
GET /api/masters/units?compcode=1&clientcode=2           # [{unitcode, Unitname, compcode, clientcode}]
GET /api/masters/branches?compid=1                       # [{BranchCode, BranchName, compid}]
GET /api/masters/designations                            # [{DESICODE, DESINAME, ...}]
GET /api/masters/departments                             # [{deptcode, Deptname, ...}]
GET /api/masters/grades                                  # [{GradeCode, GradeName, ...}]
GET /api/masters/categories?compid=1                     # [{catcode, catname, ...}]

# Scoped variants (respects HR Manager organisational scope):
GET /api/scoped/companies
GET /api/scoped/branches?compid=1
GET /api/scoped/clients?compid=1&branchcode=1
GET /api/scoped/units?compid=1&branchcode=1&clientcode=2
```

---

## Windows Troubleshooting

| Problem | Fix |
|---------|-----|
| `pnpm: command not found` | `npm install -g pnpm@10` then restart terminal |
| `node: command not found` | Install Node.js 20 LTS from nodejs.org |
| `psql: command not found` | Add PostgreSQL `bin` directory to PATH (e.g. `C:\Program Files\PostgreSQL\16\bin`) |
| `EADDRINUSE port 8080` | Change `PORT=8081` in `.env` |
| `EADDRINUSE port 5000` | Change `PORT=5001` in frontend `.env` |
| `FATAL: password authentication failed` | Check `PGPASSWORD` / `CLIENT_DATABASE_URL` — must match `pg_hba.conf` auth method |
| `relation "EMPMAST" does not exist` | Schema not applied — run `psql ... -f DELIVERABLE_1_POSTGRESQL_DDL.sql` |
| `relation "BRANCHCLIENT" does not exist` | Migration 003 not applied — run `psql ... -f migrations/003_branch_client_scope.sql` |
| `pnpm install` fails with native module errors | Run `pnpm install --ignore-scripts` then `pnpm run build:libs` |
| Rollup / LightningCSS binary missing | Delete `node_modules` and `pnpm-lock.yaml`, then `pnpm install` |
| Tailwind v4 peer warning | Safe to ignore — `@tailwindcss/vite` bundles its own Lightning engine |
| TypeScript `Cannot find module '@workspace/pg-client-db'` | Run `pnpm run build:libs` to compile workspace libraries first |
| `must_change_password` redirect loop | Use `admin@nexusstaffing.com` / `Admin@123` instead of `systemadmin` |

---

## Secrets Never Included

The following are **never** included in the ZIP or committed to Git:
- `.env` files with real credentials
- `SESSION_SECRET` values
- `ADMIN_SEED_PASSWORD` values
- Database passwords
- JWT signing keys
- Any `node_modules/` directory
