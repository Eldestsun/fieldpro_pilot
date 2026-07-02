-- ============================================================
-- ISSUE-053 followup: org FK on public.audit_log (the compliance audit trail)
-- 2026-07-01
--
-- WHY THIS EXISTS
-- audit_log was the one org-scoped public.* table left out of the
-- 20260701_issue053 FK pass (outside that card's named set; kept-table status
-- confirmed by the 2026-07-01 audit_log recon: it IS the sanctioned S1-1
-- compliance audit surface, not a droppable feature). org_id has been bigint
-- since Phase 3 (20260518_rls_phase3), so this is type-clean — no cast.
--
-- ON DELETE RESTRICT — deliberate compliance-integrity choice, not an
-- inherited default: an organization row must not vanish while its compliance
-- audit trail exists. The one legitimate audit-purge path (S1-4
-- export-and-delete /execute) deletes the org's audit_log rows in-transaction
-- via the gated audit_log_delete policy BEFORE any org-level deletion would
-- occur, so RESTRICT never blocks it. Any other org deletion attempt while
-- audit rows exist SHOULD refuse — that refusal is the point.
--
-- SCOPE: FK only. audit_log's RLS posture — audit_log_select /
-- audit_log_insert (MT-2 fail-closed) + the gated audit_log_delete — is NOT
-- touched. No grant, role, or identity object is touched.
-- Orphan gate: ADD CONSTRAINT validates existing rows; orphaned org_ids fail
-- the migration loudly (live dev verified 0 orphans pre-authoring).
-- Idempotent: guarded on pg_constraint.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass
      AND conname  = 'audit_log_org_id_fkey'
  ) THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_org_id_fkey FOREIGN KEY (org_id)
      REFERENCES public.organizations(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Assert the FK exists and the RLS policy set is intact (3 policies).
DO $$
DECLARE policy_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass
      AND conname  = 'audit_log_org_id_fkey'
      AND contype  = 'f'
      AND confrelid = 'public.organizations'::regclass
  ) THEN
    RAISE EXCEPTION 'ISSUE-053c: audit_log org FK missing after apply';
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policy WHERE polrelid = 'public.audit_log'::regclass;
  IF policy_count <> 3 THEN
    RAISE EXCEPTION 'ISSUE-053c: audit_log policy count changed (% instead of 3) — this migration must not touch RLS', policy_count;
  END IF;
END $$;

COMMIT;
