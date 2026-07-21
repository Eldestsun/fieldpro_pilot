# 2026-07-12 — PATTERN-001: /route-runs/preview pool_id branch read RLS tables with no org context (spurious "Not enough stops")

## What changed
- Fixed the `pool_id` branch of `POST /api/route-runs/preview`
  (`routeRunRoutes.ts`, "Option B"). It called
  `getCandidateStopsForPoolWithRisk(pool_id, MAX_OSRM_STOPS, pool)` with the
  bare module `pool`. That helper's candidate query reads `public.stops`
  (a view over `transit_stops`) JOINed with `public.stop_pool_memberships` —
  both `FORCE ROW LEVEL SECURITY`. With no `app.current_org_id` on the
  connection, RLS fails closed to 0 rows, so a fully-authorized Dispatch/Admin
  request received `400 "Not enough stops found in pool '<id>'"` for a pool
  that actually has eligible stops.
- Scoped the read through
  `withOrgContext(await resolveNumericOrgId(req), (client) => getCandidateStopsForPoolWithRisk(pool_id, MAX_OSRM_STOPS, client))`,
  identical to the sibling `stop_ids` branch ("Option A") in the same handler
  and the `/routes/plan` call site. `resolveNumericOrgId` fails closed (403) on
  an indeterminate org — no default to org 1.
- Added regression test `previewPoolOrgContext.test.ts`: it drives the REAL
  endpoint in-process (routing to the OSRM-only stub) against a throwaway org-1
  pool it creates with two eligible stops, and asserts `200 / ok:true /
  total_stops === 2`. The seed fixture cannot exercise this path
  (`stop_pool_memberships` is unseeded and `TEST_POOL` has a single stop), so
  the test seeds and tears down its own pool/stops/memberships under org
  context on the suite pool (`asset_id` NULL — the ISSUE-024 asset-sync trigger
  is a no-op for NULL, so no elevated toggle is needed). A companion assertion
  pins the bug's mechanism: the same candidate read WITHOUT org context returns
  0 rows (fail-closed). Verified red-first — reverting the fix to the bare-pool
  line turns the test red (1 failed); green at the fix.

## Why
- PATTERN-001 (`docs/KNOWN_ISSUES.md`): a query against a `FORCE RLS` table on a
  connection with no `app.current_org_id` silently returns zero rows. Here that
  fail-closed read surfaced as a user-facing "not enough stops" error, blocking
  route-preview for any pool while masquerading as a data problem.
- The sibling create path (`POST /route-runs`) and the `stop_ids` preview
  branch already route through `withOrgContext`; this branch was the lone
  bare-`pool` reader left in the handler.

## Files touched
- `backend/src/modules/routes/routeRunRoutes.ts` (the fix)
- `backend/tests/canonical/previewPoolOrgContext.test.ts` (new)
- `backend/tests/run.ts` (test registration)
- `docs/changelog/bugfix/2026-07-12-route-runs-preview-pool-rls-context.md` (this file)

## Scope guard
- NOT touched: `getCandidateStopsForPoolWithRisk` / `routeRunService.ts` (the
  helper is correct — it takes a client and was being handed the wrong one),
  RLS policies, the seed fixture (`seed.sql` — the regression test owns and
  cleans up its own throwaway rows), and every other handler in the file
  (already org-scoped). No labor-safety or canonical (`core.*`) surface touched.
