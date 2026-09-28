-- Backfill verified legacy Organization / Entity Codes into COMPANYMAST.corpID.
-- Source: OM legacy reconciliation data (Entity ID -> Entity Code).
-- This does NOT overwrite an Organization Code already maintained in Company Master.
BEGIN;

UPDATE "COMPANYMAST" SET "corpID" = 'OMUS' WHERE "compid" = 1 AND NULLIF(BTRIM("corpID"), '') IS NULL;
UPDATE "COMPANYMAST" SET "corpID" = 'SY'   WHERE "compid" = 4 AND NULLIF(BTRIM("corpID"), '') IS NULL;
UPDATE "COMPANYMAST" SET "corpID" = 'OMUP' WHERE "compid" = 6 AND NULLIF(BTRIM("corpID"), '') IS NULL;
UPDATE "COMPANYMAST" SET "corpID" = 'OMH'  WHERE "compid" = 7 AND NULLIF(BTRIM("corpID"), '') IS NULL;
UPDATE "COMPANYMAST" SET "corpID" = 'OS'   WHERE "compid" = 8 AND NULLIF(BTRIM("corpID"), '') IS NULL;

COMMIT;

-- Review all organizations after running. Any row with a blank corpID has no
-- verified Entity Code in the supplied reconciliation data and should be filled
-- from Company Master/Edit Company rather than displaying compid as a fake code.
SELECT "compid", "comname", "corpID"
FROM "COMPANYMAST"
ORDER BY "compid";
