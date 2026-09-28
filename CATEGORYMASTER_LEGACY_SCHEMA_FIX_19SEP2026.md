# Category Master legacy-schema compatibility fix — 19 Sep 2026

Confirmed from local `payrollom_client`:

- `catcode varchar(50) NULL`
- `catname varchar(50) NULL`
- `catdescription varchar(50) NULL`
- `compid varchar(50) NULL`
- no PK / unique / FK constraints
- category codes may repeat; `catcode` is not a row identifier

Changes in this build:

1. Category API now treats `compid` as text and casts COMPANYMAST.compid when joining.
2. List/read queries no longer fail on integer-vs-varchar comparisons.
3. Create allows legacy repeated codes/names and blocks only an exact same company+code+name duplicate.
4. Edit uses the original company+code+name to safely identify one legacy row.
5. Category form respects the real 50-character column sizes.
6. Employee/worker category lookups are company-scoped and limited to one matching row so repeated legacy category codes do not multiply employee list rows.
7. The local new-DB compatibility migration now mirrors the real legacy table and adds no constraints.

Do not alter the existing local `categorymaster` schema.
