-- ============================================================================
-- NI-2 — seed live-only operational config so a clean rebuild is non-destructive
-- 2026-06-28 — data/seed-live-only-config-pre-rebuild
--
-- Captures config rows that exist ONLY in live dev data — no migration ever
-- seeded them (recon: docs/audit/2026-06-27-clean-build-vs-live-diff.md, items
-- g/NI-2). A clean-room rebuild produced these tables EMPTY. Rows are dumped
-- VERBATIM from live (pg_dump --column-inserts) — exact values, not reconstructed.
--
-- FK-safe order within this file:
--   public.asset_types  (independent)
--   core.asset_types    (independent; core.observation_type_registry.asset_type_id
--                        -> core.asset_types(id), so this MUST land before the
--                        registry seed in 20260628_seed_b_*)
--   public.bases        (route_pools.base_id -> bases.id)
--   public.route_pools  (depends on bases)
--
-- IDEMPOTENT: ON CONFLICT DO NOTHING on every row -> a re-run (or apply to an
-- already-populated DB, e.g. live) is a 0-row no-op. The runner records this file
-- in public.schema_migrations, so normal re-runs skip it entirely.
--
-- RLS: org-scoped targets are FORCE ROW LEVEL SECURITY. The runner applies
-- migrations as fieldpro_admin (BYPASSRLS). SET LOCAL app.current_org_id is also
-- set so the fail-closed WITH CHECK passes even if applied by a non-bypass role
-- (CLAUDE.md § RLS Context Gotcha). All seeded org rows are org_id = 1.
--
-- NOTE (carried verbatim, not a defect): public.route_pools includes developer/QA
-- pools (TEST_POOL, TEST_POOL_1..3, QA_POOL). They are part of live state and are
-- seeded as-is per the capture principle (persist exactly what is on live).
-- ============================================================================

BEGIN;
SET LOCAL app.current_org_id = '1';

-- public.asset_types (1 row; no org_id column)
INSERT INTO public.asset_types (id, code, name, created_at) VALUES (1, 'transit_stop', 'Transit Stop', '2025-12-21 04:23:07.305188+00') ON CONFLICT DO NOTHING;

-- core.asset_types (1 row) — registry.asset_type_id FK target
INSERT INTO core.asset_types (id, org_id, type_key, display_name, description, is_active, created_at) OVERRIDING SYSTEM VALUE VALUES (1, 1, 'transit_stop', 'Transit Stop', 'KCM transit bus stops — seeded from transit_stops via seed_transit_assets.ts', true, '2026-05-13 07:11:44.559907+00') ON CONFLICT DO NOTHING;

-- public.bases (2 rows) — route_pools.base_id FK target
INSERT INTO public.bases (id, name, lon, lat, address, active, created_at, updated_at, org_id) VALUES ('SOUTH', 'South Facilities', -122.291389, 47.49625, '11911 E Marginal Way S, Tukwila, WA', true, '2025-11-25 06:15:46.981034+00', '2025-11-25 06:15:46.981034+00', 1) ON CONFLICT DO NOTHING;
INSERT INTO public.bases (id, name, lon, lat, address, active, created_at, updated_at, org_id) VALUES ('NORTH', 'North Facilities', -122.343306, 47.720611, '12525 Stone Ave N, Seattle, WA', true, '2025-11-25 06:15:46.981034+00', '2025-11-25 06:15:46.981034+00', 1) ON CONFLICT DO NOTHING;

-- public.route_pools (12 rows; incl. dev/QA pools, carried verbatim)
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('NS', 'NS District', 'NS', true, NULL, '2025-11-23 21:07:05.022843+00', '2025-11-23 21:07:05.022843+00', NULL, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('TEST_POOL', 'Developer Test Pool', 'TST', true, 423, '2025-12-02 07:18:54.173042+00', '2025-12-07 03:30:22.199956+00', 'SOUTH', 1) ON CONFLICT DO NOTHING;
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('SW', 'SW District', 'SW', true, NULL, '2025-11-23 21:07:05.022843+00', '2025-11-23 21:07:05.022843+00', NULL, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('NL', 'NL District', 'NL', true, NULL, '2025-11-23 21:07:05.022843+00', '2025-11-23 21:07:05.022843+00', NULL, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('SE', 'SE District', 'SE', true, NULL, '2025-11-23 21:07:05.022843+00', '2025-11-23 21:07:05.022843+00', NULL, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('E', 'E District', 'E', true, NULL, '2025-11-23 21:07:05.022843+00', '2025-12-03 03:17:41.542002+00', NULL, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('SC', 'SC District', 'SC', true, NULL, '2025-11-23 21:07:05.022843+00', '2025-11-23 21:07:05.022843+00', NULL, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('CB', 'CB District', 'CB', true, NULL, '2025-11-23 21:07:05.022843+00', '2025-12-22 04:30:55.061603+00', NULL, 1) ON CONFLICT DO NOTHING;
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('TEST_POOL_1', 'Test Pool 1 (Easy)', 'TEST_POOL', true, NULL, '2025-12-28 01:44:21.166109+00', '2025-12-28 01:44:21.166109+00', 'NORTH', 1) ON CONFLICT DO NOTHING;
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('TEST_POOL_2', 'Test Pool 2 (Medium)', 'TEST_POOL', true, NULL, '2025-12-28 01:44:21.166109+00', '2025-12-28 01:44:21.166109+00', 'NORTH', 1) ON CONFLICT DO NOTHING;
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('TEST_POOL_3', 'Test Pool 3 (Heavy)', 'TEST_POOL', true, NULL, '2025-12-28 01:44:21.166109+00', '2025-12-28 01:44:21.166109+00', 'SOUTH', 1) ON CONFLICT DO NOTHING;
INSERT INTO public.route_pools (id, label, trf_district, active, default_max_minutes, created_at, updated_at, base_id, org_id) VALUES ('QA_POOL', 'QA POOL', 'QA-DIST', false, 420, '2025-12-03 04:04:49.905257+00', '2026-01-10 18:36:24.839476+00', NULL, 1) ON CONFLICT DO NOTHING;

COMMIT;
