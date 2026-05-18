-- ============================================================
-- Phase 3 — Schema Hardening: Structural Fixes + Route Pool Model
-- 2026-05-18
--
-- Part A: audit_log.org_id type change uuid → bigint + policy fix
-- Part B: WITH CHECK on core.asset_locations + core.location_external_ids
-- Part C: route_runs.shift_type column
-- Part D: stop_pool_memberships junction table
-- ============================================================

-- ── Part A: audit_log structural fix ─────────────────────────────────────────

BEGIN;

-- Step 1: add new bigint column
ALTER TABLE public.audit_log ADD COLUMN org_id_numeric bigint;

-- Step 2: backfill — single-tenant pilot, all data belongs to org 1 (King County Metro)
UPDATE public.audit_log SET org_id_numeric = 1;

-- Step 3: assert no NULLs remain
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.audit_log WHERE org_id_numeric IS NULL) THEN
    RAISE EXCEPTION 'audit_log: NULL org_id_numeric found after backfill';
  END IF;
END $$;

ALTER TABLE public.audit_log ALTER COLUMN org_id_numeric SET NOT NULL;

-- Step 4: set organizations.tenant_uuid for KCM so resolveNumericOrgId() can look up by tenant JWT tid
UPDATE public.organizations
SET tenant_uuid = '66d756aa-edfd-46e9-895a-06d9e0e21f3a'
WHERE id = 1;

-- Step 5: drop all existing audit_log policies (they reference the uuid org_id column)
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
DROP POLICY IF EXISTS audit_log_delete ON public.audit_log;

-- Step 6: drop the old uuid column and its index
DROP INDEX IF EXISTS audit_log_org_occurred;
ALTER TABLE public.audit_log DROP COLUMN org_id;

-- Step 7: rename bigint column to org_id
ALTER TABLE public.audit_log RENAME COLUMN org_id_numeric TO org_id;

-- Step 8: restore index on new bigint column
CREATE INDEX audit_log_org_occurred ON public.audit_log (org_id, occurred_at DESC);

-- Step 9: create corrected RLS policies
-- SELECT: org-scoped. COALESCE bypass allows migration/seed scripts to query without org context.
CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );

-- INSERT: org-scoped. COALESCE bypass allows writeAuditLog() to fire without withOrgContext wrapper.
CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );

-- DELETE: export/delete flow only. app.export_delete_org_id is now set as a numeric string (e.g. '1').
CREATE POLICY audit_log_delete ON public.audit_log
  FOR DELETE
  USING (
    current_setting('app.export_delete_active', true) = 'true'
    AND org_id = NULLIF(current_setting('app.export_delete_org_id', true), '')::bigint
  );

COMMENT ON POLICY audit_log_select ON public.audit_log IS
  'Phase 3: org isolation on bigint org_id. Empty app.current_org_id bypasses (migration/seed path).';
COMMENT ON POLICY audit_log_insert ON public.audit_log IS
  'Phase 3: org isolation on bigint org_id. Empty app.current_org_id bypasses (writeAuditLog path).';
COMMENT ON POLICY audit_log_delete ON public.audit_log IS
  'Phase 3: export-delete-only delete. Requires app.export_delete_active=true and matching numeric org_id.';

COMMIT;

-- ── Part B: WITH CHECK on core tables ────────────────────────────────────────

-- core.asset_locations had USING but no WITH CHECK
DROP POLICY IF EXISTS org_isolation ON core.asset_locations;
CREATE POLICY org_isolation ON core.asset_locations
  USING (org_id = current_setting('app.current_org_id', true)::bigint)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::bigint);
COMMENT ON POLICY org_isolation ON core.asset_locations IS
  'Phase 3: added WITH CHECK (was USING only). Prevents cross-tenant inserts/updates.';

-- core.location_external_ids had USING but no WITH CHECK
DROP POLICY IF EXISTS org_isolation ON core.location_external_ids;
CREATE POLICY org_isolation ON core.location_external_ids
  USING (org_id = current_setting('app.current_org_id', true)::bigint)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::bigint);
COMMENT ON POLICY org_isolation ON core.location_external_ids IS
  'Phase 3: added WITH CHECK (was USING only). Prevents cross-tenant inserts/updates.';

-- ── Part C: shift_type on route_runs ─────────────────────────────────────────

ALTER TABLE public.route_runs
  ADD COLUMN shift_type text NOT NULL DEFAULT 'day'
  CHECK (shift_type IN ('day', 'night', 'all_day'));

COMMENT ON COLUMN public.route_runs.shift_type IS
  'Shift context for the route. One of: day, night, all_day. Default: day.';

-- ── Part D: stop_pool_memberships junction table ──────────────────────────────

CREATE TABLE public.stop_pool_memberships (
    stop_id    text        NOT NULL REFERENCES public.transit_stops(stop_id) ON DELETE CASCADE,
    pool_id    text        NOT NULL REFERENCES public.route_pools(id) ON DELETE CASCADE,
    org_id     bigint      NOT NULL,
    shift_type text        DEFAULT NULL,
    active     boolean     NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (stop_id, pool_id)
);

ALTER TABLE public.stop_pool_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stop_pool_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.stop_pool_memberships
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON public.stop_pool_memberships IS
  'Phase 3: tenant isolation. Empty app.current_org_id bypasses (migration/seed path).';

-- Populate from current transit_stops.pool_id values
INSERT INTO public.stop_pool_memberships (stop_id, pool_id, org_id)
SELECT stop_id, pool_id, org_id
FROM public.transit_stops
WHERE pool_id IS NOT NULL;

-- Primary read path: pool + org filter on active memberships
CREATE INDEX idx_spm_pool_org ON public.stop_pool_memberships (pool_id, org_id)
  WHERE active = true;

-- Assert junction table is populated
DO $$
DECLARE
  spm_count bigint;
  ts_count  bigint;
BEGIN
  SELECT COUNT(*) INTO spm_count FROM public.stop_pool_memberships;
  SELECT COUNT(*) INTO ts_count  FROM public.transit_stops WHERE pool_id IS NOT NULL;
  IF spm_count != ts_count THEN
    RAISE EXCEPTION 'stop_pool_memberships row count (%) does not match transit_stops pool_id count (%)',
      spm_count, ts_count;
  END IF;
END $$;
