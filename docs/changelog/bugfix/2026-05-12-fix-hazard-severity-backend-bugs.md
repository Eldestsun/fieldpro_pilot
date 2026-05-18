# 2026-05-12 — Fix hazard severity backend bugs (skip path 500 + skip observations)

## What changed
- `hazardService.ts`: changed `severity` param type from `number` to `string | number`.
  Added `toNumericSeverity()` converter (`"low"→1`, `"medium"→2`, `"high"→3`, numeric
  pass-through) so string severity labels from the UI can be stored in the
  `hazards.severity smallint` column without a Postgres type error.
- `routeRunStopRoutes.ts` skip path: added `hazard_severity: severity` to the
  `uiPayload` passed to `emitObservationsForStop`, so `core.observations.severity`
  is now written on the skip path (was missing — only the complete path had it).

## Why
- The severity selector added in the frontend session sent string values
  (`"high"`, `"medium"`, `"low"`). `hazardService` expected a number and passed
  the value directly to a `smallint` column → Postgres threw
  `invalid input syntax for type smallint: "high"` → 500 on every skip with severity.
- The skip route built `uiPayload` without `hazard_severity`, so even after fixing
  the 500, `core.observations.severity` would have remained NULL on skipped stops.

## Files touched
- backend/src/domains/routeRunStop/hazardService.ts
- backend/src/modules/work/routeRunStopRoutes.ts
