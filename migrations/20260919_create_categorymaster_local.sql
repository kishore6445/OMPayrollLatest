-- categorymaster compatibility script for a NEW local DB only.
-- IMPORTANT: the real legacy payrollom_client table (confirmed 19-Sep-2026) is:
--   catcode        varchar(50) NULL
--   catname        varchar(50) NULL
--   catdescription varchar(50) NULL
--   compid         varchar(50) NULL
-- It has no PK/unique/FK constraints and duplicate catcode values are valid.
-- If categorymaster already exists, this script intentionally changes NOTHING.

CREATE TABLE IF NOT EXISTS "categorymaster" (
  "catcode" varchar(50),
  "catname" varchar(50),
  "catdescription" varchar(50),
  "compid" varchar(50)
);

-- No indexes/constraints are added here: compatibility with the legacy DB is intentional.
