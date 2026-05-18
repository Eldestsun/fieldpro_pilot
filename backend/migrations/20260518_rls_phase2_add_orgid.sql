-- ============================================================
-- Phase 2 — RLS: Add org_id, backfill, and row-level security
-- on 14 public schema tables that held tenant-specific data
-- without org_id.
--
-- Each table runs in its own transaction so a failure on one
-- table does not roll back the others.
--
-- Policy pattern matches Phase 1: unset app.current_org_id
-- bypasses the policy (migration / seed bypass). Application
-- request paths always set the variable via withOrgContext().
--
-- Processing order:
--   1. route_run_stops  ← must precede stop_photos (2-hop join)
--   2-7. core-visit-keyed tables (any order)
--   8. stop_photos      ← joins route_run_stops.org_id
--   9-14. asset/pool-keyed tables (any order)
--
-- Tables covered:
--   public.route_run_stops
--   public.stop_condition_history
--   public.stop_effort_history
--   public.stop_risk_snapshot
--   public.hazards
--   public.infrastructure_issues
--   public.stop_photos
--   public.clean_logs
--   public.level3_logs
--   public.trash_volume_logs
--   public.lead_route_overrides
--   public.stops_legacy
--   public.transit_stop_assets
--   public.asset_external_ids
-- ============================================================

-- ── 1. public.route_run_stops ─────────────────────────────────
BEGIN;

ALTER TABLE public.route_run_stops ADD COLUMN org_id bigint;

UPDATE public.route_run_stops rrs
SET org_id = rr.org_id
FROM public.route_runs rr
WHERE rrs.route_run_id = rr.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.route_run_stops WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'route_run_stops: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.route_run_stops ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.route_run_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_run_stops FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.route_run_stops;
CREATE POLICY org_isolation ON public.route_run_stops
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.route_run_stops IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 2. public.stop_condition_history ─────────────────────────
BEGIN;

ALTER TABLE public.stop_condition_history ADD COLUMN org_id bigint;

UPDATE public.stop_condition_history t
SET org_id = v.org_id
FROM core.visits v
WHERE t.visit_id = v.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stop_condition_history WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'stop_condition_history: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.stop_condition_history ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.stop_condition_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stop_condition_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.stop_condition_history;
CREATE POLICY org_isolation ON public.stop_condition_history
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.stop_condition_history IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 3. public.stop_effort_history ────────────────────────────
BEGIN;

ALTER TABLE public.stop_effort_history ADD COLUMN org_id bigint;

UPDATE public.stop_effort_history t
SET org_id = v.org_id
FROM core.visits v
WHERE t.visit_id = v.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stop_effort_history WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'stop_effort_history: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.stop_effort_history ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.stop_effort_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stop_effort_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.stop_effort_history;
CREATE POLICY org_isolation ON public.stop_effort_history
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.stop_effort_history IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 4. public.stop_risk_snapshot ─────────────────────────────
BEGIN;

ALTER TABLE public.stop_risk_snapshot ADD COLUMN org_id bigint;

UPDATE public.stop_risk_snapshot srs
SET org_id = ts.org_id
FROM public.transit_stops ts
WHERE srs.stop_id = ts.stop_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stop_risk_snapshot WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'stop_risk_snapshot: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.stop_risk_snapshot ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.stop_risk_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stop_risk_snapshot FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.stop_risk_snapshot;
CREATE POLICY org_isolation ON public.stop_risk_snapshot
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.stop_risk_snapshot IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 5. public.hazards ────────────────────────────────────────
BEGIN;

ALTER TABLE public.hazards ADD COLUMN org_id bigint;

UPDATE public.hazards t
SET org_id = v.org_id
FROM core.visits v
WHERE t.visit_id = v.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.hazards WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'hazards: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.hazards ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.hazards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.hazards;
CREATE POLICY org_isolation ON public.hazards
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.hazards IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 6. public.infrastructure_issues ──────────────────────────
BEGIN;

ALTER TABLE public.infrastructure_issues ADD COLUMN org_id bigint;

UPDATE public.infrastructure_issues t
SET org_id = v.org_id
FROM core.visits v
WHERE t.visit_id = v.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.infrastructure_issues WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'infrastructure_issues: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.infrastructure_issues ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.infrastructure_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.infrastructure_issues FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.infrastructure_issues;
CREATE POLICY org_isolation ON public.infrastructure_issues
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.infrastructure_issues IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 7. public.clean_logs ─────────────────────────────────────
BEGIN;

ALTER TABLE public.clean_logs ADD COLUMN org_id bigint;

UPDATE public.clean_logs t
SET org_id = v.org_id
FROM core.visits v
WHERE t.visit_id = v.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.clean_logs WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'clean_logs: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.clean_logs ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.clean_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clean_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.clean_logs;
CREATE POLICY org_isolation ON public.clean_logs
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.clean_logs IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 8. public.level3_logs ────────────────────────────────────
-- 0 rows — column + RLS added for completeness; assertion passes trivially.
BEGIN;

ALTER TABLE public.level3_logs ADD COLUMN org_id bigint;

UPDATE public.level3_logs t
SET org_id = v.org_id
FROM core.visits v
WHERE t.visit_id = v.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.level3_logs WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'level3_logs: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.level3_logs ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.level3_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level3_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.level3_logs;
CREATE POLICY org_isolation ON public.level3_logs
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.level3_logs IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 9. public.trash_volume_logs ──────────────────────────────
BEGIN;

ALTER TABLE public.trash_volume_logs ADD COLUMN org_id bigint;

UPDATE public.trash_volume_logs t
SET org_id = v.org_id
FROM core.visits v
WHERE t.visit_id = v.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.trash_volume_logs WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'trash_volume_logs: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.trash_volume_logs ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.trash_volume_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trash_volume_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.trash_volume_logs;
CREATE POLICY org_isolation ON public.trash_volume_logs
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.trash_volume_logs IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 10. public.stop_photos ───────────────────────────────────
-- Processed AFTER route_run_stops (#1) so the 2-hop join can use
-- route_run_stops.org_id directly.
BEGIN;

ALTER TABLE public.stop_photos ADD COLUMN org_id bigint;

UPDATE public.stop_photos sp
SET org_id = rrs.org_id
FROM public.route_run_stops rrs
WHERE sp.route_run_stop_id = rrs.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stop_photos WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'stop_photos: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.stop_photos ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.stop_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stop_photos FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.stop_photos;
CREATE POLICY org_isolation ON public.stop_photos
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.stop_photos IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 11. public.lead_route_overrides ──────────────────────────
-- 0 rows — soft join to route_pools; assertion passes trivially.
BEGIN;

ALTER TABLE public.lead_route_overrides ADD COLUMN org_id bigint;

UPDATE public.lead_route_overrides lro
SET org_id = rp.org_id
FROM public.route_pools rp
WHERE lro.pool_id = rp.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lead_route_overrides WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'lead_route_overrides: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.lead_route_overrides ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.lead_route_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_route_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.lead_route_overrides;
CREATE POLICY org_isolation ON public.lead_route_overrides
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.lead_route_overrides IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 12. public.stops_legacy ──────────────────────────────────
-- 14,916 rows. All rows verified to have non-null asset_id
-- (confirmed pre-migration: 0 NULL asset_id rows). No orphan handling needed.
BEGIN;

ALTER TABLE public.stops_legacy ADD COLUMN org_id bigint;

UPDATE public.stops_legacy sl
SET org_id = a.org_id
FROM public.assets a
WHERE sl.asset_id = a.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stops_legacy WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'stops_legacy: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.stops_legacy ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.stops_legacy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stops_legacy FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.stops_legacy;
CREATE POLICY org_isolation ON public.stops_legacy
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.stops_legacy IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 13. public.transit_stop_assets ───────────────────────────
BEGIN;

ALTER TABLE public.transit_stop_assets ADD COLUMN org_id bigint;

UPDATE public.transit_stop_assets tsa
SET org_id = a.org_id
FROM public.assets a
WHERE tsa.asset_id = a.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.transit_stop_assets WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'transit_stop_assets: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.transit_stop_assets ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.transit_stop_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transit_stop_assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.transit_stop_assets;
CREATE POLICY org_isolation ON public.transit_stop_assets
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.transit_stop_assets IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;

-- ── 14. public.asset_external_ids ────────────────────────────
BEGIN;

ALTER TABLE public.asset_external_ids ADD COLUMN org_id bigint;

UPDATE public.asset_external_ids aei
SET org_id = a.org_id
FROM public.assets a
WHERE aei.asset_id = a.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.asset_external_ids WHERE org_id IS NULL) THEN
    RAISE EXCEPTION 'asset_external_ids: NULL org_id found after backfill';
  END IF;
END $$;

ALTER TABLE public.asset_external_ids ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.asset_external_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_external_ids FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.asset_external_ids;
CREATE POLICY org_isolation ON public.asset_external_ids
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.asset_external_ids IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable.';

COMMIT;
