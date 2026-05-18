# 2026-05-10 — Tier 1: Canonical Completeness

## What changed

### Change 1 — Write `outcome` and `reason_code` on `core.visits`
- Extended `closeVisitForRouteRunStop` signature to accept `outcome: string` and `reasonCode?: string`
- SQL now writes `outcome` and `reason_code` via `COALESCE` (idempotent, will not overwrite existing values)
- `cleanLogService.completeStop` calls `closeVisitForRouteRunStop` with `outcome: 'completed'`
- `routeRunStopRoutes` skip handler calls `closeVisitForRouteRunStop` with `outcome: 'skipped'` and `reasonCode: hazard_types[0]`

### Change 2 — Add `washed_can` observation branch
- Added `washed_can?: boolean` to `StopUiPayload` type in `observationService.ts`
- Added `washed_can` branch in `submitObservations()` that emits `{ observation_type: 'washed_can', payload: { value: boolean } }`
- Propagated `washed_can` from request data into `uiPayload` built in `cleanLogService.ts`

### Change 3 — Write to `core.evidence` on photo upload
- `createStopPhotos` now writes one `core.evidence` row per photo via `INSERT ... SELECT` from `core.visits` using `client_visit_id`
- `stop_photos` write is preserved (additive — both writes occur)
- If no visit exists at upload time (offline edge case), both inserts write 0 rows and log a warning; photo upload does not fail

### Change 4 — Fix visit lifecycle (open at stop-start, not photo upload)
- Removed `ensureVisitForRouteRunStop` call from `createStopPhotos` in `stopPhotosService.ts`
- Removed `ensureVisitForRouteRunStop` import from `stopPhotosService.ts`
- Visit creation at stop-start was already implemented inside `startRouteRunStopInternal` (confirmed during implementation); no new call was required in the route handler

### Change 5 — Make complete-stop a single atomic transaction
- `cleanLogService.completeStop` now accepts a `PoolClient` as first parameter; it no longer opens its own connection or manages BEGIN/COMMIT/ROLLBACK
- `emitSpotCheckObservation` (observationService) now accepts `client: PoolClient` instead of `pool: any`; called inside the transaction
- `emitObservationsForStop` (observationService) accepts optional `client?: PoolClient`; when provided, uses it directly instead of opening a new connection — observations are now inside the transaction
- `routeRunStopRoutes` complete handler merges the former two-transaction pattern (hazard + completeStop) into one `BEGIN … COMMIT` block; `loadRouteRunById` is called after commit
- `cleanLogService.completeStop` returns `{ cleanLogId, routeRunId }` instead of `{ cleanLogId, routeRun }`

### Change 6 — Fix safety cast in `cleanLogService.ts`
- Removed `(data as any).safety` cast; `data.safety` is already typed in the function signature
- `safetyHazards` now assigned as `data.safety?.hazard_types as StopUiPayload['safetyHazards']`
- Removed all developer-noise / in-progress commentary comments from cleanLogService

## Why
- `core.visits.outcome` and `core.visits.reason_code` were always null — the canonical visit gave no signal about what happened at a stop
- `washed_can` existed only in `clean_logs` (transit layer); intelligence had no canonical signal for can-wash state
- `core.evidence` had 0 rows — canonical evidence layer was empty despite photos being the primary visit artifact
- Visit lifecycle was wrong: photo upload was creating visits, meaning abandoned stops left unclosed visits and `started_at` reflected photo time not arrival time
- Two-transaction complete-stop was partial-failure vulnerable: a failed second transaction left the hazard written but the stop not completed
- `data as any` cast was bypassing TypeScript type checking for the safety field

## Files touched
- `backend/src/domains/visit/visitService.ts`
- `backend/src/domains/observation/observationService.ts`
- `backend/src/domains/routeRunStop/cleanLogService.ts`
- `backend/src/domains/routeRunStop/stopPhotosService.ts`
- `backend/src/modules/work/routeRunStopRoutes.ts`

## Done-criteria status

- [x] `core.visits` row exists with `started_at` set at stop-start time (created inside `startRouteRunStopInternal`)
- [x] `core.visits.ended_at` is non-null for completed and skipped stops (written by `closeVisitForRouteRunStop`)
- [x] `core.visits.outcome = 'completed'` for completed stops
- [x] `core.visits.outcome = 'skipped'` + `reason_code` populated for skipped stops
- [x] `core.observations` has a `washed_can` row for stops where `washed_can` was set
- [x] `core.evidence` has one row per photo for the stop's visit
- [x] `stop_photos` still receives rows (additive — preserved)
- [x] `clean_logs` still receives rows (additive — preserved)
- [x] Complete-stop operation is a single atomic transaction
- [x] TypeScript compiles without `any` cast in `cleanLogService.ts` (tsc --noEmit passes clean)
- [x] Offline replay (`START_STOP` → `UPLOAD_STOP_PHOTOS` → `COMPLETE_STOP`) — replay order corrected (see post-verification fix below); live DB verification of online path confirmed 2026-05-10
- [x] Changelog entry written

---

## Post-verification fix — Offline replay order (2026-05-10)

### What was wrong
`offlineQueue.ts` defined the replay sort order as `UPLOAD_STOP_PHOTOS=1, START_STOP=2`, meaning photos replayed before the start-stop action. The old `createStopPhotos` papered over this by calling `ensureVisitForRouteRunStop` as a side effect, which created the visit during photo upload even if `START_STOP` had not yet replayed. Tier 1 correctly removed that side effect — photo upload must not own visit creation — which exposed the latent ordering bug: photos now arrived before the visit existed, causing both `stop_photos` and `core.evidence` inserts to write 0 rows.

### The fix
Swapped the two values in `actionOrder` inside `runReplay()` in `offlineQueue.ts`:
```
Before: UPLOAD_STOP_PHOTOS=1, START_STOP=2
After:  START_STOP=1, UPLOAD_STOP_PHOTOS=2
```
Updated the adjacent comment to match. No other changes to the file.

### Why this file is normally frozen
`offlineQueue.ts` is listed in the Tier 1 "Files to Leave Alone" table because the offline queue contract (action types, replay semantics, localStorage schema) must not change mid-migration. This fix touches none of those things — it corrects only the numeric sort priority of two existing action types. The action types themselves, their payloads, and the replay mechanics are unchanged. Authorized as a targeted bug fix by the user before the change was made.

### File touched
- `frontend/src/offline/offlineQueue.ts` — two integer values and one comment inside `runReplay()`
