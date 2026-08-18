-- ============================================================
-- ISSUE-062 — Extract assignment identity off route_runs (app-only sidecar)
-- 2026-08-18 — P1.5 Guarantee-Activation / identity-free operational frame
--
-- FOUNDER DECISION (2026-08-18, recorded on the ISSUE-062 card):
-- keep the encrypted core.*_actor_audit sidecars in core (capture integrity:
-- FK + same-transaction write + RLS + key mgmt); extract the OPERATIONAL
-- assignment identity off public.route_runs so the run frame carries zero
-- identity columns. Identity's two legitimate homes after this migration:
--   1. capture integrity  -> core.*_actor_audit (encrypted, no-grant, break-glass)
--   2. operational routing/display -> public.route_run_assignment (THIS table,
--      app-role only; the plaintext store the app uses to send a specialist
--      their stops and show the Lead the assigned crew name)
-- route_runs itself becomes the identity-free operational frame that
-- P4-Reporting reads directly. The legacy integer user_id column (never
-- populated, LEGACY_TRANSIT_USER_ID = 0 constant) drops with the OIDs.
--
-- ── GRANTED ──────────────────────────────────────────────────────────────────
--   fieldpro (app role): SELECT, INSERT, UPDATE, DELETE on route_run_assignment
-- ── NEVER GRANTED (asserted below — the labor-safety wall) ───────────────────
--   intelligence_reader, mcp_readonly, audit_reader: nothing. The reporting
--   channel reads the identity-free frame + core; the worker↔route fact is
--   app-operational only.
--
-- Idempotent: guarded CREATE/POLICY/INDEX; backfill + column drop are
-- conditional on the source columns still existing, so a re-run after the
-- drop is a no-op. Runner-recorded per ISSUE-038.
-- ============================================================

BEGIN;

-- 1. The app-only assignment sidecar (1:1 with route_runs; PK = route_run_id).
--    `active` is reserved for a future assignment-history model; the current
--    model is single current-assignment per run (cancel = assigned_user_oid NULL).
CREATE TABLE IF NOT EXISTS public.route_run_assignment (
  route_run_id      bigint PRIMARY KEY
                      REFERENCES public.route_runs(id) ON DELETE CASCADE,
  org_id            bigint NOT NULL REFERENCES public.organizations(id),
  assigned_user_oid text,
  created_by_oid    text,
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  active            boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_route_run_assignment_assigned_user_oid
  ON public.route_run_assignment (assigned_user_oid);

-- 2. RLS — same fail-closed org_isolation shape as route_runs (MT-2).
ALTER TABLE public.route_run_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_run_assignment FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'route_run_assignment'
      AND policyname = 'org_isolation'
  ) THEN
    CREATE POLICY org_isolation ON public.route_run_assignment
      USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint)
      WITH CHECK (org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint);
  END IF;
END $$;

-- 3. App-role grant (mirrors route_runs' app surface).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_run_assignment TO fieldpro;

-- 4. Backfill THEN drop — conditional on the source columns still existing.
--    Runs as the bypassrls admin runner, so RLS does not filter the backfill
--    (PATTERN-001 satisfied by role, not by org context).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'route_runs'
      AND column_name = 'assigned_user_oid'
  ) THEN
    INSERT INTO public.route_run_assignment
      (route_run_id, org_id, assigned_user_oid, created_by_oid, assigned_at)
    SELECT id, org_id, assigned_user_oid, created_by_oid,
           COALESCE(updated_at, created_at)
    FROM public.route_runs
    WHERE assigned_user_oid IS NOT NULL OR created_by_oid IS NOT NULL
    ON CONFLICT (route_run_id) DO NOTHING;

    ALTER TABLE public.route_runs DROP COLUMN assigned_user_oid;
    ALTER TABLE public.route_runs DROP COLUMN IF EXISTS created_by_oid;
    ALTER TABLE public.route_runs DROP COLUMN IF EXISTS user_id;
  END IF;
END $$;

-- 5. The labor-safety wall, asserted.
--    5a. No read channel holds privilege on the sidecar.
DO $$
DECLARE breach text;
BEGIN
  SELECT string_agg(r.role_name, '; ')
  INTO breach
  FROM (VALUES ('intelligence_reader'), ('mcp_readonly'), ('audit_reader')) AS r(role_name)
  WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.role_name)
    AND has_table_privilege(r.role_name, 'public.route_run_assignment',
                            'SELECT,INSERT,UPDATE,DELETE');

  IF breach IS NOT NULL THEN
    RAISE EXCEPTION
      'ISSUE-062 wall breach: role(s) hold privilege on route_run_assignment: %', breach;
  END IF;
END $$;

--    5b. route_runs is identity-free — zero identity columns remain.
DO $$
DECLARE leftover text;
BEGIN
  SELECT string_agg(column_name, '; ')
  INTO leftover
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'route_runs'
    AND column_name IN ('assigned_user_oid', 'created_by_oid', 'user_id',
                        'actor_oid', 'captured_by_oid');

  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION
      'ISSUE-062: route_runs still carries identity column(s): %', leftover;
  END IF;
END $$;

COMMIT;
