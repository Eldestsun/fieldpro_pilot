# 2026-09-17 — ISSUE-069: test fixture seeds the authoritative pool membership, not just the dead cache

## What changed
- **`backend/tests/fixtures/seed.sql`** (new §6b): the fixture stop 31150 now
  seeds its **authoritative** stop→pool fact —
  `stop_pool_memberships ('31150','TEST_POOL', org 1, active)` — alongside the
  deprecated `transit_stops.pool_id` cache write. Idempotent
  (`ON CONFLICT (stop_id, pool_id) DO NOTHING`; a no-op on dev, where
  `seedTestPoolMemberships.ts` already force-includes 31150 in TEST_POOL).
- The §6 cache write is annotated: `pool_id` is kept ONLY because
  `riskMapService` still reads the dead column (that reader repoint is tracked
  separately — the pool-id-cache-drift pattern); when the reader repoints and
  the column drops, the cache line is deleted and the membership row is what
  survives.

## Why
- AGENT-SMOKE-1 finding #5 (spun out as ISSUE-069): fixtures worked only by the
  deprecated cache. Verified: the CI/test DB carried **zero**
  `stop_pool_memberships` rows — every pool-based behavior in the suite held
  purely by `transit_stops.pool_id`, exactly the silent drift a column drop
  would expose. The fixture is now correct against the authoritative model
  first, cache second.

## Finding disposition (card scope vs reality)
- **The persona half of the finding does not reproduce.** `identity_directory`
  persona rows (seed §10, `runtimeIdentityLeak`/`loadRouteRunOidTrim` inserts)
  never touch `transit_stops.pool_id`; the co-occurrences are
  `route_runs.route_pool_id` (authoritative, legitimate) and read-side response
  shapes. No fixture keys personas off the dead column. The one real fixture
  defect was seed.sql §6, fixed here.
- Out of scope, tracked elsewhere: the riskMap/cleanLogs **readers** of
  `ts.pool_id` (pool-id-cache-drift), and `adminStopService`'s deliberate
  dual-write.

## Verification
- Full backend suite **220/220** with the updated seed (run.ts
  `ensureFixtureSeed` applies it); membership row verified present.
- Idempotency: dev pre-existing row → no-op; CI's fresh DB exercises the create
  path on this PR's CI run (migrate → seed → tests).
- Seed-file-only change: no app code, no migration, no frozen files.

## Files touched
- `backend/tests/fixtures/seed.sql`
- `docs/changelog/bugfix/2026-09-17-issue-069-fixture-authoritative-pool-membership.md` (this entry)
