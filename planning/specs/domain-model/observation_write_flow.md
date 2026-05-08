# Observation Write Flow: App Surface → DB

## Problem

Unclear what observation structure is actually written to `core.observations` from the UL app surface, and how the frontend UI payload maps to canonical DB rows.

## Current State

The observation write path is split across three layers:

1. **Frontend** assembles a `CompleteStopPayload` and POSTs it to the backend
2. **Backend route handler** passes raw body fields into `completeStop()`
3. **`cleanLogService.ts`** remaps those into a `StopUiPayload` and calls `emitObservationsForStop()`
4. **`observationService.ts`** inserts individual rows into `core.observations`

---

## Full Flow

```
UI Wizard (checklist, safety, infra steps)
    ↓
CompleteStopPayload  (frontend/src/api/routeRuns.ts:154)
    ↓  POST /api/route-run-stops/:id/complete
routeRunStopRoutes.ts  (backend handler)
    ↓  calls completeStop()
cleanLogService.ts  (assembles StopUiPayload)
    ↓  calls emitObservationsForStop()
observationService.ts
    ↓  INSERTs rows into core.observations
```

**Offline path:** The payload is serialized into IndexedDB via `stopDraftStore.ts` (`StopDraft`) and replayed through `offlineQueue.ts` → `OfflineSyncManager.tsx` when connectivity is restored.

---

## What the Frontend Sends (`CompleteStopPayload`)

> `frontend/src/api/routeRuns.ts:154`

```ts
interface CompleteStopPayload {
    duration_minutes?:  number;
    picked_up_litter:   boolean;
    emptied_trash:      boolean;
    washed_shelter:     boolean;
    washed_pad:         boolean;
    washed_can:         boolean;
    photo_keys:         string[];           // legacy photo refs
    infraIssues?:       InfraIssuePayload[];
    safety?:            SafetyPayload;      // { hazard_types[], severity?, notes?, safety_photo_key? }
    trashVolume?:       number;             // 0–4
    spotCheck?:         boolean;
}
```

---

## Backend Intermediate Type (`StopUiPayload`)

> `backend/src/domains/observation/observationService.ts:5`

Assembled in `cleanLogService.ts` before being passed to `emitObservationsForStop()`:

```ts
type StopUiPayload = {
    safetyConcern?:         boolean;
    safetyHazards?:         string[];   // "encampment" | "fire" | "active_drug_use" | ...
    skipForSafety?:         boolean;
    picked_up_litter?:      boolean;
    emptied_trash?:         boolean;
    washed_shelter?:        boolean;
    washed_pad?:            boolean;
    trash_volume?:          0 | 1 | 2 | 3 | 4;
    infrastructurePresent?: boolean;
    infrastructureIssues?:  string[];   // "glass_damage" | "graffiti" | ...
}
```

---

## What Gets Written to `core.observations`

> `backend/src/domains/observation/observationService.ts:234`

Each `emitObservationsForStop()` call inserts **N rows**, one per discrete observation:

| Column | Source |
|---|---|
| `org_id` | visit context |
| `visit_id` | ensured/created for stop |
| `location_id` | visit context |
| `asset_id` | visit context |
| `observation_type` | mapped string (see tables below) |
| `payload` | `{}` or `{ state: "..." }` or `{ level: N }` |
| `created_by_oid` | `req.user.oid` |

### Arrival Phase (hardcoded, always fires on stop start)

| `observation_type` | `payload` |
|---|---|
| `ground_condition` | `{ state: "dirty" }` |
| `trash_can_condition` | `{ state: "has_trash" }` |
| `shelter_condition` | `{ state: "dirty" }` |
| `pad_condition` | `{ state: "dirty" }` |

### Submit Phase (complete stop) — conditional on checklist

| Trigger | `observation_type` | `payload` |
|---|---|---|
| `picked_up_litter` | `ground_condition` ×2 | `{ state: "dirty" }` then `{ state: "clean" }` |
| `emptied_trash` | `trash_can_condition` ×2 | `{ state: "has_trash" }` then `{ state: "empty" }` |
| `washed_shelter` | `shelter_condition` ×2 | `{ state: "dirty" }` then `{ state: "clean" }` |
| `washed_pad` | `pad_condition` ×2 | `{ state: "dirty" }` then `{ state: "clean" }` |
| `trashVolume` set | `trash_volume` | `{ level: 0–4 }` |
| `safetyConcern: true` | `safety_concern_present` | `{}` |
| each `safetyHazard` | mapped `*_present` (see below) | `{}` |
| `skipForSafety: true` | `stop_not_serviced_due_to_safety` | `{}` |
| `infrastructurePresent` | `infrastructure_issue_present` | `{}` |
| each `infraIssue` | mapped `*_present` (see below) | `{}` |

### Spot Check Path (when `spotCheck: true`)

| `observation_type` | `payload` |
|---|---|
| `spot_check` | `{}` |

---

## Key Mappings

### Safety hazard keys → observation_type

| Frontend key | Normalized | `observation_type` |
|---|---|---|
| `encampment` | `encampment` | `encampment_present` |
| `fire` | `fire` | `fire_present` |
| `dangerous_activity` | `dangerous_activity` | `dangerous_activity_present` |
| `active_drug_use` | `drug_use` | `drug_use_present` |
| `drug_use` | `drug_use` | `drug_use_present` |
| `violence` | `violence` | `violence_present` |
| `biohazard` | `biohazard` | `biohazard_present` |
| `traffic` | `access_blocked` | `access_blocked` |
| `access_blocked` | `access_blocked` | `access_blocked` |
| `other` | `other` | `other_safety_concern_present` |

### Infra issue keys → observation_type

| Frontend key | Normalized | `observation_type` |
|---|---|---|
| `glass_damage` / `glass_broken` | `glass_damage` | `glass_damage_present` |
| `graffiti` / `graffiti_excessive` | `graffiti` | `graffiti_present` |
| `receptacle_damage` / `receptacle_damaged` | `receptacle_damage` | `receptacle_damage_present` |
| `shelter_panel_damage` / `panel_damaged` | `shelter_panel_damage` | `shelter_panel_damage_present` |
| `lighting_failure` / `lighting_out` | `lighting_failure` | `lighting_failure_present` |
| `landscape_obstruction` / `landscaping_blocking` | `landscape_obstruction` | `access_obstructed_by_landscape` |
| `structural_damage` / `structure_damaged` | `structural_damage` | `structural_damage_present` |
| `other` / `other_infra_issue` | `other` | `other_infrastructure_issue_present` |

---

## Gaps and Quirks

### `washed_can` is lost
`washed_can` is accepted by the route handler and written to `clean_logs`, but is **not mapped into `StopUiPayload`** and produces no `core.observations` row.

### Arrival observations are always pessimistic
Arrival phase hardcodes `dirty`/`has_trash` states for all condition types, regardless of actual stop context or whether it's a spot check visit. This creates spurious dirty observations for locations that were already clean.

### Safety observations have a type-unsafe access path
In `cleanLogService.ts`, safety data is accessed via `(data as any).safety?.hazard_types` because the `completeStop()` function signature did not originally include `safety`. It has since been added to the type, but the cast remains and masks the interface.

### `trash_volume` is written twice
When `trashVolume` is set on completion, it is written to:
1. `trash_volume_logs` table (structured volume record)
2. `core.observations` (as `observation_type: "trash_volume"` with `payload: { level: N }`)

These are parallel writes with no cross-reference.

### Skip-with-hazard path is separate
Skipped stops go through `skip-with-hazard` endpoint (`routeRunStopRoutes.ts:51`), which constructs its own `StopUiPayload` inline and calls `emitObservationsForStop()` directly — bypassing `cleanLogService.ts` entirely.

---

## Desired State

- `washed_can` should produce a `wash_can_condition` paired observation
- Arrival observations should be gated or parameterized (not always hardcoded dirty)
- Safety access in `cleanLogService.ts` should use the typed field, not `(data as any)`
- `trash_volume` dual-write should be documented as intentional or collapsed
- The skip path and complete path should share a single observation assembly function

## Proposed Change

Tracked separately. This spec is diagnosis only.
