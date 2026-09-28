-- Client Master salary component default values
-- Additive only: existing salary component names remain in UNITMASTER.SalHead1..17.
-- These nullable defaults are copied into EMPMAST.SalHead1..17 when a new Employee
-- is created under the Client. Existing Clients/Employees are not modified.
BEGIN;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault1" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault2" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault3" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault4" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault5" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault6" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault7" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault8" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault9" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault10" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault11" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault12" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault13" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault14" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault15" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault16" double precision;
ALTER TABLE "UNITMASTER" ADD COLUMN IF NOT EXISTS "SalHeadDefault17" double precision;
COMMIT;
