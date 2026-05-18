# 2026-05-10 — Tier 5: Assignment Layer

## What changed
- `createRouteRun()` in `routeRunService.ts` now inserts one `core.assignments` row per stop immediately after the `route_run_stops` bulk insert, within the same transaction. Each row carries `assignment_type = 'transit_stop_clean'`, `status = 'planned'`, `source_system = 'route_runs'`, and `source_ref = route_run_id` (text). Falls back to `'system'` placeholder for `created_by_oid` if Lead OID is unavailable, with a console warning.
- `ensureVisitForRouteRunStop()` in `visitService.ts` now looks up the `core.assignments` row for the stop's route run before the visit INSERT and writes the resolved `assignment_id` onto `core.visits`. Returns `null` safely for pre-Tier-5 routes (no regression).

## Why
- `core.assignments` had 0 rows and no backend writers; `core.visits.assignment_id` was always NULL
- The canonical model could not answer "was there a plan for this stop and did a visit happen" without joining through transit-vertical tables (`route_runs` → `route_run_stops` → `core.visits`)
- After this tier, the planned-vs-actual question is answerable from canonical tables alone

## Files touched
- `backend/src/domains/routeRun/routeRunService.ts` — assignment INSERT after stop loop
- `backend/src/domains/visit/visitService.ts` — assignment lookup + `assignment_id` on visit INSERT
