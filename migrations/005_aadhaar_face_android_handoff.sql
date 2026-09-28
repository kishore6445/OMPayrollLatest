-- Android companion handoff support for Aadhaar Face Authentication.
-- Additive-only change to the face-auth session table introduced in migration 004.

ALTER TABLE aadhaar_face_sessions
  ADD COLUMN IF NOT EXISTS mobile_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS mobile_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mobile_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_aadhaar_face_sessions_mobile_token
  ON aadhaar_face_sessions (mobile_token_hash)
  WHERE mobile_token_hash IS NOT NULL;
