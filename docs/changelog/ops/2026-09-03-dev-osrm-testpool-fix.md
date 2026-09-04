# 2026-09-03 — Dev route-creation unblocked: OSRM restored + test-pool memberships seeded (AGENT-SMOKE-1 findings #5, #6)

## What changed
- **OSRM (finding #6).** Root cause was NOT broken artifacts: the `fieldpro_osrm`
  container's bind mount still pointed at the repo's old location
  (`~/Documents/Projects/fieldpro_pilot`) from before the move to
  `~/Desktop/Optimized_Life/baseline/fieldpro_pilot`, so `osrm-routed` saw an empty
  `/data` and reported every artifact "Missing/Broken". The artifact set on disk is
  complete. Fix: removed the stale containers and recreated via
  `docker compose up -d --no-deps osrm` from the current repo. Verified: `/trip`
  responds `Ok` on :5005; app route preview renders (ad-hoc and pool paths).
- **`docker-compose.yml` — `osrm_prepare` interpolation bug.** Every shell variable
  in its `command` (`$PBF`, `$PROFILE`, `${DATASET}`) was being swallowed by
  docker-compose's own `${VAR}` interpolation pass, reaching the shell as empty
  strings — the service always failed with `ERROR: Missing .` regardless of what
  was on disk. All shell variables now `$$`-escaped, so a future artifact rebuild
  actually works.
- **Test-pool memberships (finding #5).** New idempotent dev fixture
  `backend/src/scripts/seedTestPoolMemberships.ts` (`pnpm seed:test-pools`): gives
  TEST_POOL / TEST_POOL_1 / TEST_POOL_2 / TEST_POOL_3 deterministic, disjoint
  slices of the org's stops (5+31150 / 5 / 10 / 20 rows;
  `ON CONFLICT DO NOTHING`; refuses `NODE_ENV=production`; reads `route_pools`
  under `withOrgContext` per PATTERN-001). Applied to dev: 41 rows inserted,
  re-run confirmed +0. TEST_POOL force-includes stop 31150 so historical run
  #4188 is coherent with its pool.
- Local-only (untracked `backend/.env`): replaced the never-read `OSRM_URL` key
  with `OSRM_BASE_URL=http://localhost:5005` — the name `osrmClient.ts` actually
  reads. `.env.example` already had the correct name.

## Why
- Both findings from the 2026-09-01 real-Entra E2E smoke (AGENT-SMOKE-1 card):
  together they made ALL route creation impossible in local dev — pool-based
  failed on empty memberships, ad-hoc failed at OSRM preview.
- Verified after fix: ad-hoc preview (2 stops, 22.6 mi) and Developer Test Pool
  preview (6 stops, 34.2 mi) both render with OSRM-optimized sequences. No route
  was saved during verification — no new run rows.

## Files touched
- `docker-compose.yml` ($$-escaping in `osrm_prepare` command + explanatory note)
- `backend/src/scripts/seedTestPoolMemberships.ts` (new)
- `backend/package.json` (`seed:test-pools` script)
- `docs/changelog/ops/2026-09-03-dev-osrm-testpool-fix.md` (this entry)
