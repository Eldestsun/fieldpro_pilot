# Backend Visit Creation — Current State Audit

> Analysis task — no code changes.  
> Last reviewed: 2026-04-04

---

## 1. What "visit" means in the canonical model

From `target_architecture.md`:

> A **Visit** represents contact with reality.  
> A **Visit** exists even when no cleaning occurs.  
> An **Observation** records what was *true*, not what someone *did*.  
> **Evidence** never floats without a visit anchor.

The schema that implements this: `core.visits`, `core.observations`, `core.evidence`.

---

## 2. The Call Chain Today

```
POST /api/route-run-stops/:id/complete          (routeRunStopRoutes.ts:196)
  └─ completeStop()                             (cleanLogService.ts:11)
       ├─ 1. BEGIN transaction
       ├─ 2. SELECT route_run_stop FOR UPDATE   (lock row, check status≠done)
       ├─ 3. ensureVisitForRouteRunStop()       (visitService.ts:74)
       │       ├─ deriveClientVisitId(rrsId)    (deterministic UUID v5)
       │       ├─ SELECT core.visits WHERE client_visit_id (idempotency check)
       │       ├─ getVisitContext()             (resolves org_id, asset_id, location_id)
       │       └─ INSERT core.visits … ON CONFLICT DO NOTHING
       ├─ 4. INSERT public.clean_logs          (workflow artifact, visit_id FK)
       ├─ 5. createInfrastructureIssues()      (if any)
       ├─ 6. INSERT trash_volume_logs          (if trashVolume present)
       ├─ 7. UPDATE route_run_stops → done
       ├─ 8. closeVisitForRouteRunStop()       (UPDATE core.visits SET ended_at=NOW())
       ├─ 9. COMMIT
       └─ 10. emitObservationsForStop("submit") (POST-COMMIT, own connection)
                └─ INSERT core.observations × N  (one row per state fact)

POST /api/route-run-stops/:id/skip-with-hazard  (routeRunStopRoutes.ts:51)
  └─ (inline, same pattern)
       ├─ ensureVisitForRouteRunStop()
       ├─ closeVisitForRouteRunStop()
       └─ emitObservationsForStop("submit", { skipForSafety, safetyHazards })
```

There is also a **spot-check path** inside `completeStop` (when `spotCheck=true`) that calls
`emitSpotCheckObservation()` pre-commit, inside the same transaction.

---

## 3. Schema Snapshot

### `core.visits` (the canonical visit record)

| Column | Notes |
|---|---|
| `id` | PK |
| `org_id` | ✅ present |
| `location_id` | ✅ resolved via `core.v_locations_transit` |
| `primary_asset_id` | ✅ resolved from `route_run_stops.asset_id` |
| `assignment_id` | **schema column exists, but code never writes it** |
| `actor_oid` | ✅ written from `req.user.oid` |
| `started_at` | ✅ set on insert to `NOW()` |
| `ended_at` | ✅ set on `closeVisitForRouteRunStop` |
| `visit_type` | ✅ hardcoded `"service"` |
| `outcome` | written as `null` always — never set to a meaningful value |
| `reason_code` | always `null` — skip reason not stored here |
| `notes` | always `null` |
| `client_visit_id` | ✅ deterministic UUIDv5 from `routeRunStopId` — idempotency key |
| `meta` | always `{}` — unused |

### `core.observations` (the canonical state layer)

| Column | Notes |
|---|---|
| `visit_id` | ✅ FK to `core.visits` — properly bound |
| `org_id` | ✅ |
| `location_id` | ✅ |
| `asset_id` | ✅ |
| `observation_type` | ✅ e.g. `ground_condition`, `trash_can_condition`, `encampment_present` |
| `payload` | ✅ e.g. `{ state: "clean" }`, `{ level: 2 }` |
| `created_by_oid` | ✅ |
| `severity` | always `null` — never written |
| `status` | always `null` — never written |

### `public.clean_logs` (legacy transit workflow artifact)

| Column | Notes |
|---|---|
| `visit_id` | ✅ FK to `core.visits` — wired up |
| `route_run_stop_id` | transit-specific back-reference |
| `stop_id` | raw transit stop text key |
| `user_id` | **integer `123`, hardcoded** — not OID-based |
| `duration_minutes` | computed authoritatively from `started_at` → `NOW()` |
| `picked_up_litter / emptied_trash / …` | boolean action flags — transit vertical semantics |
| `photo_keys text[]` | legacy photo refs — evidence is not in `core.evidence` |
| `washed_can` | received and stored, but **not emitted as an observation** |

---

## 4. What Matches the Canonical Model

| Aspect | Status |
|---|---|
| `core.visits` table is the event record | ✅ Matches. The table exists and is populated on every stop completion. |
| Visit is idempotent (safe to call twice) | ✅ Matches. `client_visit_id` UUIDv5 + `ON CONFLICT DO NOTHING` + pre-check. |
| Visit carries `org_id`, `location_id`, `primary_asset_id` | ✅ Matches. All three are resolved before insert via `getVisitContext`. |
| Visit has `actor_oid` (not a surveillance metric) | ✅ Matches. OID is the identity proof, not a performance tag. |
| Visit has `started_at` / `ended_at` time bounds | ✅ Matches. Open at ensure-time, closed at complete-time. |
| Observations are anchored to `visit_id` | ✅ Matches. Every `core.observations` row FKs to `core.visits`. |
| Observations record *state truth* (`state: "clean"`) not actions | ✅ Largely matches. `ground_condition { state: "clean" }` etc. are state facts. |
| Evidence (`stop_photos`) has `visit_id` FK | ✅ DB FK exists; `createStopPhotos` calls `ensureVisitForRouteRunStop` and writes `visit_id` on every photo upload. |
| Skip path also generates a visit | ✅ Matches. `skip-with-hazard` calls `ensureVisitForRouteRunStop` before commit. |

---

## 5. What Does NOT Match the Canonical Model

### 5.1 `assignment_id` is never written
**Schema**: `core.visits.assignment_id bigint`  
**Code**: The column exists but `ensureVisitForRouteRunStop` never resolves or writes it.  
**Gap**: The visit is not linked to the planned assignment (`core.assignments`), so the model cannot answer *"what was planned vs. what actually happened."*

### 5.2 `outcome` and `reason_code` are never written
The `completeStop` completes a stop and closes a visit, but `outcome` defaults `null` always.  
Skip visits have a clear outcome (`skipped_for_safety`) that belongs in `reason_code`, but it is never stored in `core.visits`.  
**Gap**: The visit record itself carries no outcome — only `clean_logs` (legacy) does.

### 5.3 `washed_can` is not emitted as an observation
`completeStop` receives `washed_can`, stores it in `clean_logs`, but `submitObservations()` in `observationService.ts` has no branch for it.  
**Gap**: The canonical observation layer is incomplete for this action — it exists only in the legacy table.

### 5.4 `clean_logs` carries workflow-level action semantics, not state truth
`clean_logs` stores boolean flags like `picked_up_litter = true`. This records *what someone did*, not *what was true*.  
Per the canonical invariant: **"An Observation records what was true, not what someone did."**  
The `core.observations` pairs (`dirty` → `clean`) are the correct canonical layer. `clean_logs` is the legacy transit vertical artifact. The two coexist but serve different roles.

### 5.5 `user_id = 123` is hardcoded in `clean_logs`
```ts
const user_id = 123; // DEV ONLY
```
The legacy `clean_logs.user_id` is a hardcoded integer. Identity in the canonical model is handled by `actor_oid` on `core.visits`, but the two are not linked. The legacy table's user attribution is broken in production beyond the dev pilot.

### 5.6 Photos are not registered in `core.evidence`
`stop_photos` has a `visit_id` FK but is a transit-vertical table in `public.*`.  
`core.evidence` exists (`core.evidence` table with `visit_id`, `kind`, `storage_key`) but no code writes to it.  
**Gap**: Evidence floats without going through the canonical evidence layer — it only lives in the transit-specific `stop_photos` table.

### 5.7 Observations are emitted post-commit on a separate connection
```ts
await client.query("COMMIT");
// ...
await emitObservationsForStop(...)  // opens its own pool.connect()
```
If the post-commit observation emission fails, the visit is closed but carries no observations. There is no retry or transactional guarantee.  
**Gap**: Observations are not atomically bound to the visit close event.

### 5.8 Spot-check observation is emitted *inside* the transaction
```ts
// pre-commit
await emitSpotCheckObservation({ pool: client, visitId, ... });
```
The spot-check call uses the transaction client directly, unlike all other observation emits. This is inconsistent, and `emitSpotCheckObservation` calls `pool.query(...)` using the argument named `pool` — which is actually the `PoolClient`. This is a naming hazard that works by coincidence (`PoolClient` also has `.query()`).

### 5.9 Photo upload pre-creates a visit before stop completion
`createStopPhotos()` (called by `POST /route-runs/:runId/stops/:stopId/photos`) calls `ensureVisitForRouteRunStop` as part of photo registration — before the stop is marked `done` and before completion validation runs.

```ts
// stopPhotosService.ts:39
const visitId = await ensureVisitForRouteRunStop(client, {
    routeRunStopId: Number(routeRunStopId),
    actorOid: userOid,
    visitType: "service",
});
```

**Consequences:**
- A `core.visits` row with `ended_at = NULL` (open visit) is created at photo-upload time, not at stop-start or stop-complete time.
- If the stop is subsequently abandoned, the visit row is never closed (`ended_at` remains null permanently).
- `visit_type` is hardcoded `"service"` here, even before the outcome is known.
- The visit `started_at` is set at photo-upload time, not when the UL actually arrived at the stop — making `started_at` unreliable as a true arrival timestamp.

**Gap**: Visit creation is not tied to a single authoritative lifecycle event. It can happen at photo upload, at stop start implicit (none), or at `completeStop`. The canonical model implies a visit opens when contact with reality begins, not when a photo happens to be uploaded.

---

## 6. Summary Table

| Canonical Invariant | Current State |
|---|---|
| Visit is first-class event | ✅ `core.visits` row created on every stop completion |
| Visit is idempotent | ✅ UUIDv5 `client_visit_id` + `ON CONFLICT DO NOTHING` |
| Visit anchors evidence | ⚠️ `stop_photos.visit_id` FK is written by `createStopPhotos`; `core.evidence` is never written |
| Observation records state truth | ✅ Largely — `{ state: "clean" }`, hazards, infra types |
| Observation is always visit-bound | ✅ FK enforced by DB |
| `washed_can` captured as observation | ❌ Missing — only in `clean_logs` |
| Visit outcome recorded | ❌ `outcome` / `reason_code` always null |
| Assignment linked to visit | ❌ `assignment_id` column unused |
| Observations are atomic with visit close | ❌ Post-commit, separate connection, no retry |
| Worker identity via OID | ✅ `actor_oid` on `core.visits`; ❌ `user_id=123` on `clean_logs` |
| Visit opened at correct lifecycle moment | ❌ Photo upload pre-creates open visits; `started_at` reflects upload time, not arrival |
