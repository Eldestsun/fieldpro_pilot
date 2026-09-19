# ISSUE-050 — Add a stop to a live route run

**Status:** founder-ruled 2026-09-18, dispatched same day.
**Card:** ISSUE-050 (BASELINE Work Tracker). **Branch:** `feat/issue-050-add-stop-to-live-run`.

## Founder rulings (the three design-gate decisions)

1. **Placement: Option A — append to the pending tail.** New stop gets
   `sequence = MAX+1` and one new OSRM leg from the current last stop. No
   re-sequencing of the worker's remaining plan mid-shift. Option B
   (re-optimize the pending tail) is a possible follow-up and would first
   require a `(route_run_id, sequence)` uniqueness constraint.
2. **Who: Dispatch/Admin only**, from the route detail view (the reassign
   surface). The field-worker adds-own-stop flow is deliberately not built.
3. **`origin_type`: v1 writes only `'emergency'`.** `'ul_ad_hoc'` is RESERVED
   for the future worker-initiated flow — the endpoint rejects it so the
   origin column never lies (contamination principle: `planned` = route
   creation, `emergency` = dispatch injection, `ul_ad_hoc` = worker-initiated,
   never written until that flow exists). Control Center already reads
   `origin_type = 'emergency'` (`has_emergency_additions`, unplanned-stop
   counts) — this endpoint is the missing writer for a signal the readers
   anticipated.

## Behavior

- `POST /api/route-runs/:id/stops` — `requireAuth` + `requireAnyRole(["Dispatch","Admin"])`,
  org fail-closed (`resolveNumericOrgId` → `withOrgContext`), audited
  (`route.stop.add`; detail carries stop_id + origin_type, never worker OIDs).
- Body `{ stop_id, origin_type? }`; `origin_type` defaults to `'emergency'`
  and must equal it (400 otherwise, with the reserved-value explanation).
- Guards: 404 unknown run; **409** run `finished`/`completed`; **409** stop
  already on the run; **400** unknown/inactive/coordinate-less/asset-less stop.
- Immutability invariant: done/skipped/in_progress stops are untouched — the
  only mutation is one new `pending` row at the tail plus run-total bumps.
- Service `addStopToRouteRun` (routeRunService.ts), one transaction:
  1. `SELECT … FOR UPDATE` on the run row (serializes concurrent adds — the
     MAX+1 sequence and totals bump race otherwise).
  2. Resolve the new stop's coords + `asset_id` from `public.stops`
     (route_run_stops.asset_id is NOT NULL — the card's flagged non-boilerplate piece).
  3. Leg cost `costCache.getCost(prevTailStop | base, newStop)` → planned_distance/duration.
     OSRM failure → visible 502, nothing written.
  4. INSERT `route_run_stops` row: `sequence = COALESCE(MAX+1, 0)`,
     `status='pending'`, `origin_type='emergency'`, org via subselect.
  5. `route_runs` totals `+=` the new leg.
  6. **Q-C linkage:** one `core.assignments` row for the stop (same
     stops/assets/v_locations_transit resolution as `createRouteRun`),
     validated to exactly 1 row (throw → rollback otherwise), plus the
     encrypted `core.assignment_actor_audit` sidecar (`actor_ref='encrypted'`).

## Frontend

- `LeadRouteDetail.tsx`: "Add stop" section on non-terminal runs — search
  (`getStopsScoped`, the existing ops read endpoint), result rows with Add,
  refetch on success. New stop renders at the list tail with an `emergency`
  badge (`origin_type` now surfaced by `loadRouteRunById`).
- Worker view needs no change: the appended stop arrives on the next route
  fetch, after the current tail — nothing the worker is doing is disturbed.

## Labor safety

Dispatch assistance tool, never a silent load-adder: the added stop is visibly
badged on both the dispatch detail and (as a normal new stop) the worker list.
Audit detail carries no worker identity (matches the reassign handler's
posture). No new identity surfaces.

## Tests

`tests/canonical/addStopToLiveRun.test.ts`, driving the real endpoint
in-process (adhocRouteRuns pattern; fake OSRM; seed-owned picker stops §11 —
a third stop `SEAMD_ADHOC_C` added for injection): append lands with correct
sequence/origin/asset/totals + Q-C assignment + encrypted sidecar; duplicate
409; terminal-run 409; unknown stop 400; `ul_ad_hoc` 400 (reserved); non-Dispatch 403.

## Schema

No migration — `origin_type` CHECK already permits `emergency`; `status`
defaults `pending`; totals are plain columns. (Verified live 2026-09-18.)
