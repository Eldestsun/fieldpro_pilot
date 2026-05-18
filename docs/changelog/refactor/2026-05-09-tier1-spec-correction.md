# 2026-05-09 — Tier 1 Spec Corrections

## What changed
Three schema corrections applied throughout `planning/TIER_1_CANONICAL_COMPLETENESS.md`:

### 1. `core.observations` has no `observed_value` column
Change 2's proposed snippet wrote to `observed_value` and `observed_at` —
neither column exists on `core.observations`. Observation values live in
`payload jsonb`. Snippet rewritten to match the actual `ObservationInsert`
shape used by the existing `submitObservations()` branches:
`obs.push({ observation_type: 'washed_can', payload: { value: ui.washed_can } })`.
Done criterion updated to assert against `payload = {"value": true}`,
not `observed_value = 'true'`.

### 2. `core.visits` has no `route_run_stop_id` column
The visit-to-stop link is via `client_visit_id` — a UUIDv5 derived from
the route_run_stop_id by `deriveClientVisitId()` in `visitService.ts`.
Updated SQL and done criteria in:
- **Change 1** — `closeVisitForRouteRunStop` UPDATE: now uses
  `WHERE client_visit_id = $1`, preserves the existing function's join
  pattern, and adds idempotent `COALESCE` writes for `outcome` /
  `reason_code`. Function signature updated to extend the existing
  `(client, params)` shape rather than invent a new positional one.
- **Change 1 done criterion** — query updated from
  `WHERE route_run_stop_id = :id` to
  `WHERE client_visit_id = deriveClientVisitId(:routeRunStopId)`.
- **Change 3** — `core.evidence` INSERT now joins
  `core.visits.client_visit_id` (not `route_run_stop_id`); also adds the
  `org_id` column to the insert list since `core.evidence.org_id` is
  `NOT NULL` with no default and was previously missing. Removed
  `ON CONFLICT DO NOTHING` because no relevant unique constraint exists.
- **Change 4 done criterion** — query updated from
  `WHERE route_run_stop_id = :id` to
  `WHERE client_visit_id = deriveClientVisitId(:routeRunStopId)`.

### 3. `washed_can` is missing in three places, not one
Change 2 previously only described adding the branch in
`observationService.submitObservations()`. The branch alone is insufficient —
the field is also missing from the `StopUiPayload` type definition AND
from the `uiPayload` mapping in `cleanLogService.completeStop`. Without
all three, the value never reaches the branch.

Change 2 rewritten to specify all three parts as required:
1. Add `washed_can?: boolean` to the `StopUiPayload` type
2. Add the branch in `submitObservations()`
3. Propagate `data.washed_can` into the `uiPayload` built in
   `cleanLogService.ts` (currently `washed_shelter` and `washed_pad`
   are propagated but `washed_can` is silently dropped).

The "Files to Touch" table updated to reflect the type change in
`observationService.ts` and the mapping change in `cleanLogService.ts`.

## Why
A diagnostic pass against the live DB and the actual TypeScript code
revealed the spec referenced columns and types that don't exist as
written. An agent following the original spec would have produced SQL
that errors at runtime (no `observed_value`, no `route_run_stop_id`,
missing required `org_id`), and a `washed_can` observation branch that
silently never fires. Correcting the spec now prevents wasted
implementation cycles.

## Files touched
- `planning/TIER_1_CANONICAL_COMPLETENESS.md`
- `docs/changelog/2026-05-09-tier1-spec-correction.md` (new)
