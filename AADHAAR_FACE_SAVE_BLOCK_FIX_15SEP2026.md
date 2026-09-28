# Aadhaar Face save-block fix — 15 Sep 2026

Root cause:
`POST /api/workers` and the Aadhaar-change path in `PATCH /api/workers/:EmpCode`
still required an `aadhaarFaceVerificationId` and verified it against the legacy
`aadhaar_face_sessions` table. This remained after Aadhaar Face was removed from
the onboarding UI, so an employee with Aadhaar data could not be saved.

Fix:
- Removed the obsolete Aadhaar Face proof requirement from employee CREATE.
- Removed the obsolete Aadhaar Face proof requirement when Aadhaar changes on employee UPDATE.
- Removed the now-unused Face Auth import/helper from `workers.ts`.
- Existing normal employee validation remains.
- Aadhaar DigiLocker, Aadhaar auto-fetch, DOB handling, IFSC fix, UAN DigiLocker,
  payroll, auth, DB schema/data/config were not changed.
- Legacy Face Auth service/routes/files were not deleted; only the worker save dependency was removed.
