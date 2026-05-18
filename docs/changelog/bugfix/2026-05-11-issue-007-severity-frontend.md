# 2026-05-11 — ISSUE-007 complete: hazard severity frontend selection and wire-through

## What changed
- Added severity pill selector (Low / Medium / High) to the safety reporting modal in
  `StopDetail.tsx`. The selector appears inline below hazard checkboxes when at least
  one hazard type is selected; hidden when no hazard is selected. Tapping a selected
  pill deselects it (severity remains optional, no submission gate added).
- Changed `SafetyState.severity` type from `number` to `string` in `useTodayRoute.ts`
  to match the lowercase string values ("low", "medium", "high") written to
  `core.observations.severity`.
- Fixed hardcoded `severity: 1` in `handleCompleteStop` — replaced with
  `safetyState[stopId]?.severity` so the selected value is actually submitted.
- Fixed field name mismatch in `cleanLogService.ts`: `data.safety.hazard_severity` →
  `data.safety.severity`, matching the field name in the route body safety object.
- This completes ISSUE-007 end to end: write path (observationService) + frontend
  selection + wire-through (useTodayRoute → queue action → route → cleanLogService
  → observationService → core.observations.severity).

## Why
- ISSUE-007: `core.observations.severity` was never populated. The backend write path
  was fixed in a prior session; this session adds the UI and closes the data gap.

## Files touched
- frontend/src/components/today-route/StopDetail.tsx
- frontend/src/hooks/useTodayRoute.ts
- backend/src/domains/routeRunStop/cleanLogService.ts
- docs/KNOWN_ISSUES.md
