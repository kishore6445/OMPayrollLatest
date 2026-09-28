-- Rollback for Migration 003: Branch–Client Mapping and HR Manager Scope Tables
-- WARNING: drops all scope data. Only run if you intend to remove this feature.
-- Run against: payrollom_client

DROP TABLE IF EXISTS "USERCLIENT";
DROP TABLE IF EXISTS "USERBRANCH";
DROP TABLE IF EXISTS "BRANCHCLIENT";
