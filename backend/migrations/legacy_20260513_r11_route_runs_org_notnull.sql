-- ============================================================
-- R11 Change 3 — route_runs.org_id NOT NULL enforcement
-- ============================================================

-- Step 1: backfill any NULL rows to KCM org before constraining
UPDATE public.route_runs SET org_id = 1 WHERE org_id IS NULL;

-- Step 2: enforce NOT NULL
ALTER TABLE public.route_runs
  ALTER COLUMN org_id SET NOT NULL;

-- Step 3: add FK if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.route_runs'::regclass
      AND contype = 'f'
      AND conname = 'fk_route_runs_org'
  ) THEN
    ALTER TABLE public.route_runs
      ADD CONSTRAINT fk_route_runs_org
      FOREIGN KEY (org_id) REFERENCES public.organizations(id);
  END IF;
END $$;
