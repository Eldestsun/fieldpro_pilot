# 2026-05-21 — `loadRouteRunById` is now org-scoped and fail-closed

## What changed

- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
  - Signature changed from `loadRouteRunById(id)` to `loadRouteRunById(id, orgId)`.
  - Both internal queries (the main `route_runs` load and the parallel
    spot-check events query) now run inside `withOrgContext(orgId, ...)` on
    a single pool client, so `app.current_org_id` is set before any read.
  - Parallel `Promise.all` over two `pool.query` calls collapsed to a
    sequential pair on one checked-out client — both reads now run under
    the same org-context GUC for the whole loader.
- 9 call sites updated to pass the caller's `orgId`:
  - `backend/src/domains/routeRun/routeRunService.ts` × 2 (`startRouteRun`,
    `finishRouteRun` — already received `orgId`, just plumbed through)
  - `backend/src/modules/work/ulRoutes.ts` × 1 (resolved via `resolveNumericOrgId(req)`)
  - `backend/src/modules/work/routeRunStopRoutes.ts` × 2 (one site reused
    `ctx.orgId` already loaded in scope; the other reused the
    `numericOrgId` already resolved earlier in the handler)
  - `backend/src/modules/routes/routeRunRoutes.ts` × 5 (4 newly resolved
    via `resolveNumericOrgId(req)`; 1 reused the in-scope `numericOrgId`)
  - `backend/src/routes/devRoutes.ts` × 1 (uses `resolveNumericOrgId(req)`;
    the dev route has no `requireAuth`, so `req.user` is typically unset
    and the helper falls back to the first organization id — single-tenant
    dev DB)
- `backend/tests/canonical/loadRouteRunById.test.ts` (new) — cross-tenant
  fail-closed proof. Seeds a synthetic org B with a route_run + stop, then
  asserts:
  - `loadRouteRunById(orgBRouteRunId, orgAId)` returns `null` (RLS on
    `route_runs` filters the row out).
  - `loadRouteRunById(orgBRouteRunId, orgBId)` returns the row, id
    matches.
  - All fixture rows (organization, route_run [cascades to
    route_run_stops], transit_stop) are cleaned up in a `finally` block.
- `backend/tests/run.ts` — registers the new test.

## Why

The cross-tenant audit performed as part of the role-rename Phase 1
gate found one fail-open path in the backend: `loadRouteRunById`
executed its queries on a bare `pool.query` connection with
`app.current_org_id` unset, so RLS-scoping depended entirely on the
specific shape of each row's policy.

Today this was masked by `identity_directory`'s **strict** RLS policy
(the one R11 policy in the repo that did *not* adopt the Phase 2
"unset = bypass" form): with the variable unset, the `LEFT JOIN
identity_directory` filtered to NULL on every row, so `assigned_user_name`
/ `assigned_user_role` / `created_by_name` came back NULL for every
route_run detail load. That is a latent UI bug — the assigned-worker
name has been blank on route-run detail surfaces — but it incidentally
fail-closed for identity reads.

The route-rename Phase 1 work needs to flip `identity_directory`'s
policy to the Phase 2 "unset = bypass" form so the backfill UPDATE can
run. If we did that flip while `loadRouteRunById` still ran on a bare
pool, the loader would start happily resolving the identity JOIN — but
via the policy *bypass*, with no tenant isolation. That would turn an
existing display bug into a structural cross-tenant leak surface.

The gate rule (per the user) is: fix the fail-open before flipping the
policy. This dispatch is that fix.

After this change:

- Both the outer `route_runs` row and the JOIN-resolved
  `identity_directory` rows are scoped to the caller's org.
- Requesting another org's route_run returns `null`, not the foreign
  row. Proven by `tests/canonical/loadRouteRunById.test.ts`.
- The latent blank-assignee-name display bug is incidentally fixed:
  once `identity_directory`'s policy flips in the next dispatch, the
  JOIN will resolve correctly *under the caller's org-context* rather
  than being silently filtered.

## Out of scope (explicit)

- The actual policy flip on `identity_directory` is the *next* dispatch
  (per the gate rule). Until then, `loadRouteRunById` is fail-closed but
  the joined identity-directory columns will continue to return NULL
  because the strict policy still filters them out at the JOIN. That is
  the same behavior as before this dispatch — no regression.
- Other bare-pool reads in the same files (e.g. `ulRoutes.ts` line ~123
  reading `route_runs` directly before this loader call) were not
  widened. Auditing those is a separate exercise; this dispatch is
  scoped strictly to the loader and its callers.

## Files touched

- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
- `backend/src/domains/routeRun/routeRunService.ts`
- `backend/src/modules/work/ulRoutes.ts`
- `backend/src/modules/work/routeRunStopRoutes.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/routes/devRoutes.ts`
- `backend/tests/canonical/loadRouteRunById.test.ts` (new)
- `backend/tests/run.ts`

## Verification

- `cd backend && npm test` → 104 passed, 0 failed (was 103; the new
  loadRouteRunById fail-closed test brings the count to 104).
- `cd frontend && npm test -- --run` → 25 passed, 0 failed (untouched).
- `npx tsc --noEmit` in `backend/` → no type errors.
