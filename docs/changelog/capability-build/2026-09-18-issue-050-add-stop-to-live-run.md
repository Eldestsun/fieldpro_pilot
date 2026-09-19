# 2026-09-18 — ISSUE-050: add a stop to a live route run

## Founder rulings (the card's three design-gate decisions, 2026-09-18)
1. **Append-only (Option A):** new stop lands at `sequence = MAX+1` with one
   new OSRM leg; the worker's remaining plan is never re-ordered mid-shift.
   Option B (re-optimize the pending tail) deferred; would first need a
   `(route_run_id, sequence)` uniqueness constraint.
2. **Dispatch/Admin only**, from the route detail view. The field-worker
   adds-own-stop flow is deliberately not built.
3. **`origin_type` writes only `'emergency'`.** `'ul_ad_hoc'` is reserved for
   the future worker-initiated flow and the endpoint rejects it — the origin
   column never lies (planned = creation, emergency = dispatch injection).
   Control Center already reads `origin_type='emergency'`
   (`has_emergency_additions`, unplanned counts) — this is the missing writer.

## What changed
- **Backend**
  - New `addStopToRouteRun` (`routeRunService.ts`): one transaction —
    run row `FOR UPDATE` (serializes concurrent adds), duplicate/terminal
    guards, stop coords + NOT-NULL `asset_id` resolution from `public.stops`,
    one leg via the shared cost cache (OSRM failure → visible 502, nothing
    written), stop INSERT at MAX+1 (`pending`/`emergency`, org subselect),
    run totals bump, **Q-C** `core.assignments` row for the injected stop
    (validated to exactly 1, throw → rollback) + encrypted
    `assignment_actor_audit` sidecar (`actor_ref='encrypted'`).
  - New endpoint `POST /api/route-runs/:id/stops` (`routeRunRoutes.ts`):
    Dispatch/Admin, org fail-closed, `route.stop.add` audit (detail = stop +
    origin only, no worker identity — assign-handler posture), `origin_type`
    must be `'emergency'` (400 otherwise), error mapping 400/404/409/502.
  - `loadRouteRunById`: `origin_type` now selected + returned per stop.
  - OpenAPI regenerated (52 paths).
- **Frontend**
  - `api/routeRuns.ts`: `addStopToRun()`; `Stop.origin_type` typed.
  - `LeadRouteDetail.tsx`: "Add stop (appends to end of route)" section on
    planned/in_progress runs — search via existing `getStopsScoped` ops read,
    result rows with Add, refetch on success; injected stops render an
    `emergency` badge in the stop table. Worker view needs no change — the
    stop appears at the tail on the next fetch, visibly, never silently.
- **Tests** (`tests/canonical/addStopToLiveRun.test.ts`, real endpoint
  in-process, fake OSRM, real DB): append lands at MAX+1 with
  emergency/pending/resolved-asset/leg>0; pre-existing sequences untouched;
  totals bumped by the leg; Q-C assignment + encrypted sidecar present;
  duplicate 409; terminal 409; unknown stop 400; `ul_ad_hoc` 400; Specialist
  403; rejected attempts write nothing.
  - Seed §11 gained `SEAMD_ADHOC_C` (same elevated-fixture pattern as A/B)
    and the `ensureFixtureSeed` probe now checks it, so stale dev DBs re-seed.
- **Spec:** `planning/specs/ISSUE-050-add-stop-to-live-route.md` (authored on
  dispatch per the governance wrapper).

## Schema
No migration — `origin_type` CHECK already permitted `emergency` (verified
live pre-build); totals are plain columns; `status` defaults `pending`.

## Verification
- Backend **230/230** (2 new); frontend **122/122**; `tsc --noEmit` clean
  both workspaces; OpenAPI regenerated.

## Files touched
- `backend/src/domains/routeRun/routeRunService.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
- `backend/tests/canonical/addStopToLiveRun.test.ts` (new)
- `backend/tests/fixtures/seed.sql`, `backend/tests/run.ts`
- `backend/openapi/openapi.json` / `openapi.yaml`
- `frontend/src/api/routeRuns.ts`, `frontend/src/components/LeadRouteDetail.tsx`
- `planning/specs/ISSUE-050-add-stop-to-live-route.md` (new)
- `docs/changelog/capability-build/2026-09-18-issue-050-add-stop-to-live-run.md` (this entry)
