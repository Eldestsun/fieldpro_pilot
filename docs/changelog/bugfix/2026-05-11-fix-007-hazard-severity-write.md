# 2026-05-11 — Fix ISSUE-007: write hazard severity into core.observations

## What changed
- Added optional `hazard_severity?: string | number` to `StopUiPayload` in observationService.ts.
- Added optional `severity` to `ObservationInsert` and threaded it into the `core.observations` INSERT (new `severity` column in the values list).
- `submitObservations()` now stamps the payload's `hazard_severity` onto every hazard-type observation it emits (`safety_concern_present` and each mapped hazard type).
- Extended `completeStop.data.safety` in cleanLogService.ts to carry `hazard_severity` and pass it through to the emitted `StopUiPayload`.

## Why
- `core.observations.severity` was never written, so riskMapService's hazard CTE could only score by presence (hardcoded 1.0), underweighting high-severity hazard stops in `stop_risk_snapshot.hazard_score`.
- This fix covers the write path only; risk scoring update is a follow-on once severity values are present in the DB.

## Files touched
- backend/src/domains/observation/observationService.ts
- backend/src/domains/routeRunStop/cleanLogService.ts
- docs/KNOWN_ISSUES.md
