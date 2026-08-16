# 2026-08-15 — ISSUE-031/D5: clip per-stop completed_at from live route-detail payload

## What changed
- `loadRouteRunById.ts`: removed `rrs.completed_at` from the SELECT and
  `completed_at` from the per-stop payload rows, with a D4/D5 guardrail comment at
  both sites. Per-stop `status`, `planned_distance_m`/`planned_duration_s` (OSRM
  plan estimates, not worker timing), and run-level aggregates
  (`started_at`/`finished_at`/`total_duration_s`) are unchanged — the sanctioned
  live grain.
- `backend/tests/canonical/loadRouteRunById.test.ts`: added a D5 tripwire — deep-scans
  every stop row in the payload for forbidden per-stop timing keys (`completed_at`,
  `started_at`, `ended_at`, `duration_s`, `service_time_s`) so a reintroduction is a
  red test, not a code-review catch.

## Why
- D5 labor-safety surfacing guardrail
  (`planning/architecture/2026-06-11-issue-031-calibration-decisions.md` D4/D5, board
  card ISSUE-031/D5): the route-detail response carried both the sanctioned identity
  join (assignee name) and per-stop `completed_at` in one payload — on a
  single-assignee route the human eye joins name to per-stop timeline and
  re-identifies the worker with no offending query. Timing surfaces only at route
  aggregate (live) or asset aggregate (post-day).
- Capture is unchanged: `route_run_stops.completed_at` is still written on stop
  completion (`routeRunStopRoutes.ts`) and `core.visits.started_at/ended_at` still
  log; this governs surfacing grain, not capture.
- Verified dep-free before the clip: zero frontend references to per-stop
  `completed_at`; the only backend `completed_at` at the call sites is the write
  path; no OpenAPI annotation advertises the field.

## Files touched
- backend/src/domains/routeRun/loaders/loadRouteRunById.ts
- backend/tests/canonical/loadRouteRunById.test.ts
- docs/changelog/refactor/2026-08-15-issue-031-d5-per-stop-timing-clip.md (this file)
