# XLSX import namespace compatibility fix — 26 Sep 2026

## Problem
Excel files saved by standard spreadsheet libraries / Microsoft Excel can serialize worksheet XML with namespace prefixes such as `<x:row>`, `<x:c>`, `<x:v>` and `<x:t>`.

The lightweight XLSX reader only matched unprefixed tags (`<row>`, `<c>`, `<v>`, `<t>`), so valid filled templates could be parsed as having zero data rows and the UI showed `Excel file has no Client rows`.

## Fix
`artifacts/api-server/src/lib/xlsx-lite.ts` now accepts both prefixed and unprefixed SpreadsheetML tags for rows, cells, values, inline strings and shared strings.

This fixes both Client and Employee Excel import because they use the same parser.

No DB migration is required.
