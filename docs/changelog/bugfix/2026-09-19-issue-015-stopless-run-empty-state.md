# 2026-09-19 — ISSUE-015: stopless route run renders honestly (200 + empty list, not a false 404)

## Founder ruling (Option A, 2026-09-19)
A route run with zero stops is a **legitimate state**, not orphan data. Render
it honestly: the detail loads with `stops: []` and the Dispatch UI shows an
empty state pointing at the ISSUE-050 Add-stop control (an empty run is now an
actionable starting point, not a dead end). **No write-time ≥1 constraint** —
route creation already enforces the OSRM ≥2 floor, so stopless runs cannot
recur through any normal path; a cross-table trigger would buy nothing.

Related ruling recorded the same day: standing shared "shift ad-hoc" empty
routes were considered and rejected — one run has one assignee, and a worker
sees every stop on their run, so per-worker visibility inside a shared run
does not exist. The shift ad-hoc workflow is one small personal ad-hoc run per
worker (SEAM-D picker + shift_type + ISSUE-050 add-stop). The one gap became
its own card: **AD-HOC-1-STOP** (lower the ad-hoc creation floor to 1 stop).

## What changed
- `loadRouteRunById.ts`: `JOIN route_run_stops` / `JOIN stops` → **LEFT JOIN**;
  the stopless run's NULL placeholder row is filtered from the `stops` mapping
  and skipped in the client_visit_id bridge. Run-level fields intact.
- `LeadRouteDetail.tsx`: empty-state copy — on planned/in_progress runs:
  "No stops on this route yet — use Add stop above to build it."; on terminal
  runs: "No stops on this route."
- New `tests/canonical/stoplessRouteRun.test.ts` (real endpoint in-process):
  stopless run → **200 + `stops: []`** with run fields intact; nonexistent run
  still 404s (the fix widened stopless, not nonexistent).

## Cleanup note
The card's May-era stopless rows (route_runs 1166–1170, org 1) **no longer
exist** — swept by an earlier canon rebuild. Verified 2026-09-19: the dev DB
has zero stopless runs; there was nothing to delete.

## Verification
Backend **232/232** (2 new); frontend **122/122**; `tsc --noEmit` clean both.

## Files touched
- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
- `backend/tests/canonical/stoplessRouteRun.test.ts` (new), `backend/tests/run.ts`
- `frontend/src/components/LeadRouteDetail.tsx`
- `docs/changelog/bugfix/2026-09-19-issue-015-stopless-run-empty-state.md` (this entry)
