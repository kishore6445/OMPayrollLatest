-- User -> business Client (UNITMASTER) scope
-- Additive only. Does not alter app_users or legacy USERCLIENT.
CREATE TABLE IF NOT EXISTS "USERUNIT" (
  id         SERIAL PRIMARY KEY,
  usercode   INTEGER NOT NULL,
  compid     INTEGER NOT NULL,
  unitcode   VARCHAR(20) NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by INTEGER,
  updated_at TIMESTAMP,
  CONSTRAINT uq_userunit UNIQUE (usercode, compid, unitcode)
);

CREATE INDEX IF NOT EXISTS idx_userunit_user_active ON "USERUNIT" (usercode, is_active);
CREATE INDEX IF NOT EXISTS idx_userunit_company_unit ON "USERUNIT" (compid, unitcode);
