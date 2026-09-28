# Aadhaar Front + Back IDfy Implementation

## What changed

The camera Aadhaar flow now captures both sides before calling IDfy.

1. Capture Front
2. Turn the Aadhaar card over
3. Capture Back
4. Send both images to the backend in one `ind_aadhaar` task
5. IDfy receives `document1` (front) and `document2` (back)
6. The combined result is shown in the existing Aadhaar preview
7. Father/Spouse name is also mapped to the worker `FHName` field when IDfy returns `fathers_name`

## Files changed

- `artifacts/payroll-nexus/src/pages/workers/aadhaar-scan.tsx`
- `artifacts/payroll-nexus/src/pages/workers/form.tsx`
- `artifacts/api-server/src/routes/aadhaar.ts`
- `artifacts/api-server/src/lib/idfy-aadhaar.ts`

## Important

The `.env` file is intentionally not included in this source package. Keep the existing `.env` from your working project, including `IDFY_API_KEY` and `IDFY_ACCOUNT_ID`.

`node_modules` is also intentionally excluded. Run `pnpm install` only if the existing project does not already have its dependencies installed.

## Expected camera flow

The camera dialog should show:

- `Capture Front`
- then `Capture Back`
- then `Sending both sides to IDfy…`

After successful extraction, the preview should contain the existing Aadhaar fields plus `Father / Spouse` when IDfy provides that value.
