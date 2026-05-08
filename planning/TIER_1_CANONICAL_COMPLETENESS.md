# Tier 1 — Canonical Completeness

> **Goal**: Every completed or skipped stop writes `outcome`, `reason_code`, `washed_can`, and a `core.evidence` row. Visit lifecycle opens at stop-start, not photo upload.
>
> **Status**: 🔴 Not started
> **Depends on**: Nothing (unblocked)
> **Blocks**: Tier 2, Tier 5

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/src/domains/visit/visitService.ts` | Add `outcome` + `reason_code` params to `closeVisitForRouteRunStop`; fix visit creation to be a no-op if already created on stop-start |
| `backend/src/domains/routeRunStop/cleanLogService.ts` | Write `outcome='completed'` on visit close; fix safety cast; move observation emit inside transaction |
| `backend/src/modules/work/routeRunStopRoutes.ts` | Write `outcome='skipped'` + `reason_code` on skip path; fix two-transaction problem on complete |
| `backend/src/domains/observation/observationService.ts` | Add `washed_can` observation branch; rename `pool: any` to `pool: PoolClient` in `emitSpotCheckObservation` |
| `backend/src/domains/routeRunStop/stopPhotosService.ts` | Write to `core.evidence` alongside `stop_photos`; remove pre-create-visit call from photo upload |

---

## Files to Leave Alone

| File | Reason |
|------|--------|
| `backend/src/lib/authz.ts` | Auth is frozen |
| `backend/src/middleware/AuthContext.tsx` (frontend) | Auth is frozen |
| `frontend/src/utils/offlineQueue.ts` | Offline contract is frozen |
| `frontend/src/components/OfflineSyncManager.tsx` | Offline contract is frozen |
| `frontend/src/utils/photoStore.ts` | Offline contract is frozen |
| `frontend/src/utils/stopDraftStore.ts` | Offline contract is frozen |
| `backend/src/intelligence/riskMapService.ts` | Intelligence migration is Tier 2 |
| `backend/src/modules/admin/adminRoutes.ts` | Control Center reconnect is Tier 3 |
| `frontend/src/components/admin/AdminControlCenter.tsx` | Control Center reconnect is Tier 3 |
| `frontend/src/App.tsx` | Control Center reconnect is Tier 3 |
| Any `public.workforce_metrics` or `public.stop_scoring_history` | Schema cleanup is Tier 4 |
| Anything touching `core.assignments` | Assignment layer is Tier 5 |

---

## Change 1 — Write `outcome` and `reason_code` on `core.visits`

### What and why

`core.visits` has `outcome TEXT` and `reason_code TEXT` columns that are never written. Every completed stop should write `outcome = 'completed'`. Every skipped stop should write `outcome = 'skipped'` + the hazard reason code. Without these, visits are closed but give no signal about what happened.

### Files touched
- `visitService.ts`
- `cleanLogService.ts`
- `routeRunStopRoutes.ts`

### Before

`closeVisitForRouteRunStop(routeRunStopId, client)` — no outcome params.

In `cleanLogService.ts`:
```
await closeVisitForRouteRunStop(routeRunStopId, client)
```

In `routeRunStopRoutes.ts` skip handler:
```
await closeVisitForRouteRunStop(routeRunStopId, client)
```
No reason code written.

### After

`closeVisitForRouteRunStop(routeRunStopId, client, outcome: string, reasonCode?: string)`

SQL inside function:
```sql
UPDATE core.visits
SET ended_at = NOW(), outcome = $2, reason_code = $3
WHERE id = (
  SELECT id FROM core.visits
  WHERE route_run_stop_id = $1
  ORDER BY started_at DESC LIMIT 1
)
```

`cleanLogService.ts` calls:
```
await closeVisitForRouteRunStop(routeRunStopId, client, 'completed')
```

`routeRunStopRoutes.ts` skip handler calls:
```
await closeVisitForRouteRunStop(routeRunStopId, client, 'skipped', hazardType)
```

### Done criteria
- `SELECT outcome, reason_code FROM core.visits WHERE route_run_stop_id = :id` returns non-null `outcome` for completed and skipped stops.
- Existing `clean_logs` write is untouched — both writes occur.

---

## Change 2 — Add `washed_can` Observation

### What and why

`washed_can` is a boolean field captured at stop completion but never written to `core.observations`. Only `clean_logs` records it. Intelligence cannot derive a canonical "can was washed" signal from `core.observations`.

### File touched
- `observationService.ts`

### Before

`submitObservations()` maps `checklist.clean`, `trashVolume`, `safety`, `infra` to observation pairs. `washed_can` is absent.

### After

Add branch in `submitObservations()`:

```typescript
if (payload.checklist?.washed_can === true || payload.checklist?.washed_can === false) {
  observations.push({
    visit_id: visitId,
    asset_id: assetId,
    observation_type: 'washed_can',
    observed_value: payload.checklist.washed_can ? 'true' : 'false',
    observed_at: now,
  })
}
```

### Done criteria
- After completing a stop with `washed_can: true`, `SELECT * FROM core.observations WHERE observation_type = 'washed_can' AND visit_id = :id` returns one row with `observed_value = 'true'`.
- Existing `clean_logs.washed_can` write is untouched.

---

## Change 3 — Write to `core.evidence` on Photo Upload

### What and why

`stopPhotosService.ts` writes to `stop_photos` only. `core.evidence` has 0 rows. Photos are the primary evidence artifact for a visit; without `core.evidence` rows, the canonical evidence layer is empty and cannot be consumed by intelligence or audit surfaces.

### File touched
- `stopPhotosService.ts`

### Before

`createStopPhotos()`:
1. Calls `ensureVisitForRouteRunStop()` — creates a visit prematurely at photo upload time.
2. Writes rows to `stop_photos`.
3. Does NOT write to `core.evidence`.

### After

`createStopPhotos()`:
1. **Remove** call to `ensureVisitForRouteRunStop()`. (Visit creation now happens at stop-start — see Change 4. Photo upload must not create a visit.)
2. Write to `stop_photos` (unchanged — additive discipline).
3. **Add** write to `core.evidence` for each photo:

```sql
INSERT INTO core.evidence
  (visit_id, observation_id, kind, storage_key, captured_by_oid)
SELECT
  v.id,
  NULL,
  $1,  -- kind ('completion' | 'safety' etc.)
  $2,  -- storage_key (the S3/blob path)
  $3   -- captured_by_oid (from auth context — currently the OID stub)
FROM core.visits v
WHERE v.route_run_stop_id = $4
ORDER BY v.started_at DESC
LIMIT 1
ON CONFLICT DO NOTHING
```

If no visit row exists for the stop yet (edge case: photo uploaded before stop-start replay in offline scenario), log a warning and skip the evidence write — do not fail the photo upload.

### Done criteria
- After completing a stop with photos, `SELECT * FROM core.evidence WHERE visit_id = :id` returns rows equal to the number of photos uploaded.
- `stop_photos` still receives rows (no regression).
- Photo upload does not create a visit row.

---

## Change 4 — Fix Visit Lifecycle (Start Event, Not Photo Upload)

### What and why

`ensureVisitForRouteRunStop()` is currently called from `stopPhotosService.ts` (photo upload). This is wrong — a visit should open when a worker starts a stop, not when they upload a photo. Photos can be uploaded before stop-start in offline replay, creating a visit with no `started_at` context.

The correct trigger is the `START_STOP` route handler.

### Files touched
- `routeRunStopRoutes.ts` (add `ensureVisitForRouteRunStop` call to the start-stop handler)
- `stopPhotosService.ts` (remove `ensureVisitForRouteRunStop` call — covered by Change 3)

### Before

Start-stop route handler: updates `route_run_stops.status = 'in_progress'`. Does NOT create a visit.

Photo upload handler: calls `ensureVisitForRouteRunStop()` as side effect.

### After

Start-stop route handler:
```typescript
// After updating route_run_stops status:
await ensureVisitForRouteRunStop(routeRunStopId, client)
```

Photo upload handler: no `ensureVisitForRouteRunStop` call (removed per Change 3).

`ensureVisitForRouteRunStop()` already uses UUIDv5 idempotency — calling it twice for the same stop is safe.

### Done criteria
- After calling `START_STOP`, `SELECT * FROM core.visits WHERE route_run_stop_id = :id` returns one row with `started_at` set.
- Photo upload for the same stop does NOT create a second visit row.
- Offline replay of `START_STOP` followed by `COMPLETE_STOP` produces exactly one visit row.

---

## Change 5 — Fix Two-Transaction Problem on Complete Stop

### What and why

The complete-stop route handler opens one transaction for the hazard write, commits, then calls `cleanLogService.ts` which opens a second transaction. If the second transaction fails, the hazard is written but the stop is not completed — partial state.

Additionally, `emitSpotCheckObservation()` runs post-commit on a separate pool connection. If it fails, it's silently swallowed.

### Files touched
- `routeRunStopRoutes.ts`
- `cleanLogService.ts`
- `observationService.ts`

### Before

In `routeRunStopRoutes.ts`:
```typescript
const client = await pool.connect()
await client.query('BEGIN')
// ... hazard writes ...
await client.query('COMMIT')    // ← first commit
await cleanLogService.completeStop(...)  // ← opens second transaction internally
```

In `observationService.ts`, `emitSpotCheckObservation`:
```typescript
// called after cleanLogService completes, uses a new pool connection
const obs = await pool.query(...)
```

### After

Merge into one transaction:

```typescript
const client = await pool.connect()
try {
  await client.query('BEGIN')
  // hazard writes (if any)
  // cleanLogService writes (pass client, not pool)
  // observation emit (pass client)
  await client.query('COMMIT')
} catch (err) {
  await client.query('ROLLBACK')
  throw err
} finally {
  client.release()
}
```

`cleanLogService.completeStop()` must accept a `PoolClient` parameter instead of opening its own connection.

`emitSpotCheckObservation()` must accept a `PoolClient` parameter (rename `pool: any` → `client: PoolClient`).

### Done criteria
- If any write in the complete-stop sequence fails, the entire operation rolls back — no partial state in DB.
- `emitSpotCheckObservation` is called within the same transaction as the stop completion.
- The handler still handles the existing error cases (route not found, stop conflict) correctly.

---

## Change 6 — Fix Safety Cast in `cleanLogService.ts`

### What and why

`completeStop()` accesses `(data as any).safety?.hazard_types` — an unsafe TypeScript cast that bypasses type checking. The `StopUiPayload` type in `observationService.ts` already has the correct shape.

### File touched
- `cleanLogService.ts`

### Before

```typescript
const hazards = (data as any).safety?.hazard_types ?? []
```

### After

Import and use `StopUiPayload`:
```typescript
import { StopUiPayload } from '../observation/observationService'
// ...
const hazards = (data as StopUiPayload).safety?.hazard_types ?? []
```

Remove the developer-noise comments at lines ~108–123 (the `// TODO: remove this hack` style notes that have become stale).

### Done criteria
- `cleanLogService.ts` compiles without `any` cast for the safety field.
- TypeScript strict mode does not flag the safety access.

---

## Tier 1 Overall Done Definition

Tier 1 is complete when ALL of the following are true for a fresh completed stop and a fresh skipped stop against the real database, **and a changelog entry has been written to `docs/changelog/`**:

- [ ] `core.visits` row exists with `started_at` set at stop-start time (not photo upload time)
- [ ] `core.visits.ended_at` is non-null for completed and skipped stops
- [ ] `core.visits.outcome = 'completed'` for completed stops
- [ ] `core.visits.outcome = 'skipped'` + `reason_code` populated for skipped stops
- [ ] `core.observations` has a `washed_can` row for stops where `washed_can` was set
- [ ] `core.evidence` has one row per photo for the stop's visit
- [ ] `stop_photos` still receives rows (no regression)
- [ ] `clean_logs` still receives rows (no regression)
- [ ] Complete-stop operation is a single atomic transaction
- [ ] TypeScript compiles without `any` cast in `cleanLogService.ts`
- [ ] Offline replay (`START_STOP` → `UPLOAD_STOP_PHOTOS` → `COMPLETE_STOP`) produces correct canonical rows
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-tier-1-canonical-completeness.md` listing all files touched and DB state verified

---

## What Tier 1 Does NOT Do

- Does not touch `core.assignments` or write `assignment_id` (that is Tier 5)
- Does not migrate intelligence reads (that is Tier 2)
- Does not mount AdminControlCenter (that is Tier 3)
- Does not deprecate any transit tables (`clean_logs`, `stop_photos`, `route_run_stops` remain active)
- Does not fix the `user_id = 123` stub (auth identity refactor is not yet scoped)
- Does not add new action types to the offline queue

---

## Additive Discipline Reminder

Every change in this tier must preserve existing writes. The pattern is always:

```
NEW canonical write
+
EXISTING transit write (unchanged)
```

Do not remove `clean_logs`, `stop_photos`, or any existing write until Tier 2 has verified that intelligence reads cleanly from canonical state alone.
