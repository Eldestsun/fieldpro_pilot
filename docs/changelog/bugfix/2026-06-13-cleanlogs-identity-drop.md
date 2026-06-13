# 2026-06-13 — Drop worker identity (user_id) from clean-logs endpoint responses

## What changed
- `GET /admin/clean-logs` and `GET /api/ops/clean-logs` previously ran `SELECT cl.*`
  on `public.clean_logs` and serialized the rows verbatim, leaking
  `clean_logs.user_id` (worker-attribution identity) into the response payload.
- Replaced `SELECT cl.*` with an explicit list of exactly the columns the consumer
  uses: `id, route_run_stop_id, stop_id, cleaned_at, picked_up_litter,
  emptied_trash, washed_shelter, washed_pad, washed_can` (plus the unchanged join
  columns `on_street_name, pool_id, run_date, route_pool_id`). The identity column
  `user_id` is omitted; unused columns (incl. per-stop `duration_minutes`) are no
  longer serialized.
- Added a named regression suite (`tests/canonical/cleanLogsIdentity.test.ts`,
  registered in `tests/run.ts`) that (a) statically asserts neither handler's
  main SELECT uses `cl.*` or names an identity column, and (b) runs the actual
  parsed SELECT list against a seeded `clean_logs` row containing a `user_id` and
  asserts the response shape carries no identity field while retaining every
  consumer-required column.

## Why
- Labor-safety hard constraint: worker-attribution identity must not be exposed on
  operational surfaces (PROJECT_CONTEXT.md §"Why Labor Safety Is Non-Negotiable",
  CLAUDE.md Labor Safety Guardrails). `user_id` was riding the payload only because
  the query used `SELECT cl.*`.
- The fix is the minimal diff: drop identity, no UI/shape change to any consumed
  field. `LeadCompletedRouteDetail` never read `user_id`, so the UI renders
  identically.

## Files touched
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/src/modules/ops/opsRoutes.ts`
- `backend/tests/canonical/cleanLogsIdentity.test.ts` (new)
- `backend/tests/run.ts`

## Out of scope (noted, not touched)
- `GET /ops/route-runs` and the admin route-runs list select `rr.user_id` (route
  owner) from `route_runs` — a separate endpoint and a separate question. Not
  altered here; flagged for follow-up.
