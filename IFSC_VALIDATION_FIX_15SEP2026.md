# IFSC validation fix — 15 Sep 2026

Root cause:
The PATCH worker route merged the incoming partial update with the full existing EMPMAST row and then validated every IFSC field. A legacy/non-IFSC value already stored in `UANBankIFSC` could therefore block an unrelated update to the normal bank `SavingIFSCCode`, producing `UANBankIFSC is not a valid IFSC code` even when the entered IFSC was valid.

Fix:
- PATCH validation now validates `SavingIFSCCode`, `UANBankIFSC`, and `PFBankIFSC` format only when that particular field is included in the PATCH.
- Create validation remains unchanged in intent and still validates supplied IFSC fields.
- IFSC validation trims and uppercases before regex testing.
- No database schema/data/configuration changes.
- No Aadhaar, UAN DigiLocker, auth, payroll, or DOB changes.
