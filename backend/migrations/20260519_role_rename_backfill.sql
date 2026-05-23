-- Role rename Phase 1 — identity_directory policy flip + role backfill
--
-- This migration does two things in a single transaction:
--
--   1. Brings identity_directory's RLS policy in line with the established
--      Phase 2 "unset = bypass" pattern from 20260518_rls_phase2_add_orgid.sql.
--      identity_directory was the lone RLS-protected table still on the
--      strict R11 shape (USING (org_id = current_setting(...)::bigint)),
--      which rejects all rows when app.current_org_id is unset and silently
--      no-ops migration-style writes from the non-privileged `fieldpro`
--      role. The replacement policy uses symmetric USING / WITH CHECK
--      clauses and adds the migration-bypass escape:
--
--          COALESCE(current_setting('app.current_org_id', true), '') = ''
--          OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
--
--      App request paths continue to set the variable via withOrgContext(),
--      so live tenant isolation is unchanged. The only semantic delta is
--      the unset-bypass — intentional.
--
--   2. Backfills public.identity_directory.last_seen_role for the role
--      rename:
--          UL    -> Specialist
--          Lead  -> Dispatch
--          Admin -> Admin   (unchanged; not touched here)
--
-- Locked rename table: planning/capability-build/CAPABILITY_BUILD_INDEX.md
-- Pre-flip audit + approved template: docs/KNOWN_ISSUES.md (PATTERN-001,
-- ISSUE-013); see also commit 25aecf8 for the prerequisite loadRouteRunById
-- org-scoping that closed the only fail-open path on identity_directory
-- reads before this policy widened.
--
-- Atomicity: DROP POLICY + CREATE POLICY + both UPDATEs run inside one
-- BEGIN/COMMIT. FORCE ROW LEVEL SECURITY stays on the table for the
-- entire transaction. If any statement fails, the whole transaction
-- rolls back and the strict R11 policy remains in place.
--
-- The brief in-transaction window between DROP and CREATE has no active
-- policy. With FORCE RLS on and no policy attached, PostgreSQL denies all
-- rows (fail-closed), so even the in-flight state is safe.
--
-- identity_directory.last_seen_role has no CHECK constraint, so no
-- constraint widening is required during the dual-accept window.
-- Phase 3 will add a CHECK restricting the column to the new role names
-- plus Admin.

BEGIN;

DROP POLICY IF EXISTS org_isolation ON public.identity_directory;

CREATE POLICY org_isolation ON public.identity_directory
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );

COMMENT ON POLICY org_isolation ON public.identity_directory IS
  'Phase 2 tenant isolation. Filters by app.current_org_id set via withOrgContext(). Migrations bypass via unset variable. Brought in line with 20260518_rls_phase2 pattern during role rename.';

UPDATE public.identity_directory
SET    last_seen_role = 'Specialist'
WHERE  last_seen_role = 'UL';

UPDATE public.identity_directory
SET    last_seen_role = 'Dispatch'
WHERE  last_seen_role = 'Lead';

COMMIT;
