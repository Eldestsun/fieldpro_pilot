# R2 — Arrival Observations — Real Prior State

> **Goal**: Replace the hardcoded pessimistic dirty state in `arrivalObservations()` with a lookup of the most recent canonical observations for the stop, so workers arrive seeing the stop's last known condition.
>
> **Status**: 🟠 In Review — Path B implemented, unreachable until Tier 5 passes stopId from route handler
> **Depends on**: Tier 1 done ✅; Tier 5 (to wire stopId through the route handler and activate the lookup)
> **Blocks**: Nothing
>
> **What is done**: `arrivalObservations()` is async, queries `core.observations` via Path B (`transit_stop_assets` — 1 adapter hop). `clean_logs` bridge removed. `emitObservationsForStop()` accepts `stopId?: string`.
>
> **What is NOT done**: The route handler (`routeRunStopRoutes.ts`) does not pass `stopId` yet — that wire is part of Tier 5. Until then the `stopId` branch is never entered and the function falls back to dirty defaults. The done criterion ("prior completed visit shows clean, not dirty") cannot be verified end-to-end.
>
> **R2 goes to 🟢 Done as part of Tier 5**, when `routeRunStopRoutes.ts` passes `stopId` to `emitObservationsForStop`.

---

## Context

When a UL worker starts a stop, the backend calls `arrivalObservations()` to set the baseline state before the worker makes changes. This function hardcodes everything as dirty:

```typescript
function arrivalObservations(): ObservationInsert[] {
  return [
    { observation_type: "ground_condition", payload: { state: "dirty" } },
    { observation_type: "shelter_condition", payload: { state: "dirty" } },
    { observation_type: "pad_condition", payload: { state: "dirty" } }
  ]
}
```

This means every stop looks maximally dirty on arrival regardless of its actual condition history. The worker's baseline is always wrong. The observation delta (what changed during the visit) is meaningless.

The correct behavior: look up the most recent `core.observations` for each observation type at this stop. Use those as the arrival baseline. If no prior observation exists (new stop, first visit), fall back to dirty — that's the safe pessimistic default.

**Why Tier 1 must be done first:** The prior-state lookup reads from `core.observations`. Until Tier 1 populates that table reliably (transactional emit, washed_can, correct lifecycle), the prior-state lookup will return incomplete or stale data.

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/src/domains/observation/observationService.ts` | Make `arrivalObservations()` async, add `stopId` parameter, look up last known observation state from `core.observations` via the stop's visit history |

---

## Files to Leave Alone

| File | Reason |
|------|--------|
| All frontend files | No UI changes required — arrival state flows through existing API |
| `backend/src/modules/work/routeRunStopRoutes.ts` | Only the `observationService` call changes — route handler signature stays the same |
| All auth files | Frozen |
| All offline queue files | Frozen |

---

## Change 1 — Make `arrivalObservations` Look Up Prior State

### Before

```typescript
// Called at stop-start, returns hardcoded dirty observations
function arrivalObservations(): ObservationInsert[] {
  return [
    { observation_type: "ground_condition", payload: { state: "dirty" } },
    { observation_type: "shelter_condition", payload: { state: "dirty" } },
    { observation_type: "pad_condition", payload: { state: "dirty" } }
  ]
}
```

### After

```typescript
const ARRIVAL_OBSERVATION_TYPES = [
  'ground_condition',
  'shelter_condition',
  'pad_condition'
] as const

async function arrivalObservations(
  stopId: string,
  client: PoolClient
): Promise<ObservationInsert[]> {
  // Look up most recent observation for each type at this stop
  const result = await client.query(`
    SELECT DISTINCT ON (o.observation_type)
      o.observation_type,
      o.observed_value,
      o.payload
    FROM core.observations o
    JOIN core.visits v ON v.id = o.visit_id
    JOIN route_run_stops rrs ON rrs.id = v.route_run_stop_id
    WHERE rrs.stop_id = $1
      AND o.observation_type = ANY($2)
    ORDER BY o.observation_type, o.observed_at DESC
  `, [stopId, ARRIVAL_OBSERVATION_TYPES])

  const priorState = new Map(
    result.rows.map(r => [r.observation_type, r.payload])
  )

  // Use prior state where known; fall back to dirty if no history
  return ARRIVAL_OBSERVATION_TYPES.map(type => ({
    observation_type: type,
    payload: priorState.get(type) ?? { state: 'dirty' }
  }))
}
```

Update all callers of `arrivalObservations()` to pass `stopId` and `client`.

### Done criteria
- A stop with a prior completed visit showing `ground_condition: clean` produces an arrival observation of `clean`, not `dirty`
- A stop with no prior visits still produces `dirty` arrival observations (safe default)
- The arrival observation is written inside the same transaction as the visit open (Tier 1 Change 4 wired this)

---

## R2 Overall Done Definition

R2 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] `arrivalObservations()` accepts `stopId` and queries `core.observations` for prior state
- [ ] Stops with prior completed visits show correct arrival state (not always dirty)
- [ ] Stops with no prior visits default to dirty — no error
- [ ] All callers in `observationService.ts` pass `stopId`
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-r2-arrival-observations.md`

---

## Agent Launch Block

```
Refactor task. Read CLAUDE.md, then planning/REFINEMENT_R2_ARRIVAL_OBSERVATIONS.md.
In backend/src/domains/observation/observationService.ts, make arrivalObservations()
async, add stopId: string and client: PoolClient parameters, and query core.observations
for the most recent observation of each type at this stop.
Fall back to dirty if no prior observation exists.
Update all internal callers to pass the stopId and client.
Do not touch any other file.
The SQL join path is: core.observations → core.visits → route_run_stops (on stop_id).
```
