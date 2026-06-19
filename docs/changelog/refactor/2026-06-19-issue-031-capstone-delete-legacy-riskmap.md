# 2026-06-19 — ISSUE-031 capstone: delete dead rebuildStopRiskSnapshotLegacy

## What changed
- Deleted the dead `rebuildStopRiskSnapshotLegacy()` function from
  `backend/src/intelligence/riskMapService.ts` (formerly lines ~378–563, including its
  JSDoc block). This was the Tier-2 additive-verification reader preserved verbatim to
  diff canonical-vs-legacy snapshot output during the migration verification window.
- Code deletion only. No schema change, no behavior change — the function had zero
  callers and was never invoked by the active risk job or any route.

## Why
- The function read the four legacy work-attribution tables `level3_logs`,
  `trash_volume_logs`, `hazards`, and `infrastructure_issues`. As of the ISSUE-031
  Stage-2 work, `level3_logs` is dropped and the remaining three (plus `clean_logs`,
  `stop_photos`) are Stage-2 dual-write-clipped. With all of its inputs frozen, the
  verification window is permanently closed — the Tier-2 done-definition's "delete once
  verified" condition is satisfied.
- This is the closing move (capstone) of ISSUE-031's P1 scope: it removes the last
  living-table legacy reader so no code path in the repo reads the clipped tables.

## Verification
- Grep: zero references to `rebuildStopRiskSnapshotLegacy` in `backend/src` / `frontend/src`
  after deletion (remaining matches are docs/changelog/audit/SQL-comment history only).
- The live `rebuildStopRiskSnapshot()` (canonical reader of `core.observations` /
  `core.visits` / `core.v_observation_normalized`) is untouched, as are its callers
  (`riskMapJob.ts`, `adminRoutes.ts`) and the `riskMapSeverity.test.ts` suite.
- `npx tsc --noEmit` clean. No test referenced the legacy function (none removed).
- `Pool` import retained — still used by the live function.

## Scope notes
- Stage-3 table `DROP`s and the ISSUE-035 reader repoints are separately-tracked
  Capability-Build work, not part of this deletion.
- No orphaned helpers were created: the function used only the shared module-level
  scoring constants (still used by the live function) and the shared `Pool` import.

## Files touched
- `backend/src/intelligence/riskMapService.ts`
