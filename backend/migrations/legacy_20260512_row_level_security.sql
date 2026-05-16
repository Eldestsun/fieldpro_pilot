-- ============================================================
-- Tier 7 — Row Level Security: Canonical Layer Tenant Isolation
--
-- Enforces org_id filtering at the DB layer on the five canonical
-- tables. All operations (SELECT/INSERT/UPDATE/DELETE) are filtered
-- by the session variable app.current_org_id, set on every connection
-- checkout by backend/src/db.ts::withOrgContext().
--
-- Migration & superuser bypass:
--   The policy treats an UNSET (empty) app.current_org_id as a
--   bypass signal, so this migration script — and any future
--   migration that connects without setting org context — can read
--   and write every row. The application path always sets the
--   variable in withOrgContext(), so app code never hits the
--   bypass branch.
--
--   A Postgres superuser also bypasses RLS unconditionally; FORCE
--   ROW LEVEL SECURITY ensures table OWNERS are still subject to
--   policy when they do set the variable.
-- ============================================================

ALTER TABLE core.visits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.evidence    ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.locations   ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.visits      FORCE ROW LEVEL SECURITY;
ALTER TABLE core.observations FORCE ROW LEVEL SECURITY;
ALTER TABLE core.evidence    FORCE ROW LEVEL SECURITY;
ALTER TABLE core.assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE core.locations   FORCE ROW LEVEL SECURITY;

-- Drop any pre-existing policies so this migration is idempotent.
DROP POLICY IF EXISTS org_isolation ON core.visits;
DROP POLICY IF EXISTS org_isolation ON core.observations;
DROP POLICY IF EXISTS org_isolation ON core.evidence;
DROP POLICY IF EXISTS org_isolation ON core.assignments;
DROP POLICY IF EXISTS org_isolation ON core.locations;

-- core.visits — direct org_id column
CREATE POLICY org_isolation ON core.visits
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );

-- core.observations — direct org_id column (canonical writes set it)
CREATE POLICY org_isolation ON core.observations
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );

-- core.evidence — direct org_id column
CREATE POLICY org_isolation ON core.evidence
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );

-- core.assignments — direct org_id column
CREATE POLICY org_isolation ON core.assignments
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );

-- core.locations — direct org_id column
CREATE POLICY org_isolation ON core.locations
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );

COMMENT ON POLICY org_isolation ON core.visits IS
  'Tier 7 tenant isolation. Filters all ops by app.current_org_id, set by backend/src/db.ts::withOrgContext(). Migrations bypass via unset variable.';
COMMENT ON POLICY org_isolation ON core.observations IS
  'Tier 7 tenant isolation. Filters all ops by app.current_org_id, set by backend/src/db.ts::withOrgContext(). Migrations bypass via unset variable.';
COMMENT ON POLICY org_isolation ON core.evidence IS
  'Tier 7 tenant isolation. Filters all ops by app.current_org_id, set by backend/src/db.ts::withOrgContext(). Migrations bypass via unset variable.';
COMMENT ON POLICY org_isolation ON core.assignments IS
  'Tier 7 tenant isolation. Filters all ops by app.current_org_id, set by backend/src/db.ts::withOrgContext(). Migrations bypass via unset variable.';
COMMENT ON POLICY org_isolation ON core.locations IS
  'Tier 7 tenant isolation. Filters all ops by app.current_org_id, set by backend/src/db.ts::withOrgContext(). Migrations bypass via unset variable.';
