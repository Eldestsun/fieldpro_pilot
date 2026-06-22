-- ============================================================
-- Provision mcp_readonly + its canonical-only SELECT grant set (ISSUE-039)
-- 2026-06-22 — ISSUE-039 / clean-build + labor-safety grant-posture remediation
--
-- WHY THIS EXISTS
-- mcp_readonly's read grants were applied OUT-OF-BAND (direct psql) and were never
-- version-controlled — so 00000000_consolidated_schema.sql reproduces ZERO of them.
-- On the first-ever clean-room rebuild the chain dies at the NEXT migration,
-- 20260612_mcp_readonly_revoke_canonical_only.sql, whose step-6 regression guard
-- RAISEs unless mcp_readonly already holds SELECT on core.observations. That guard is
-- CORRECT — it caught a missing upstream grant. The fix is upstream provisioning,
-- never weakening the guard. This migration establishes the role and its intended
-- canonical-only grant set so the guard passes on a fresh build and every environment
-- ends in the SAME grant posture. (Same drift class as ISSUE-038, one layer down:
-- grants, not DDL.)
--
-- SEAM (founder decision, ISSUE-039 §4): a dedicated, runner-owned, idempotent grant
-- migration sorting BEFORE 20260612. 00000000_consolidated stays a pure structural
-- baseline and is NOT edited. This file owns the grant posture as an auditable unit.
--
-- ROLE PROVISIONING: CREATE ROLE has no IF NOT EXISTS, so a pg_roles DO-block guard
-- creates mcp_readonly only if absent. Roles are cluster-global: on the dev cluster
-- the role already exists (guard skips); a fresh Azure cluster has neither role nor
-- grants (guard creates it). The role is created NOLOGIN — its LOGIN attribute and
-- password are a SECRET owned by environment bootstrap (Azure/IaC), deliberately kept
-- out of version control. This migration owns the role's EXISTENCE + PRIVILEGE
-- POSTURE only, not its login credential. Apply as an admin role (superuser, or an
-- object owner with CREATEROLE) — same runtime requirement as the other DDL/grant
-- migrations in this set; on an already-populated DB run by the app owner `fieldpro`
-- the guard skips CREATE ROLE and the grants below are owner-grantable no-ops.
--
-- THE INTENDED SET — derived from design, NOT from a live snapshot
--   Source: 20260612 revoke header §WHAT IS KEPT; CANONICAL_STATE_LAYER_DESIGN.md §3.2
--   (identity lives in no-grant actor-audit sidecars; diagnostic roles get NO grant on
--   identity). mcp_readonly is the diagnostic LOGIN role: reach to the identity-free
--   canonical / diagnostic surface ONLY. Every object below was confirmed identity-free
--   by column scan (no worker oid / user_id / reported_by / captured_by). The two
--   residual identity-named transit views (core.v_clean_logs_transit [user_id],
--   core.v_hazards_transit [reported_by]) are DELIBERATELY EXCLUDED — their live object
--   eviction is owned by card D3 (ISSUE-031/D3), kept separate. core.v_observation_normalized
--   is also part of the intended set but is created later (20260614); its grant lives in
--   that object's own grant migration, 20260617_canon_norm_3 (each grant lives where its
--   object exists), so it is NOT listed here.
--
-- ── GRANTED (29 objects, all present in 00000000_consolidated by this sort point) ────
--   13 core: observations, visits, evidence, assignments, asset_locations, locations,
--            location_external_ids, v_assets, v_locations, v_locations_transit,
--            v_asset_locations_transit, v_assignments_transit, v_stop_location_map
--   16 public: assets, asset_types, asset_external_ids, bases, organizations,
--              route_pools, route_run_stops, stops_legacy, stop_assets_v1,
--              stop_risk_snapshot, transit_stops, transit_stop_assets,
--              transit_stop_assets_v1, export_stop_status_v1,
--              export_pool_daily_summary_v1, export_route_run_origin_mix_v1
--
-- ── NEVER GRANTED ────────────────────────────────────────────────────────────────────
--   Identity wall (asserted absent in step 5): 4 actor-audit sidecars,
--   public.identity_directory, public.route_runs, public.lead_route_overrides, the
--   work-attribution logs.
--   D3 residual (NOT granted here, but NOT asserted — see step 5 scope note): the two
--   identity-named transit views core.v_clean_logs_transit / core.v_hazards_transit;
--   live still holds those grants until card D3 evicts the views.
--   Per-object GRANTs only — never GRANT ON ALL TABLES, which would sweep in identity objects.
--
-- Idempotent: CREATE ROLE is guarded; GRANT SELECT re-asserts the same privilege.
-- ============================================================

BEGIN;

-- 1. Provision the role if the cluster does not already have it (cluster-global).
--    NOLOGIN by design — login/password is environment-bootstrap-owned (see header).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_readonly') THEN
    CREATE ROLE mcp_readonly NOLOGIN;
  END IF;
END $$;

-- 2. Canonical spine + identity-free canonical views (13 core).
GRANT SELECT ON core.observations            TO mcp_readonly;
GRANT SELECT ON core.visits                  TO mcp_readonly;
GRANT SELECT ON core.evidence                TO mcp_readonly;
GRANT SELECT ON core.assignments             TO mcp_readonly;
GRANT SELECT ON core.asset_locations         TO mcp_readonly;
GRANT SELECT ON core.locations               TO mcp_readonly;
GRANT SELECT ON core.location_external_ids   TO mcp_readonly;
GRANT SELECT ON core.v_assets                TO mcp_readonly;
GRANT SELECT ON core.v_locations             TO mcp_readonly;
GRANT SELECT ON core.v_locations_transit     TO mcp_readonly;
GRANT SELECT ON core.v_asset_locations_transit TO mcp_readonly;
GRANT SELECT ON core.v_assignments_transit   TO mcp_readonly;  -- route-level only; no assigned_user_oid projected (verified)
GRANT SELECT ON core.v_stop_location_map     TO mcp_readonly;

-- 3. Identity-free asset / org / route inventory + sanctioned export views (16 public).
GRANT SELECT ON public.assets                       TO mcp_readonly;
GRANT SELECT ON public.asset_types                  TO mcp_readonly;
GRANT SELECT ON public.asset_external_ids           TO mcp_readonly;
GRANT SELECT ON public.bases                        TO mcp_readonly;
GRANT SELECT ON public.organizations                TO mcp_readonly;
GRANT SELECT ON public.route_pools                  TO mcp_readonly;
GRANT SELECT ON public.route_run_stops              TO mcp_readonly;  -- child of route_runs; carries no worker oid (verified)
GRANT SELECT ON public.stops_legacy                 TO mcp_readonly;
GRANT SELECT ON public.stop_assets_v1               TO mcp_readonly;
GRANT SELECT ON public.stop_risk_snapshot           TO mcp_readonly;
GRANT SELECT ON public.transit_stops                TO mcp_readonly;
GRANT SELECT ON public.transit_stop_assets          TO mcp_readonly;
GRANT SELECT ON public.transit_stop_assets_v1       TO mcp_readonly;
GRANT SELECT ON public.export_stop_status_v1        TO mcp_readonly;
GRANT SELECT ON public.export_pool_daily_summary_v1 TO mcp_readonly;
GRANT SELECT ON public.export_route_run_origin_mix_v1 TO mcp_readonly;

-- 4. Assert the canonical read is established (so 20260612 step-6 passes downstream),
--    and the full intended set is present.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(obj, ', ') INTO missing
  FROM (VALUES
    ('core.observations'),('core.visits'),('core.evidence'),('core.assignments'),
    ('core.asset_locations'),('core.locations'),('core.location_external_ids'),
    ('core.v_assets'),('core.v_locations'),('core.v_locations_transit'),
    ('core.v_asset_locations_transit'),('core.v_assignments_transit'),('core.v_stop_location_map'),
    ('public.assets'),('public.asset_types'),('public.asset_external_ids'),('public.bases'),
    ('public.organizations'),('public.route_pools'),('public.route_run_stops'),
    ('public.stops_legacy'),('public.stop_assets_v1'),('public.stop_risk_snapshot'),
    ('public.transit_stops'),('public.transit_stop_assets'),('public.transit_stop_assets_v1'),
    ('public.export_stop_status_v1'),('public.export_pool_daily_summary_v1'),
    ('public.export_route_run_origin_mix_v1')
  ) AS t(obj)
  WHERE NOT has_table_privilege('mcp_readonly', obj, 'SELECT');

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'ISSUE-039: intended canonical grant set incomplete — mcp_readonly missing SELECT on: %', missing;
  END IF;
END $$;

-- 5. Assert the labor-safety identity wall: this migration must NOT have granted any
--    identity object. Guarded by to_regclass so the check is robust to objects not present
--    at this sort point (e.g. adapter tables dropped by later migrations).
--
--    SCOPE NOTE — the two residual identity-NAMED transit views (core.v_clean_logs_transit,
--    core.v_hazards_transit) are DELIBERATELY NOT in this list. They are out of ISSUE-039's
--    scope: their eviction is owned by card D3, and live/dev legitimately still hold those
--    grants until D3 lands. Asserting their absence HERE would make this migration fail on
--    every already-populated environment (and couple ISSUE-039 to D3, which the founder kept
--    separate). This migration's guarantee is that it grants ONLY the identity-free objects
--    enumerated above; that is enforced structurally by the explicit per-object GRANT list
--    (never GRANT ON ALL) and re-checked here against the hard identity surfaces. The two
--    transit views are excluded from mcp_readonly's set by simply not being granted, and
--    their removal is D3's job, not this migration's assertion.
DO $$
DECLARE leaked text;
BEGIN
  SELECT string_agg(obj, ', ') INTO leaked
  FROM (VALUES
    ('core.visit_actor_audit'),('core.observation_actor_audit'),
    ('core.evidence_actor_audit'),('core.assignment_actor_audit'),
    ('public.identity_directory'),('public.route_runs'),('public.lead_route_overrides'),
    ('public.clean_logs'),('public.hazards'),('public.infrastructure_issues'),
    ('public.level3_logs'),('public.stop_photos'),('public.trash_volume_logs')
  ) AS t(obj)
  WHERE to_regclass(obj) IS NOT NULL
    AND has_table_privilege('mcp_readonly', obj, 'SELECT');

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'ISSUE-039: labor-safety wall breach — mcp_readonly holds SELECT on identity object(s): %', leaked;
  END IF;
END $$;

COMMIT;
