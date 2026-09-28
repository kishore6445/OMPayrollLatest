-- Migration 004: Aadhaar Face Authentication sessions
-- Run against: payrollom_client
-- Additive only. Raw Aadhaar number and biometric data are intentionally NOT stored.

CREATE TABLE IF NOT EXISTS aadhaar_face_sessions (
  id                  VARCHAR(64) PRIMARY KEY,
  user_id             INTEGER NOT NULL,
  emp_code            VARCHAR(25),
  aadhaar_hash        CHAR(64) NOT NULL,
  aadhaar_last4       CHAR(4) NOT NULL,
  status              VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  provider_session_id VARCHAR(160),
  provider_txn_id     VARCHAR(200),
  purpose             VARCHAR(80) NOT NULL DEFAULT 'EMPLOYEE_ONBOARDING',
  consent_at          TIMESTAMP NOT NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMP NOT NULL,
  verified_at         TIMESTAMP,
  failure_code        VARCHAR(80),
  failure_message     VARCHAR(240),
  CONSTRAINT ck_aadhaar_face_status CHECK (status IN ('PENDING','VERIFIED','FAILED','EXPIRED'))
);

CREATE INDEX IF NOT EXISTS idx_aadhaar_face_sessions_user_created
  ON aadhaar_face_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aadhaar_face_sessions_provider
  ON aadhaar_face_sessions(provider_session_id);
