-- ============================================================
-- ROLLBACK: re-grant mcp_readonly to its pre-revoke surface
-- 2026-06-12 — reverses 20260612_mcp_readonly_revoke_canonical_only.sql
--
-- ⚠️  WARNING: this RE-OPENS the labor-safety exposure that ADR Q-G / Calibration D7
--     closed. After this runs, mcp_readonly (a LOGIN role) can again resolve any actor
--     reference to a named, emailed worker and join work-attribution to individuals.
--     Use only to recover the exact prior state during an incident — not as routine.
--
-- Restores the 13 SELECT grants the forward migration revoked. Idempotent.
-- ============================================================

BEGIN;

-- 1. Identity sidecars.
GRANT SELECT ON core.visit_actor_audit       TO mcp_readonly;
GRANT SELECT ON core.observation_actor_audit TO mcp_readonly;
GRANT SELECT ON core.evidence_actor_audit    TO mcp_readonly;
GRANT SELECT ON core.assignment_actor_audit  TO mcp_readonly;

-- 2. Identity directory.
GRANT SELECT ON public.identity_directory TO mcp_readonly;

-- 3. Transit operational tables carrying a worker OID.
GRANT SELECT ON public.route_runs           TO mcp_readonly;
GRANT SELECT ON public.lead_route_overrides TO mcp_readonly;

-- 4. Work-attribution logs.
GRANT SELECT ON public.clean_logs            TO mcp_readonly;
GRANT SELECT ON public.hazards               TO mcp_readonly;
GRANT SELECT ON public.infrastructure_issues TO mcp_readonly;
GRANT SELECT ON public.level3_logs           TO mcp_readonly;
GRANT SELECT ON public.stop_photos           TO mcp_readonly;
GRANT SELECT ON public.trash_volume_logs     TO mcp_readonly;

COMMIT;
