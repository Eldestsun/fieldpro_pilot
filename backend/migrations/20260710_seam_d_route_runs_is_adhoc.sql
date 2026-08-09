-- ============================================================
-- SEAM-D D3a: route_runs.is_adhoc — run-level ad-hoc creation tag
-- 2026-07-10
--
-- Additive only: one boolean column, NOT NULL DEFAULT false, backfill-free
-- (PG fast-default; no table rewrite; existing rows read false = pool-origin).
-- No drops, no RLS/policy/grant changes, no index (list queries already scan
-- route_runs by run_date/status; is_adhoc is a projection column).
--
-- Run-level tag ONLY: route_run_stops.origin_type semantics are untouched.
-- The flag is set exclusively by an EXPLICIT body flag on POST /route-runs
-- (operator ruling) — the server never infers it from stop_ids[] presence.
--
-- Idempotent via IF NOT EXISTS. Applied through the runner ONLY (ISSUE-038:
-- no out-of-band psql; the runner records this file in schema_migrations in
-- the same transaction it applies it).
-- ============================================================

ALTER TABLE public.route_runs
  ADD COLUMN IF NOT EXISTS is_adhoc boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'route_runs'
      AND column_name = 'is_adhoc'
  ) THEN
    RAISE EXCEPTION 'SEAM-D D3a: route_runs.is_adhoc missing after apply';
  END IF;
END $$;
