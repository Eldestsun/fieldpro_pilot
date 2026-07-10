-- backend/tests/fixtures/seed.sql
--
-- Minimal reference-data seed for the canonical integration test suite.
--
-- WHY: CI's "Run migrations" step creates schema only, not seed data. The
-- canonical tests' createRouteRunFixture (tests/setup.ts) inserts a route_run
-- against route_pool_id='TEST_POOL' and resolves stop_id '31150' to a location
-- via core.v_locations_transit. Without the reference rows below, every
-- fixture-backed test fails at setup — route_runs' enforce_route_runs_pool_invariant
-- trigger raises "route_pool_id TEST_POOL not found" (ISSUE-022), and
-- getVisitContext raises "missing location_id ... (stop_id mapping failed)"
-- (ISSUE-009). Both are the same root cause: missing seed on the CI test DB.
--
-- SCOPE: This is the static reference graph only — the 8 rows the fixture
-- assumes exist. Per-test state (route_runs, route_run_stops, visits, ...) is
-- still created and torn down by the fixture itself. Keep this minimal; do not
-- grow it into a dev-DB clone.
--
-- IDEMPOTENT: every insert is ON CONFLICT DO NOTHING so the seed can re-run.
--
-- PLACEMENT: lives under tests/, NOT migrations/ — the migration runner must
-- never apply this. It is run only by CI's "Seed test fixtures" step (and may
-- be run by hand against a local test DB).
--
-- RLS: most target tables are FORCE ROW LEVEL SECURITY. In CI the connecting
-- role (fieldpro) is the postgres container superuser and bypasses RLS, so the
-- inserts succeed regardless. The set_config below is defensive (per CLAUDE.md
-- PATTERN-001): harmless under a bypassing role, and makes the seed correct if
-- it is ever run under an org-scoped, non-bypassing role.

SELECT set_config('app.current_org_id', '1', false);

-- 1. Organization (no RLS) — the tenant every other row hangs off.
INSERT INTO public.organizations (id, name, slug)
VALUES (1, 'King County Metro', 'kcm')
ON CONFLICT (id) DO NOTHING;

-- 2. Asset type (no RLS) — referenced by assets.asset_type_id.
INSERT INTO public.asset_types (id, code, name)
VALUES (1, 'transit_stop', 'Transit Stop')
ON CONFLICT (id) DO NOTHING;

-- 3. Base (FORCE RLS) — referenced by route_pools.base_id / route_runs.base_id.
INSERT INTO public.bases (id, name, lon, lat, org_id)
VALUES ('SOUTH', 'South Facilities', -122.291389, 47.49625, 1)
ON CONFLICT (id) DO NOTHING;

-- 4. Route pool (FORCE RLS) — the fixture's FIXTURE_POOL_ID='TEST_POOL'.
--    The enforce_route_runs_pool_invariant trigger autofills route_runs.org_id
--    and base_id from this row.
INSERT INTO public.route_pools (id, label, org_id, base_id)
VALUES ('TEST_POOL', 'Developer Test Pool', 1, 'SOUTH')
ON CONFLICT (id) DO NOTHING;

-- 5. Asset (FORCE RLS) — the fixture's FIXTURE_ASSET_ID=2; getVisitContext
--    joins public.assets for org_id, route_run_stops.asset_id references it.
INSERT INTO public.assets (id, org_id, asset_type_id, seed_key, external_id, display_name, lon, lat)
VALUES (2, 1, 1, '31150', '31150', 'W Government Way', -122.403142, 47.65832032)
ON CONFLICT (id) DO NOTHING;

-- 6. Transit stop + primary-asset link (FORCE RLS).
--    route_run_stops.stop_id references transit_stops.stop_id (fixture
--    FIXTURE_STOP_ID='31150'); the assignments test reads public.stops.asset_id
--    (a view over transit_stops.asset_id) as the assignment's primary_asset_id
--    and asserts it equals FIXTURE_ASSET_ID=2, so the stop must have asset_id=2.
--
--    A normal asset_id write can't be used: the sync_transit_stop_primary_asset
--    trigger (AFTER INSERT OR UPDATE OF asset_id) inserts into transit_stop_assets
--    WITHOUT its NOT NULL org_id and crashes (ISSUE-024 — latent prod defect).
--    Its INSERT ... ON CONFLICT DO UPDATE does not even self-heal: inside the
--    plpgsql function the arbiter fails to match a pre-existing active link row
--    (an identical top-level statement matches it), so pre-seeding the link
--    doesn't help. We therefore disable the trigger for the seed's asset_id
--    write and populate both rows explicitly. CI runs the seed as the postgres
--    container superuser, which can toggle triggers; this is a CI/test seed only.
ALTER TABLE public.transit_stops DISABLE TRIGGER trg_sync_transit_stop_primary_asset;
-- ISSUE-057: the stop must be BASE-ELIGIBLE for the risk-map rebuild
-- (riskMapService eligibility: pool_id IS NOT NULL AND has_trash/compactor) —
-- the CANON-NORM-3 test asserts the stop lands in stop_risk_snapshot.
-- DO UPDATE (not DO NOTHING) so DBs seeded by the older row shape heal the
-- two eligibility columns on re-run; asset_id is not touched, so the
-- (disabled) sync trigger stays irrelevant.
INSERT INTO public.transit_stops (stop_id, org_id, asset_id, pool_id, has_trash)
VALUES ('31150', 1, 2, 'TEST_POOL', true)
ON CONFLICT (stop_id) DO UPDATE
  SET pool_id = EXCLUDED.pool_id, has_trash = EXCLUDED.has_trash;
ALTER TABLE public.transit_stops ENABLE TRIGGER trg_sync_transit_stop_primary_asset;

INSERT INTO public.transit_stop_assets (org_id, stop_id, asset_id, role, active)
VALUES (1, '31150', 2, 'primary', true)
ON CONFLICT (stop_id, asset_id, role) WHERE active = true DO NOTHING;

-- 7. Canonical location (FORCE RLS) — core.v_locations_transit reads this
--    (location_type='transit_stop'); FIXTURE_LOCATION_ID=1.
INSERT INTO core.locations (id, org_id, location_type, label)
VALUES (1, 1, 'transit_stop', '31150')
ON CONFLICT (id) DO NOTHING;

-- 7b. Canonical asset→location link (FORCE RLS) — the risk-map hazard/l3
--     CTEs translate asset → stop via core.asset_locations (active, primary)
--     → core.location_external_ids. Without this row the CANON-NORM-3 hazard
--     magnitude never joins through (ISSUE-057). Guarded (no unique target).
INSERT INTO core.asset_locations (org_id, asset_id, location_id, role, active)
SELECT 1, 2, 1, 'primary', true
WHERE NOT EXISTS (
  SELECT 1 FROM core.asset_locations
  WHERE asset_id = 2 AND location_id = 1 AND role = 'primary'
);

-- 8. Location external id (FORCE RLS) — the metro_stop mapping that
--    core.v_locations_transit joins on (external_id = stop_id '31150').
INSERT INTO core.location_external_ids (org_id, location_id, source_system, external_id)
VALUES (1, 1, 'metro_stop', '31150')
ON CONFLICT DO NOTHING;

-- ── Additional reference rows for tests beyond the route-run fixture ─────────

-- 9. EAM bridge watermark state — eamBridge.test.ts reads
--    `SELECT watermark FROM eam_bridge_populate_state WHERE id=1` during setup;
--    without the row, rows[0] is undefined -> "Cannot read properties of
--    undefined (reading 'watermark')". id and watermark both have defaults
--    (1 / epoch), so inserting id=1 is enough.
INSERT INTO public.eam_bridge_populate_state (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- 10. Directory users (FORCE RLS) — roleRenamePhase1Audit's /api/users test
--     asserts the list includes a Specialist and a Dispatch row. /api/users
--     selects last_seen_role AS role FROM identity_directory
--     WHERE last_seen_role IN ('UL','Specialist','Lead','Dispatch'), under org
--     context. Seed one of each post-backfill role name for org 1.
INSERT INTO public.identity_directory (oid, org_id, display_name, last_seen_role)
VALUES
  ('seed-specialist-oid', 1, 'Seed Specialist', 'Specialist'),
  ('seed-dispatch-oid',   1, 'Seed Dispatch',   'Dispatch')
ON CONFLICT (oid) DO NOTHING;

-- 11. SEAM-D D3a AD-HOC-PICKER FIXTURE STOPS (SEAMD_ADHOC_A / SEAMD_ADHOC_B).
--     Owner: tests/canonical/adhocRouteRuns.test.ts — the "ad-hoc run persists
--     is_adhoc" tests POST /route-runs with stop_ids=[SEAMD_ADHOC_A, SEAMD_ADHOC_B]
--     through live OSRM. They need exactly two org-1 stops that are
--     (a) COORDINATE-BEARING (OSRM trip planning needs lon/lat), and
--     (b) ASSET-LINKED (route_run_stops.asset_id is NOT NULL; createRouteRun
--         resolves it from public.stops.asset_id = transit_stops.asset_id).
--     They live HERE, not in the test, because setting transit_stops.asset_id
--     fires the ISSUE-024 sync trigger (see §6 above) — only this seed's
--     elevated trigger-disable path can do the asset_id write. CI lacks the
--     runtime provisioner credential by design; seed.sql is the sanctioned
--     elevated-fixture path in both CI and local (run.ts ensureFixtureSeed).
--     WORKAROUND NOTE: when RLS-TSA (the trigger org_id root fix) lands, the
--     runtime write becomes possible under normal roles and these two rows can
--     be reconsidered. Deliberately NOT pool-eligible (no pool_id, has_trash
--     false) so they never enter risk-map eligibility or pool-candidate flows;
--     the asset ids are high sentinels so they cannot collide with the
--     historically dense 1..15k asset id range on older dev DBs.
--     If you are writing a stop/asset COUNT assertion: org 1 carries these two
--     synthetic stops (plus 31150) by design.
INSERT INTO public.assets (id, org_id, asset_type_id, seed_key, external_id, display_name, lon, lat)
VALUES
  (987654321, 1, 1, 'SEAMD_ADHOC_A', 'SEAMD_ADHOC_A', 'SEAM-D Picker Fixture A', -122.300, 47.500),
  (987654322, 1, 1, 'SEAMD_ADHOC_B', 'SEAMD_ADHOC_B', 'SEAM-D Picker Fixture B', -122.310, 47.510)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.transit_stops DISABLE TRIGGER trg_sync_transit_stop_primary_asset;
INSERT INTO public.transit_stops (stop_id, org_id, asset_id, lon, lat, on_street_name)
VALUES
  ('SEAMD_ADHOC_A', 1, 987654321, -122.300, 47.500, 'SEAM-D Picker Fixture A'),
  ('SEAMD_ADHOC_B', 1, 987654322, -122.310, 47.510, 'SEAM-D Picker Fixture B')
ON CONFLICT (stop_id) DO NOTHING;
ALTER TABLE public.transit_stops ENABLE TRIGGER trg_sync_transit_stop_primary_asset;

INSERT INTO public.transit_stop_assets (org_id, stop_id, asset_id, role, active)
VALUES
  (1, 'SEAMD_ADHOC_A', 987654321, 'primary', true),
  (1, 'SEAMD_ADHOC_B', 987654322, 'primary', true)
ON CONFLICT (stop_id, asset_id, role) WHERE active = true DO NOTHING;
