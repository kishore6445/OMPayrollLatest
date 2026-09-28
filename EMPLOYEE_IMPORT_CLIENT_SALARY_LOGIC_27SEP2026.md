# Employee Import — Client-driven Salary Resolution

Implemented on 27-Sep-2026.

## Import identity / client mapping
- Excel must contain `compid` + `unitcode`.
- The pair must resolve to an existing `UNITMASTER` row.
- Excel does not create a Client and does not modify any UI dropdown.
- User scope is checked against the resolved Organization + Client.

## Salary resolution
For each salary slot 1..17:
- `UNITMASTER.SalHeadN` determines whether the component is applicable for that Client.
- If the Client does not use the slot, any Excel value in `SalHeadN` is ignored.
- If the Client uses the slot and Excel provides a value, the Excel value is used for that Employee.
- If Excel leaves the value blank, `UNITMASTER.SalHeadDefaultN` is inherited when available.
- The final resolved values are inserted into `EMPMAST.SalHead1..17`.

## Validation
- `unitcode` is now a required Employee-import column.
- Unknown Client under the selected Organization is rejected.
- Blank/unused salary columns do not fail validation.
- Existing Aadhaar/UAN/ESIC verification behavior is unchanged.

## DB dependency
Migration 009 (`SalHeadDefault1..17` on `UNITMASTER`) must be applied before this flow can use Client salary defaults.
