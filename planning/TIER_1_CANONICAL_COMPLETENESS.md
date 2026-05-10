# Tier 1 — Canonical Completeness

> **Goal**: Every completed or skipped stop writes `outcome`, `reason_code`, `washed_can`, and a `core.evidence` row. Visit lifecycle opens at stop-start, not photo upload.
>
> **Status**: 🟠 In review — online path verified; offline path pending
> **Depends on**: Nothing (unblocked)
> **Blocks**: Tier 2, Tier 5

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/src/domains/visit/visitService.ts` | Add `outcome` + `reason_code` params to `closeVisitForRouteRunStop`; fix visit creation to be a no-op if already created on stop-start |
| `backend/src/domains/routeRunStop/cleanLogService.ts` | Write `outcome='completed'` on visit close; fix safety cast; move observation emit inside transaction; add `washed_can` to the `uiPayload` passed to `emitObservationsForStop` |
| `backend/src/modules/work/routeRunStopRoutes.ts` | Write `outcome='skipped'` + `reason_code` on skip path; fix two-transaction problem on complete |
| `backend/src/domains/observation/observationService.ts` | Add `washed_can` observation branch; add `washed_can?: boolean` to the `StopUiPayload` type; rename `pool: any` to `pool: PoolClient` in `emitSpotCheckObservation` |
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

Extend the existing signature to accept `outcome` and `reasonCode`:

```typescript
closeVisitForRouteRunStop(
  client: PoolClient,
  params: { routeRunStopId: number; outcome: string; reasonCode?: string; endedAt?: Date }
): Promise<number | null>
```

SQL inside function (preserves existing `client_visit_id` join — `core.visits` has no `route_run_stop_id` column; visits are linked to stops via `client_visit_id`, a UUIDv5 derived from the route_run_stop_id by `deriveClientVisitId()`):
```sql
UPDATE core.visits
SET ended_at   = COALESCE(ended_at, COALESCE($2, NOW())),
    outcome    = COALESCE(outcome, $3),
    reason_code = COALESCE(reason_code, $4)
WHERE client_visit_id = $1
  AND ended_at IS NULL
RETURNING id
```

Parameter binding inside the function:
```typescript
const visitClientId = deriveClientVisitId(params.routeRunStopId);
await client.query(sql, [visitClientId, params.endedAt ?? null, params.outcome, params.reasonCode ?? null]);
```

`cleanLogService.ts` calls:
```typescript
await closeVisitForRouteRunStop(client, { routeRunStopId, outcome: 'completed' })
```

`routeRunStopRoutes.ts` skip handler calls:
```typescript
await closeVisitForRouteRunStop(client, { routeRunStopId, outcome: 'skipped', reasonCode: hazardType })
```

### Done criteria
- `SELECT outcome, reason_code FROM core.visits WHERE client_visit_id = deriveClientVisitId(:routeRunStopId)` returns non-null `outcome` for completed and skipped stops.
- Existing `clean_logs` write is untouched — both writes occur.

---

## Change 2 — Add `washed_can` Observation

### What and why

`washed_can` is a boolean field captured at stop completion but never written to `core.observations`. Only `clean_logs` records it. Intelligence cannot derive a canonical "can was washed" signal from `core.observations`.

The fix has **three** parts — all required for the value to reach the observation branch at all:

1. Add `washed_can?: boolean` to the `StopUiPayload` type in `observationService.ts`
2. Add a `washed_can` branch to `submitObservations()` in `observationService.ts`
3. Propagate `washed_can` from the route-handler request body into the `uiPayload` built in `cleanLogService.ts` (currently only `washed_shelter` and `washed_pad` are propagated; `washed_can` is silently dropped)

### Files touched
- `observationService.ts` (type + branch)
- `cleanLogService.ts` (uiPayload mapping)

### Before

`StopUiPayload` declares `picked_up_litter`, `emptied_trash`, `washed_shelter`, `washed_pad` — no `washed_can`.

`submitObservations()` maps `picked_up_litter`, `emptied_trash`, `washed_shelter`, `washed_pad`, `trash_volume`, safety, and infra to observation pairs. `washed_can` is absent.

`cleanLogService.completeStop` builds `uiPayload` from `data.picked_up_litter`, `data.emptied_trash`, `data.washed_shelter`, `data.washed_pad`, `data.trashVolume`, etc. — `data.washed_can` is not mapped in.

### After — Part 1: extend the type

In `observationService.ts`:
```typescript
export type StopUiPayload = {
    // ... existing fields ...
    picked_up_litter?: boolean;
    emptied_trash?: boolean;
    washed_shelter?: boolean;
    washed_pad?: boolean;
    washed_can?: boolean;   // NEW
    // ... rest unchanged ...
};
```

### After — Part 2: add the branch

In `submitObservations()` — push a single observation matching the `ObservationInsert` shape used by the existing branches (`{ observation_type, payload }`). Note that `core.observations` has **no** `observed_value` column; the value lives in `payload jsonb`:

```typescript
if (typeof ui.washed_can === 'boolean') {
  obs.push({
    observation_type: 'washed_can',
    payload: { value: ui.washed_can }
  });
}
```

The existing `insertObservations()` helper already supplies `org_id`, `visit_id`, `location_id`, `asset_id`, and `created_by_oid` from the surrounding context — no change needed there.

### After — Part 3: propagate in `cleanLogService.ts`

Where the `uiPayload` is constructed before the `emitObservationsForStop` call, add the field:

```typescript
const uiPayload: StopUiPayload = {
    picked_up_litter: data.picked_up_litter,
    emptied_trash:    data.emptied_trash,
    washed_shelter:   data.washed_shelter,
    washed_pad:       data.washed_pad,
    washed_can:       data.washed_can,   // NEW
    trash_volume:     data.trashVolume as any,
    // ... rest unchanged ...
};
```

### Done criteria
- After completing a stop with `washed_can: true`, `SELECT observation_type, payload FROM core.observations WHERE observation_type = 'washed_can' AND visit_id = :visitId` returns one row with `payload = {"value": true}`.
- Existing `clean_logs.washed_can` write is untouched.
- `StopUiPayload.washed_can` is typed as `boolean | undefined` and is no longer dropped on the path from the route handler to the observation emitter.

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
3. **Add** write to `core.evidence` for each photo. Note the schema realities: `core.evidence.org_id` is `NOT NULL` (no default), and `core.visits` has **no** `route_run_stop_id` column — the stop link is via `client_visit_id` (UUIDv5 derived by `deriveClientVisitId(routeRunStopId)`):

```sql
INSERT INTO core.evidence
  (org_id, visit_id, observation_id, kind, storage_key, captured_by_oid)
SELECT
  v.org_id,
  v.id,
  NULL,
  $1,  -- kind ('completion' | 'safety' etc.)
  $2,  -- storage_key (the S3/blob path)
  $3   -- captured_by_oid (from auth context — currently the OID stub)
FROM core.visits v
WHERE v.client_visit_id = $4   -- bind: deriveClientVisitId(routeRunStopId)
LIMIT 1
```

`core.evidence` has no unique constraint covering `(visit_id, storage_key)`, so an `ON CONFLICT` clause is not applicable. Idempotency on retry must be handled by the caller (e.g. by checking storage_key before insert) or accepted as duplicate-tolerant.

If no visit row exists for the stop yet (edge case: photo uploaded before stop-start replay in offline scenario), the INSERT writes 0 rows. Log a warning and continue — do not fail the photo upload.

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
- After calling `START_STOP`, `SELECT * FROM core.visits WHERE client_visit_id = deriveClientVisitId(:routeRunStopId)` returns one row with `started_at` set.
- Photo upload for the same stop does NOT create a second visit row (`ensureVisitForRouteRunStop` is idempotent on `client_visit_id`, but the photo path should not call it at all post-fix).
- Offline replay of `START_STOP` followed by `COMPLETE_STOP` produces exactly one visit row.

### Implementation note
`ensureVisitForRouteRunStop` was already called inside `startRouteRunStopInternal` before Tier 1 work began — the start-stop path was already correct. The only change required was removing the call from `stopPhotosService.createStopPhotos`. No new call was added to the start-stop route handler.

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

- [x] `core.visits` row exists with `started_at` set at stop-start time (not photo upload time) — confirmed: visit created inside `startRouteRunStopInternal`, which already called `ensureVisitForRouteRunStop` before Tier 1; photo upload path no longer calls it
- [x] `core.visits.ended_at` is non-null for completed and skipped stops — verified live: stop 9 ended_at `2026-05-10 07:53:42`, stop 10 ended_at `2026-05-10 07:54:00`
- [x] `core.visits.outcome = 'completed'` for completed stops — verified live: stop 9 outcome = `completed`
- [x] `core.visits.outcome = 'skipped'` + `reason_code` populated for skipped stops — verified live: stop 10 outcome = `skipped`, reason_code = `violence`
- [x] `core.observations` has a `washed_can` row for stops where `washed_can` was set — verified live: `observation_type = 'washed_can'`, `payload = {"value": true}`
- [x] `core.evidence` has one row per photo for the stop's visit — verified live: 1 evidence row for 1 photo on visit 9
- [x] `stop_photos` still receives rows (no regression) — verified live: stop_photos id=9 present
- [x] `clean_logs` still receives rows (no regression) — verified live: clean_logs id=6, `washed_can = true`
- [x] Complete-stop operation is a single atomic transaction — route handler now owns single `BEGIN … COMMIT`; `cleanLogService.completeStop` accepts `PoolClient` from caller
- [x] TypeScript compiles without `any` cast in `cleanLogService.ts` — `tsc --noEmit` passes clean; `(data as any).safety` removed
- [ ] Offline replay (`START_STOP` → `UPLOAD_STOP_PHOTOS` → `COMPLETE_STOP`) produces correct canonical rows — structural guarantee holds; dedicated integration test deferred to Tier 6
- [x] Changelog entry written to `docs/changelog/2026-05-10-tier-1-canonical-completeness.md` listing all files touched and DB state verified

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
