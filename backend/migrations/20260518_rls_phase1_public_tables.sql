-- ============================================================
-- Phase 1 — RLS: public schema tables with existing org_id
--
-- Enables Row Level Security on the 7 public tables that already
-- carry an org_id column but had no policy. Follows the same
-- COALESCE passthrough pattern established in Tier 7 for core.*:
-- an unset (empty) app.current_org_id bypasses the policy so that
-- migration scripts and the seed runner can operate without an org
-- context. Application request paths always set the variable via
-- backend/src/db.ts::withOrgContext().
--
-- FORCE ROW LEVEL SECURITY ensures the table owner (fieldpro role)
-- is also subject to the policy.
--
-- Special case: export_delete_tokens.org_id is type TEXT, not
-- bigint. Its policy uses plain string comparison, no ::bigint cast.
--
-- Tables covered:
--   public.assets
--   public.bases
--   public.eam_bridge_route_log
--   public.route_pools
--   public.route_runs
--   public.transit_stops
--   public.export_delete_tokens
-- ============================================================

-- ── public.assets ─────────────────────────────────────────────
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.assets;
CREATE POLICY org_isolation ON public.assets
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.assets IS
  'Phase 1 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

-- ── public.bases ──────────────────────────────────────────────
ALTER TABLE public.bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.bases;
CREATE POLICY org_isolation ON public.bases
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.bases IS
  'Phase 1 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

-- ── public.eam_bridge_route_log ───────────────────────────────
ALTER TABLE public.eam_bridge_route_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eam_bridge_route_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.eam_bridge_route_log;
CREATE POLICY org_isolation ON public.eam_bridge_route_log
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.eam_bridge_route_log IS
  'Phase 1 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

-- ── public.route_pools ────────────────────────────────────────
ALTER TABLE public.route_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_pools FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.route_pools;
CREATE POLICY org_isolation ON public.route_pools
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.route_pools IS
  'Phase 1 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

-- ── public.route_runs ─────────────────────────────────────────
ALTER TABLE public.route_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.route_runs;
CREATE POLICY org_isolation ON public.route_runs
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.route_runs IS
  'Phase 1 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

-- ── public.transit_stops ──────────────────────────────────────
ALTER TABLE public.transit_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transit_stops FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.transit_stops;
CREATE POLICY org_isolation ON public.transit_stops
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.transit_stops IS
  'Phase 1 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

-- ── public.export_delete_tokens ───────────────────────────────
-- org_id is type TEXT on this table, not bigint. Plain string comparison.
ALTER TABLE public.export_delete_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_delete_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.export_delete_tokens;
CREATE POLICY org_isolation ON public.export_delete_tokens
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')
  );
COMMENT ON POLICY org_isolation ON public.export_delete_tokens IS
  'Phase 1 tenant isolation. org_id is TEXT — plain string comparison. Filters by app.current_org_id set via withOrgContext().';
