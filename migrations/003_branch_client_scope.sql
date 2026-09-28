-- Migration 003: Branch–Client Mapping and HR Manager Scope Tables
-- Run against: payrollom_client
-- Date: 2026-08-06
-- Additive only — no existing tables are altered.

-- ── BRANCHCLIENT: maps a Client to one or more Branches ──────────────────────
CREATE TABLE IF NOT EXISTS "BRANCHCLIENT" (
  id         SERIAL    PRIMARY KEY,
  compid     INTEGER   NOT NULL,
  branchcode INTEGER   NOT NULL,
  clientcode INTEGER   NOT NULL,
  is_active  BOOLEAN   NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by INTEGER,
  updated_at TIMESTAMP,
  CONSTRAINT uq_branchclient UNIQUE (compid, branchcode, clientcode)
);

-- ── USERBRANCH: maps an HR Manager to allowed Branches ───────────────────────
CREATE TABLE IF NOT EXISTS "USERBRANCH" (
  id         SERIAL    PRIMARY KEY,
  usercode   INTEGER   NOT NULL,        -- references app_users.id
  compid     INTEGER   NOT NULL,
  branchcode INTEGER   NOT NULL,
  is_active  BOOLEAN   NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by INTEGER,
  updated_at TIMESTAMP,
  CONSTRAINT uq_userbranch UNIQUE (usercode, compid, branchcode)
);

-- ── USERCLIENT: maps an HR Manager to allowed Clients within a Branch ─────────
CREATE TABLE IF NOT EXISTS "USERCLIENT" (
  id         SERIAL    PRIMARY KEY,
  usercode   INTEGER   NOT NULL,        -- references app_users.id
  compid     INTEGER   NOT NULL,
  branchcode INTEGER   NOT NULL,
  clientcode INTEGER   NOT NULL,
  is_active  BOOLEAN   NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by INTEGER,
  updated_at TIMESTAMP,
  CONSTRAINT uq_userclient UNIQUE (usercode, compid, branchcode, clientcode)
);
