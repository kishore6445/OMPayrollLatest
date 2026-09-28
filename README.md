# Payroll Nexus

India-first enterprise payroll SaaS for staffing / manpower / facility-management companies (multi-client, multi-site, multi-state). Full payroll spine: workers, assignments, salary structures, attendance, payroll calculation with Indian statutory deductions (PF, ESI, PT, LWF), approval & lock workflow, bank files, payslips, compliance reports (PF ECR, ESI, PT, LWF), client invoicing, and a full audit trail.

**Stack:** pnpm workspaces · Node.js 24 · TypeScript · React + Vite + Tailwind CSS + shadcn/ui · Express 5 · PostgreSQL + Drizzle ORM · Zod · OpenAPI-first codegen (Orval)

---

## Running locally (Windows, macOS, or Linux)

### 1. Required software

| Software | Version | Download |
|---|---|---|
| Node.js | 22 or newer (24 recommended) | https://nodejs.org/en/download |
| pnpm | 10.x | installed via corepack (below) |
| PostgreSQL | 15 or newer (16 recommended) | https://www.postgresql.org/download/windows/ |

**Install Node.js (Windows):** download the Windows installer (.msi) from nodejs.org, run it, accept defaults. Verify in PowerShell:

```powershell
node --version
```

**Install pnpm:** in PowerShell (run once):

```powershell
corepack enable
corepack prepare pnpm@10 --activate
pnpm --version
```

If `corepack` is not available: `npm install -g pnpm@10`.

> **Note:** pnpm is mandatory for this project — `npm install` and `yarn` are blocked by a preinstall check.

**Install PostgreSQL (Windows):** download the installer from postgresql.org, run it, remember the password you set for the `postgres` user. Keep the default port `5432`. pgAdmin is included and optional.

### 2. Create the database

Open PowerShell and run (enter your postgres password when prompted):

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE payroll_nexus;"
```

(Adjust the path if you installed a different PostgreSQL version, or create the database in pgAdmin instead.)

### 3. Configure environment

From the project root:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set `DATABASE_URL` to match your local database, e.g.:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/payroll_nexus
```

### 4. Install dependencies

```powershell
pnpm install
```

### 5. Apply the database schema

```powershell
pnpm run db:push
```

### 6. Seed demo data

```powershell
pnpm run db:seed
```

This wipes and repopulates all tables with the demo tenant, 50 demo users, 20 workers, attendance, payroll batches, invoices, and compliance data. Safe to re-run any time.

### 7. Start the application

```powershell
pnpm run dev
```

This starts both services:

| Service | URL |
|---|---|
| Frontend (web app) | http://localhost:5000 |
| API server | http://localhost:8080 (proxied at http://localhost:5000/api) |

Open **http://localhost:5000** in your browser.

To run the two services in separate terminals instead:

```powershell
pnpm --filter @workspace/api-server run dev     # terminal 1 — API
pnpm --filter @workspace/payroll-nexus run dev  # terminal 2 — frontend
```

### 8. Log in

| Field | Value |
|---|---|
| Tenant slug | `nexus` |
| Email | `admin@nexusstaffing.com` |
| Password | `Admin@123` |

More demo accounts (all roles) are listed in `replit.md` under "Demo credentials". All are demo/testing credentials only — replace them before any production use.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm run dev` | Start API + frontend together (development) |
| `pnpm run build` | Typecheck and build all packages |
| `pnpm run start` | Serve the production build (API + frontend preview) |
| `pnpm run db:push` | Apply the database schema (Drizzle push) |
| `pnpm run db:seed` | Seed demo data (wipes and repopulates) |
| `pnpm run typecheck` | Full typecheck across all packages |
| `pnpm --filter @workspace/api-server run test` | Run the API test suite (129 tests) |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks/schemas from the OpenAPI spec |

## Project structure

```
artifacts/api-server/      Express 5 API (port 8080, base path /api)
artifacts/payroll-nexus/   React + Vite frontend (port 5000)
lib/api-spec/              OpenAPI spec (source of truth for API contracts)
lib/api-client-react/      Generated React Query hooks
lib/api-zod/               Generated Zod schemas
lib/db/                    Drizzle ORM schema + database client
lib/billing/               Payroll/billing calculation engine
scripts/                   Seeders and utility scripts
```

## Troubleshooting

- **`DATABASE_URL must be set`** — you haven't created `.env`, or it's in the wrong folder. It must be in the project root (same folder as `package.json`).
- **`password authentication failed`** — the password in `DATABASE_URL` doesn't match your postgres user password.
- **`database "payroll_nexus" does not exist`** — run the CREATE DATABASE step above.
- **Port already in use (5000 or 8080)** — stop the other program, or set `PORT` before starting (e.g. `$env:PORT=8081; pnpm --filter @workspace/api-server run dev`). If you change the API port, also set `VITE_API_PROXY_TARGET=http://localhost:<port>` for the frontend.
- **Frontend loads but API calls fail** — make sure the API server is running (check http://localhost:8080/api/healthz).
- **`Use pnpm instead` during install** — this project requires pnpm; don't use `npm install` or `yarn`.
- **Blank page after login** — hard refresh (Ctrl+Shift+R) and check the browser console.
