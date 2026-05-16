-- ============================================================
-- R11 Change 1 — identity_directory tenant isolation
-- Adds org_id column, backfills KCM org (id=1),
-- adds NOT NULL constraint, enables RLS.
-- ============================================================

-- Step 1: add org_id column (nullable first for backfill)
ALTER TABLE public.identity_directory
  ADD COLUMN IF NOT EXISTS org_id bigint REFERENCES public.organizations(id);

-- Step 2: backfill all existing rows to KCM org
-- Assumes org id=1 is KCM — verify before running on production
UPDATE public.identity_directory SET org_id = 1 WHERE org_id IS NULL;

-- Step 3: enforce NOT NULL
ALTER TABLE public.identity_directory
  ALTER COLUMN org_id SET NOT NULL;

-- Step 4: index for lookup performance
CREATE INDEX IF NOT EXISTS idx_identity_directory_org_id
  ON public.identity_directory (org_id);

-- Step 5: enable RLS using the same pattern as core tables
ALTER TABLE public.identity_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_directory FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON public.identity_directory
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

-- Step 6: document the table's purpose and constraints
COMMENT ON TABLE public.identity_directory IS
  'Operational identity registry — maps Azure Entra OIDs to display names '
  'and roles for UI presentation and route assignment. '
  'Tenant-isolated via RLS on org_id. '
  'LABOR SAFETY: This table is the ONLY place worker identity is stored. '
  'No query in the intelligence layer (riskMapService, stop_risk_snapshot, '
  'stop_effort_history, stop_condition_history, AdminControlCenter) may '
  'JOIN to this table. The one controlled exception is loadRouteRunById '
  'in routeRunService.ts — documented there with justification. '
  'Any new JOIN to this table requires explicit review and comment.';
