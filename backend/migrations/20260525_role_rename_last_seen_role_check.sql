-- Role rename Phase 3 — identity_directory.last_seen_role CHECK constraint
--
-- Phase 1 (2026-05-19) introduced code-side dual-accept of the old/new role
-- strings and backfilled identity_directory rows (UL → Specialist,
-- Lead → Dispatch). Phase 2 reissued the Entra app role definitions.
-- Phase 3 (this migration) locks identity_directory.last_seen_role at the
-- DB boundary so any future writer that tries to reintroduce 'UL' or 'Lead'
-- — code regression, manual psql, restore from an old dump — fails at
-- INSERT/UPDATE time rather than silently re-corrupting the directory.
--
-- The constraint permits NULL.  identity_directory rows may exist before
-- Entra has reported a role for the account, and the pre-Phase-1 state
-- already included a NULL last_seen_role row.  Forbidding NULL would
-- require a separate backfill outside the scope of the role rename.
--
-- Idempotency.  DROP CONSTRAINT IF EXISTS before ADD CONSTRAINT so the
-- migration is safely re-runnable, per ISSUE-014's manifest-drift
-- guidance.  ALTER TABLE ADD CONSTRAINT validates existing rows; the
-- Phase 1 backfill plus the audit query in the changelog confirm the
-- live distribution is {Admin, Dispatch, Specialist, NULL} — all
-- satisfy the constraint.

BEGIN;

ALTER TABLE public.identity_directory
  DROP CONSTRAINT IF EXISTS identity_directory_last_seen_role_check;

ALTER TABLE public.identity_directory
  ADD CONSTRAINT identity_directory_last_seen_role_check
  CHECK (
    last_seen_role IS NULL
    OR last_seen_role IN ('Specialist', 'Dispatch', 'Admin')
  );

COMMENT ON CONSTRAINT identity_directory_last_seen_role_check
  ON public.identity_directory IS
  'Phase 3 role rename — locks last_seen_role to {Specialist, Dispatch, Admin} plus NULL. Reintroduction of UL/Lead must be a deliberate schema migration, not a regression.';

COMMIT;
