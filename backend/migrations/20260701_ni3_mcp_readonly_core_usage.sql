-- ============================================================
-- Grant USAGE ON SCHEMA core to mcp_readonly (NI-3, part 2)
-- 2026-07-01 — closes a chain gap found by the NI-3 recon (card 38d67f84):
--
-- WHY THIS EXISTS
-- 20260611_mcp_readonly_canonical_grant_provision.sql grants mcp_readonly SELECT
-- on 13 core.* objects (14 after 20260617 adds v_observation_normalized), but the
-- chain never grants the role USAGE on schema core — only fieldpro_admin,
-- intelligence_reader, audit_reader, and fieldpro hold it. Table-level SELECT is
-- dead without schema USAGE: every canonical read as mcp_readonly fails with
-- "permission denied for schema core". This migration makes the 14 core.* grants
-- exercisable.
--
-- NOT ENV-GATED, on purpose. USAGE on a schema confers no read/write by itself —
-- object access is still governed entirely by the per-object SELECT grants, and the
-- labor-safety identity wall is grant-level (zero privileges on the actor-audit
-- sidecars / identity_directory / route_runs; see 20260611 header §NEVER GRANTED).
-- The prod-safety gate for this role is its LOGIN attribute (sibling migration
-- 20260701_ni3_mcp_readonly_login_env_gated.sql): a prod build ships the role
-- NOLOGIN, so schema USAGE with no possible session is inert. Keeping USAGE
-- unconditional means every build reproduces the same privilege posture — the
-- whole point of the ISSUE-038/039 recording discipline.
--
-- SCOPE: USAGE only. Never CREATE on core (asserted below). Never touches the
-- 31-object SELECT set. Idempotent: GRANT re-asserts the same privilege.
-- ============================================================

BEGIN;

GRANT USAGE ON SCHEMA core TO mcp_readonly;

-- Assert exactly USAGE landed: USAGE present, CREATE absent (widening CREATE would
-- let the diagnostic role make objects inside the canonical schema — never wanted).
DO $$
BEGIN
  IF NOT has_schema_privilege('mcp_readonly', 'core', 'USAGE') THEN
    RAISE EXCEPTION 'NI-3: GRANT USAGE ON SCHEMA core TO mcp_readonly did not take effect';
  END IF;
  IF has_schema_privilege('mcp_readonly', 'core', 'CREATE') THEN
    RAISE EXCEPTION 'NI-3: mcp_readonly unexpectedly holds CREATE on schema core — privilege wider than intended';
  END IF;
END $$;

COMMIT;
