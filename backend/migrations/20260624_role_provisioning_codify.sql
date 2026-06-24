-- ============================================================
-- Codify the privilege-role layer + runtime grants into the runner (role-provisioning fix)
-- 2026-06-24 — ISSUE-039 class, one layer down: roles, not grants. Permanent ISSUE-025 fix.
--              Option A (see docs/audit/2026-06-23-role-provisioning-fix.md).
--
-- WHY THIS EXISTS
-- The read roles already reproduce from version control (intelligence_reader + audit_reader in
-- 20260530_sidecar_extraction_a; mcp_readonly in 20260611). The privilege roles + runtime grants
-- did not: a fresh `docker-compose` init makes POSTGRES_USER=fieldpro a SUPERUSER, which silently
-- disables FORCE ROW LEVEL SECURITY (superusers bypass RLS). RLS is the structural labor-safety
-- wall, so a superuser app role is a latent labor-safety defect (ISSUE-025). This migration makes
-- a fresh init reproduce the correct posture + grants from version control.
--
-- OPTION A — provisioner runs the chain (member of fieldpro + BYPASSRLS); app role is grantee
--   The merged chain assumes its runner can `SET ROLE fieldpro` / `OWNER TO fieldpro`
--   (20260613_p1_2) and can write FORCE-RLS tables without org-context (the RLS-phase backfills).
--   That chain is merged and MUST NOT be modified. So the provisioner `fieldpro_admin` is granted
--   membership in `fieldpro` (so SET ROLE / OWNER TO fieldpro work — without it the chain fails at
--   20260613_p1_2: "must be member of role fieldpro") and BYPASSRLS (so the backfills are not
--   RLS-filtered — without it the chain fails at 20260518_rls_phase2: "query would be affected by
--   row-level security policy"). The provisioner thus OWNS the objects it creates; the app role
--   `fieldpro` therefore needs explicit grants (section 3/4) to read/write them — empirically
--   confirmed: a fresh build run as `fieldpro_admin` leaves `fieldpro` with "permission denied"
--   until granted. This is the standard owner=runner / grantee=app model.
--   The provisioner's two extra attributes (BYPASSRLS, fieldpro-membership) are admin-tier and
--   strictly LESS than the `postgres` superuser it replaces. The labor-safety guarantee that
--   matters is UNTOUCHED: the APP connects as `fieldpro`, which stays NOSUPERUSER NOBYPASSRLS, so
--   RLS still enforces on the app path (proven in the gate proof, not inferred). Option B — a
--   separate non-super app role so the runner need not be `fieldpro` — is the cleaner end state
--   but changes the app connection, the reserved ISSUE-018 decision; intentionally NOT done here.
--
-- TWO-PHASE RUN-AS / BOOTSTRAP (documented, not silently assumed)
--   `fieldpro_admin` is provisioned by a one-time superuser BOOTSTRAP before the chain runs — it
--   sets the role's LOGIN secret (dev: gitignored backend/.env `FIELDPRO_ADMIN_PASSWORD`; prod:
--   Azure Key Vault), the BYPASSRLS attribute, and `GRANT fieldpro TO fieldpro_admin` (all need a
--   superuser, so they cannot live in a migration run by the non-super provisioner). Thereafter the
--   chain runs AS `fieldpro_admin`. The guarded CREATE below is a safety-net no-op. The
--   `ALTER ROLE fieldpro NOSUPERUSER` downgrade also needs a superuser, so it is GUARDED to fire
--   only when `fieldpro` is actually still elevated (the fresh-compose case, where the FIRST
--   migrate runs as the bootstrap superuser `fieldpro` itself). Otherwise a true no-op.
--
-- EXCLUSIONS: `pgcrypto` is extension-owned (never reassigned). Read roles unchanged. Live dev's
-- split ownership (fieldpro + break-glass `postgres`) is a SEPARATE tracked reconcile.
--
-- IDEMPOTENT: guarded CREATE; guarded ALTER no-ops once correct; GRANT / ALTER DEFAULT PRIVILEGES
-- re-assert the same privileges. Recorded by the runner. Additive only.
-- ============================================================

BEGIN;

-- 1. Provisioner role of record (safety-net; real create + BYPASSRLS + fieldpro-membership +
--    login secret are the one-time superuser BOOTSTRAP — see header). No password literal here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fieldpro_admin') THEN
    CREATE ROLE fieldpro_admin LOGIN CREATEDB CREATEROLE NOSUPERUSER BYPASSRLS;
  END IF;
END $$;

-- 2. PERMANENT ISSUE-025 FIX. The app/runtime role must NEVER be SUPERUSER or BYPASSRLS, or FORCE
--    ROW LEVEL SECURITY silently stops enforcing. GUARDED (changing super/bypass needs a superuser;
--    only fires on a freshly-promoted compose init, run by the bootstrap superuser).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fieldpro' AND (rolsuper OR rolbypassrls)) THEN
    EXECUTE 'ALTER ROLE fieldpro WITH NOSUPERUSER NOBYPASSRLS';
  END IF;
END $$;

-- 3. Runtime least-privilege grants for the app role on EXISTING objects (the provisioner owns
--    them and is a member of fieldpro, so it may grant). Matches backend/src/db.ts: pooled
--    SELECT/INSERT/UPDATE/DELETE under withOrgContext + nextval on sequences. RLS still applies to
--    fieldpro on FORCE-RLS tables (it is NOSUPERUSER NOBYPASSRLS) — these grants are object-level
--    permission, not an RLS exemption.
GRANT USAGE ON SCHEMA core, public TO fieldpro;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core, public TO fieldpro;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core, public TO fieldpro;

-- 4. Default privileges for FUTURE objects the provisioner creates (owner=runner payoff: a new
--    table is usable by fieldpro with no manual grant).
ALTER DEFAULT PRIVILEGES FOR ROLE fieldpro_admin IN SCHEMA core, public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fieldpro;
ALTER DEFAULT PRIVILEGES FOR ROLE fieldpro_admin IN SCHEMA core, public
  GRANT USAGE, SELECT ON SEQUENCES TO fieldpro;

COMMIT;
