# 2026-05-14 — ISSUE-009: fix 16 fixture failures (location_id mapping + RLS session context)

## What changed

- `backend/migrations/20260514_seed_core_location_external_ids.sql` — created idempotent
  migration to backfill `core.location_external_ids` from `core.locations`; confirmed
  14,916 rows already present (earlier partial migration had succeeded silently)
- `backend/tests/setup.ts::createRouteRunFixture` — added
  `set_config('app.current_org_id', FIXTURE_ORG_ID)` before returning the fixture client;
  added matching reset in `cleanupFixture` to clear org context on pool connection release

## Why

- `core.v_locations_transit` JOINs `core.location_external_ids`, which has FORCE ROW LEVEL
  SECURITY. Without `app.current_org_id` set in the DB session, RLS filtered out every row
  and `getVisitContext` received NULL for `location_id` on every route_run_stop query.
- In production, `withOrgContext()` sets this session variable before any call to
  `ensureVisitForRouteRunStop`. The test fixture bypassed `withOrgContext` by passing a raw
  pool client, so the session variable was never set — causing all 16 fixture-dependent tests
  to throw `"missing location_id for route_run_stop N"`.
- The backfill migration was created for completeness and to document the original
  incomplete-migration root cause, even though the data was already present.

## Test baseline

| State | Passed | Failed | Total |
|-------|--------|--------|-------|
| DB down (pre-fix baseline) | 51 | 48 | 99 |
| DB up, S1 migrations applied (post-Step-1) | 82 | 17 | 99 |
| After setup.ts org-context fix (post-Step-2) | **98** | **1** | **99** |

Remaining failure: `devAuthBypass: audit_log entry written for every bypass use` — pre-existing
uncommitted change in `devAuthBypass.ts` that restructured the audit detail payload; not part
of ISSUE-009.

## Files touched

- `backend/migrations/20260514_seed_core_location_external_ids.sql`
- `backend/tests/setup.ts`
- `docs/changelog/2026-05-14-issue-009-fixture-fix.md`
