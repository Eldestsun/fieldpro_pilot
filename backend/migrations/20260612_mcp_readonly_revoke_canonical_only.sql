-- ============================================================
-- Revoke mcp_readonly to canonical-only (labor-safety remediation)
-- 2026-06-12 — ISSUE-031 / ADR Q-G / Calibration D7
--
-- mcp_readonly is a LOGIN role (rolcanlogin=true) that currently holds SELECT on
-- worker-identity surfaces: all four core.*_actor_audit sidecars, public.identity_directory,
-- and every public.* work-attribution log + the two transit operational tables that
-- carry a resolvable worker OID. That contradicts the auditable-by-grant labor-safety
-- claim — the role can resolve any actor reference to a named, emailed worker and join
-- work-attribution to individuals. ADR Q-G and Calibration D7 settle this: revoke to
-- canonical-only, no exemption.
--
-- This migration is a STANDALONE GRANT REVOKE. It contains ONLY revoke statements.
-- No view eviction, no Control Center repoint, no table reshaping (those are separate
-- ISSUE-031 work, D2/D3).
--
-- ── WHAT IS REVOKED (13 objects) ─────────────────────────────────────────────
--   Identity sidecars (4):  core.{visit,observation,evidence,assignment}_actor_audit
--   Identity directory:     public.identity_directory  (OID → name + email)
--   Worker-OID adapters (2):public.route_runs           (assigned_user_oid / created_by_oid)
--                          public.lead_route_overrides (created_by = auth-token worker OID;
--                                                       added per operator decision 2026-06-12,
--                                                       same OID-resolution class as route_runs)
--   Work-attribution logs (6): public.{clean_logs,hazards,infrastructure_issues,
--                                       level3_logs,stop_photos,trash_volume_logs}
--
-- ── WHAT IS KEPT (untouched here) ────────────────────────────────────────────
--   The non-identity canonical / diagnostic surface: core.observations, core.visits,
--   core.assignments, core.evidence, core.asset_locations, core.locations,
--   core.location_external_ids, the core.v_* views, public.stop_risk_snapshot,
--   public.transit_stop_assets, public.stops, etc. (verified identity-free in Phase 0:
--   sidecar-extraction-B dropped all identity columns from the canonical base tables.)
--
-- ── RESIDUAL (deliberately NOT solved here — separate ISSUE-031 D2/D3 work) ───
--   Five retained core.v_*_transit views are owned by fieldpro and run with owner
--   privileges (PG14, ISSUE-029), so mcp_readonly can still reach a worker column
--   THROUGH them after this base-table revoke:
--     v_clean_logs_transit.user_id, v_hazards_transit.reported_by,
--     v_infra_transit.reported_by, v_level3_logs_transit.user_id,
--     v_stop_photos_transit.created_by_oid
--   These are evicted by the separate view-eviction work (D2/D3), not this migration.
--
-- Idempotent: REVOKE on an absent grant is a no-op (no error). Reversal:
--   rollback/20260612_mcp_readonly_revoke_canonical_only_rollback.sql
--   (re-grants SELECT — re-opens the Q-G/D7 exposure; recovery use only).
-- ============================================================

BEGIN;

-- 1. Identity sidecars (no-grant boundary; intelligence_reader already has none).
REVOKE SELECT ON core.visit_actor_audit       FROM mcp_readonly;
REVOKE SELECT ON core.observation_actor_audit FROM mcp_readonly;
REVOKE SELECT ON core.evidence_actor_audit    FROM mcp_readonly;
REVOKE SELECT ON core.assignment_actor_audit  FROM mcp_readonly;

-- 2. Identity directory (OID → name + email).
REVOKE SELECT ON public.identity_directory FROM mcp_readonly;

-- 3. Transit operational tables carrying a resolvable worker OID.
REVOKE SELECT ON public.route_runs           FROM mcp_readonly;
REVOKE SELECT ON public.lead_route_overrides FROM mcp_readonly;

-- 4. Work-attribution logs (each carries a worker column: user_id / reported_by /
--    created_by_oid).
REVOKE SELECT ON public.clean_logs            FROM mcp_readonly;
REVOKE SELECT ON public.hazards               FROM mcp_readonly;
REVOKE SELECT ON public.infrastructure_issues FROM mcp_readonly;
REVOKE SELECT ON public.level3_logs           FROM mcp_readonly;
REVOKE SELECT ON public.stop_photos           FROM mcp_readonly;
REVOKE SELECT ON public.trash_volume_logs     FROM mcp_readonly;

-- 5. Assert the boundary: zero of the revoked objects may still be SELECT-able by
--    mcp_readonly. Fail the migration loudly if any grant survived.
DO $$
DECLARE leaked text;
BEGIN
  SELECT string_agg(obj, ', ') INTO leaked
  FROM (VALUES
    ('core.visit_actor_audit'),
    ('core.observation_actor_audit'),
    ('core.evidence_actor_audit'),
    ('core.assignment_actor_audit'),
    ('public.identity_directory'),
    ('public.route_runs'),
    ('public.lead_route_overrides'),
    ('public.clean_logs'),
    ('public.hazards'),
    ('public.infrastructure_issues'),
    ('public.level3_logs'),
    ('public.stop_photos'),
    ('public.trash_volume_logs')
  ) AS t(obj)
  WHERE has_table_privilege('mcp_readonly', obj, 'SELECT');

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'mcp_readonly still holds SELECT after revoke on: %', leaked;
  END IF;
END $$;

-- 6. Assert a canonical diagnostic read is preserved (regression guard against
--    over-revoking the kept surface).
DO $$
BEGIN
  IF NOT has_table_privilege('mcp_readonly', 'core.observations', 'SELECT') THEN
    RAISE EXCEPTION 'over-revoke: mcp_readonly lost SELECT on core.observations (canonical surface)';
  END IF;
END $$;

COMMIT;
