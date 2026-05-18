# 2026-05-12 — Ops: severity build errors, HMR verification, backend restart

## What changed
- `frontend/src/api/routeRuns.ts`: changed `HazardPayload.severity` and
  `SafetyPayload.severity` from `number` to `string` to match the string labels
  ("low"/"medium"/"high") sent by the new severity selector.
- `frontend/src/offline/useSyncStatus.ts`: annotated `statusKind` with the explicit
  union type `"synced" | "conflict" | "syncing" | "offline-queued"` to prevent
  TypeScript widening it to `string`, which broke the `RouteHeader` prop contract.
- Killed stale backend process on port 4000 and restarted via preview server so
  the `hazardService` and `routeRunStopRoutes` fixes were live for re-testing.

## Why
- `tsc -b && vite build` exited code 2 before bundling due to two type errors
  introduced when `SafetyState.severity` was changed from `number` to `string`:
  `SafetyPayload.severity` in `routeRuns.ts` still typed as `number`, and
  `useSyncStatus.ts` returned an inferred `string` where a union was required.
- Backend process on port 4000 was a separately-managed instance that had not
  picked up the `hazardService` and `routeRunStopRoutes` fixes; restarting it
  under the preview server made the new code active.

## Files touched
- frontend/src/api/routeRuns.ts
- frontend/src/offline/useSyncStatus.ts
