-- ============================================================
-- Provision audit_reader + its identity-read grant set (ISSUE-028, feeds ISSUE-031/Q-F)
-- 2026-08-16 — Parallel-Infra / P1 export-channel role split
--
-- WHY THIS EXISTS
-- The sidecar-extraction era described an audit_reader role holding SELECT on the
-- four core.*_actor_audit identity sidecars for the legitimate audit/export
-- channel (KNOWN_ISSUES §ISSUE-028; live-repo-audit §9e). Those grants were never
-- version-controlled and have since DRIFTED AWAY: the 2026-08-16 recon shows the
-- live role exists (NOLOGIN) with **zero** grants on the sidecars — the exact
-- out-of-band-grant drift class ISSUE-039/ISSUE-040 name. This migration is the
-- runner-owned, idempotent statement of the role's existence + privilege posture,
-- so every environment (dev, CI clean-room, future Azure) ends in the SAME state.
--
-- THE CHANNEL DESIGN (Q-F)
-- audit_reader is the ONLY application channel permitted to read worker identity
-- from the sidecars. The export paths (exportDeleteRoutes, sftpExport) route
-- their sidecar-joining queries through a dedicated audit_reader pool
-- (backend/src/db.ts getAuditPool / withAuditOrgContext — fail-closed: no
-- password, no channel; NEVER a silent fallback to the app role). fieldpro keeps
-- its sidecar privileges for now because the WRITE paths (visit/observation/
-- evidence/assignment sidecar INSERTs) run as fieldpro; narrowing fieldpro to
-- INSERT-only is the ISSUE-018-adjacent runtime-binding follow-on, deliberately
-- NOT folded in here (two phase-correct changes beat one bundled change).
--
-- ROLE PROVISIONING: same convention as 20260611 (mcp_readonly): guarded CREATE,
-- NOLOGIN in version control — the LOGIN attribute + password are a SECRET owned
-- by environment bootstrap (dev: hand ALTER + backend/.env AUDIT_READER_PASSWORD;
-- CI: throwaway per-run password in the workflow, precedent = fieldpro_test).
-- This migration owns EXISTENCE + PRIVILEGE POSTURE only, never the credential.
--
-- ── GRANTED (9 objects) ──────────────────────────────────────────────────────
--   USAGE  on schema core
--   SELECT on core.visit_actor_audit, core.observation_actor_audit,
--             core.evidence_actor_audit, core.assignment_actor_audit  (identity)
--   SELECT on core.visits, core.observations, core.evidence,
--             core.assignments  (the base rows the export joins identity onto)
--
-- ── NEVER GRANTED (asserted below) ───────────────────────────────────────────
--   No BYPASSRLS (org isolation binds on this channel — reads run under
--   app.current_org_id like every other channel).
--   intelligence_reader / mcp_readonly stay at ZERO on all four sidecars —
--   re-asserted here as a regression guard (the labor-safety grant wall).
--
-- RLS NOTE: the sidecars are FORCE ROW LEVEL SECURITY with org policies;
-- audit_reader reads return zero rows without app.current_org_id set
-- (PATTERN-001). withAuditOrgContext owns that contract in app code.
--
-- Idempotent: guarded CREATE ROLE; GRANTs re-assert; asserts are read-only.
-- ROLLBACK: REVOKE the grants; the role itself is cluster-global, leave it.
-- ============================================================

BEGIN;

-- 1. Role exists (cluster-global; dev already has it, a fresh cluster does not).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_reader') THEN
    CREATE ROLE audit_reader NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- 2. Posture guard: this role must never bypass RLS (org isolation stays binding
--    on the audit channel). ASSERT-ONLY, not ALTER — the runner connects as
--    fieldpro_admin (CREATEROLE, non-super), which cannot touch the
--    SUPERUSER/BYPASSRLS attributes even to restate their absence. The guarded
--    CREATE above establishes the correct posture on a fresh cluster; on an
--    existing cluster a wrong posture is a hand-mutation that must fail the
--    chain loudly, not be silently "fixed".
DO $$
DECLARE r pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'audit_reader';
  IF r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole THEN
    RAISE EXCEPTION
      'ISSUE-028 guard: audit_reader posture breach (super=% bypassrls=% createdb=% createrole=%) — a superuser must strip the attribute; this chain will not proceed over it',
      r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole;
  END IF;
END $$;

-- 3. The grant set.
GRANT USAGE ON SCHEMA core TO audit_reader;

GRANT SELECT ON core.visit_actor_audit       TO audit_reader;
GRANT SELECT ON core.observation_actor_audit TO audit_reader;
GRANT SELECT ON core.evidence_actor_audit    TO audit_reader;
GRANT SELECT ON core.assignment_actor_audit  TO audit_reader;

GRANT SELECT ON core.visits       TO audit_reader;
GRANT SELECT ON core.observations TO audit_reader;
GRANT SELECT ON core.evidence     TO audit_reader;
GRANT SELECT ON core.assignments  TO audit_reader;

-- 4. Regression guard — the labor-safety wall. The diagnostic/intelligence roles
--    must hold NOTHING on any sidecar. If a future change (or hand-applied
--    grant) reopens this, the migration chain itself goes red.
DO $$
DECLARE breach text;
BEGIN
  SELECT string_agg(format('%s on %s', r.rolname, t.tbl), '; ')
  INTO breach
  FROM (VALUES ('intelligence_reader'), ('mcp_readonly')) AS r(rolname)
  CROSS JOIN (VALUES ('core.visit_actor_audit'), ('core.observation_actor_audit'),
                     ('core.evidence_actor_audit'), ('core.assignment_actor_audit')) AS t(tbl)
  WHERE EXISTS (SELECT 1 FROM pg_roles pr WHERE pr.rolname = r.rolname)
    AND has_table_privilege(r.rolname, t.tbl, 'SELECT,INSERT,UPDATE,DELETE');

  IF breach IS NOT NULL THEN
    RAISE EXCEPTION 'ISSUE-028 guard: diagnostic role holds sidecar privilege — %', breach;
  END IF;
END $$;

-- 5. Write-path guard: fieldpro must still be able to write the sidecars (the
--    §3.2 identity writes run as the app role; Q-F moves READS only).
DO $$
BEGIN
  IF NOT (has_table_privilege('fieldpro', 'core.visit_actor_audit', 'INSERT')
      AND has_table_privilege('fieldpro', 'core.observation_actor_audit', 'INSERT')
      AND has_table_privilege('fieldpro', 'core.evidence_actor_audit', 'INSERT')
      AND has_table_privilege('fieldpro', 'core.assignment_actor_audit', 'INSERT')) THEN
    RAISE EXCEPTION 'ISSUE-028 guard: fieldpro lost sidecar INSERT — the identity write path would break';
  END IF;
END $$;

COMMIT;
