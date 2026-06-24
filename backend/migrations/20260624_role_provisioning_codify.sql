-- ============================================================
-- Codify the privilege-role layer into the runner (role-provisioning drift fix)
-- 2026-06-24 — ISSUE-039 class, one layer down: roles, not grants. Permanent ISSUE-025 fix.
--
-- WHY THIS EXISTS
-- The read roles already reproduce from version control (intelligence_reader + audit_reader
-- in 20260530_sidecar_extraction_a; mcp_readonly in 20260611). The two PRIVILEGE roles did
-- not: `fieldpro` (the app/runtime role) and the provisioner were hand-mutated on live and a
-- fresh `docker-compose` init would produce the WRONG posture — it makes POSTGRES_USER=fieldpro
-- a SUPERUSER, which silently disables FORCE ROW LEVEL SECURITY (superusers bypass RLS). RLS is
-- the labor-safety wall, so a superuser app role is a latent labor-safety defect (this is
-- ISSUE-025, until now only worked around in CI). This migration makes a fresh init reproduce
-- the correct posture from version control. Recon ground truth:
-- docs/audit/2026-06-23-role-provisioning-drift-recon.md.
--
-- PROVISIONER PRIVILEGE LEVEL — Phase 0 evidence (why NOT superuser)
--   The migration chain forces neither SUPERUSER nor BYPASSRLS:
--     • Only CREATE EXTENSION is `pgcrypto`, a TRUSTED extension in PG13+ — installable by a
--       non-superuser that owns / has CREATE on the database (the provisioner does, via CREATEDB).
--     • No ALTER SYSTEM / server-parameter changes; no COPY ... FROM PROGRAM; no other
--       superuser-only construct.
--     • No CREATE/ALTER ROLE in the chain grants SUPERUSER or BYPASSRLS (the read roles are
--       NOLOGIN, no bypass — CREATEROLE is sufficient to create them).
--     • Consolidated executes ZERO data-seeding DML at migration time (its only `INSERT INTO`
--       is inside a trigger-function body, run later at app runtime under RLS). The FORCE-RLS
--       backfill migrations affect 0 rows on a fresh empty build (nothing to backfill), so they
--       neither require nor exercise BYPASSRLS on the gate path.
--     • No ALTER DEFAULT PRIVILEGES in the chain — no default-privilege/owner-consistency trap.
--   ⇒ Provisioner = CREATEDB CREATEROLE, explicitly NOSUPERUSER NOBYPASSRLS. (Operational caveat,
--     not a fresh-init requirement: backfilling a POPULATED database via these migrations would
--     need org-context or a bypass connection — that is a data-migration concern, not a reason to
--     widen the provisioner's standing privilege.)
--
-- THE LOGIN SECRET IS BOOTSTRAP-OWNED (same pattern as 20260611/mcp_readonly)
--   This migration creates `fieldpro_admin` WITHOUT a password literal. Its LOGIN password is a
--   bootstrap secret — dev: local `.env` / compose env; prod: Azure Key Vault — set out of band
--   (see docs/audit/2026-06-23-role-provisioning-fix.md § Provisioner password reset). Role +
--   non-secret posture live in version control here; the secret never does.
--
-- BOOTSTRAP / RUN-AS SEQUENCE (documented, not silently assumed)
--   Canonical model: migrations run as `fieldpro_admin`. On a brand-new cluster the bootstrap
--   must create `fieldpro_admin` (with its password) BEFORE the first `npm run migrate` — dev via
--   a compose/init step, prod via the provisioning pipeline. The guarded CREATE below is then a
--   safety-net no-op. The one statement that requires elevated rights is the `ALTER ROLE fieldpro
--   NOSUPERUSER` downgrade: removing SUPERUSER can only be done BY a superuser, so on a cluster
--   where a fresh compose init wrongly promoted `fieldpro`, the FIRST migrate must run as that
--   bootstrap superuser (which downgrades fieldpro here); thereafter `fieldpro` is non-super and
--   migrations run as `fieldpro_admin`. On any cluster where `fieldpro` is already non-super (e.g.
--   dev today, or a clean build under fieldpro_admin), this statement is a no-op a CREATEROLE
--   provisioner may run.
--
-- IDEMPOTENT: guarded CREATE; ALTER to the same posture is a no-op. Recorded by the runner.
-- ============================================================

BEGIN;

-- 1. Provisioner role of record. Replaces dependence on the default `postgres` superuser
--    (enterprise rule: the default superuser is not the provisioner of record). Least-privilege
--    per Phase 0: CREATEDB + CREATEROLE, explicitly NOSUPERUSER NOBYPASSRLS. No password literal
--    (login secret is bootstrap-owned).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fieldpro_admin') THEN
    CREATE ROLE fieldpro_admin LOGIN CREATEDB CREATEROLE NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

-- 2. PERMANENT ISSUE-025 FIX. The app/runtime role must NEVER be SUPERUSER or BYPASSRLS, or
--    FORCE ROW LEVEL SECURITY silently stops enforcing — and RLS is the structural labor-safety
--    wall (worker-scoped isolation). Idempotent: a no-op where `fieldpro` is already correct
--    (live), corrective where a fresh compose init wrongly promoted it to superuser. (See header:
--    on a freshly-promoted cluster this runs under the bootstrap superuser.)
ALTER ROLE fieldpro WITH NOSUPERUSER NOBYPASSRLS LOGIN;

COMMIT;
