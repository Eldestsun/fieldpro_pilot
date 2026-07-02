-- ============================================================
-- Env-gated LOGIN provisioning for mcp_readonly (NI-3, part 1)
-- 2026-07-01 — codifies the LOGIN attribute that previously lived only as
-- hand-applied drift on the live dev DB (drift class #4 in
-- docs/audit/2026-06-27-clean-build-vs-live-diff.md; card 38d67f84).
--
-- WHY THIS EXISTS
-- 20260611 deliberately ships mcp_readonly NOLOGIN and declares its login
-- credential "environment-bootstrap-owned". In practice the dev LOGIN was set by
-- hand and never recorded, so the 2026-06-28 rebuild regressed it and the MCP
-- read tooling went down. Founder ruling on the NI-3 card (2026-07-01): codify
-- the LOGIN into the chain, env-gated — dev builds reproduce it, prod builds
-- provably ship NOLOGIN.
--
-- HOW THE GUARD DECIDES DEV-VS-PROD
-- The migration runner (backend/src/scripts/migrate.ts) copies the environment
-- variable MCP_READONLY_PASSWORD into the session GUC
-- app.mcp_readonly_password before applying migrations (parameterized
-- set_config — the secret never appears in SQL text or in version control).
--   * MCP_READONLY_PASSWORD set + non-empty  → DEV PATH: ALTER ROLE ... LOGIN
--     PASSWORD <env value>.
--   * absent / empty (any environment that does not define the secret — the
--     prod deployment path defines no MCP_READONLY_PASSWORD)  → PROD PATH:
--     ALTER ROLE ... NOLOGIN.
-- The gate is fail-closed: prod safety requires no configuration at all —
-- absence of the secret IS the prod posture. It is also self-healing: a chain
-- run without the secret actively re-asserts NOLOGIN, reverting any hand-set
-- login drift of the ISSUE-038/039 class. Because the prod path never handles a
-- password, no secret ever passes through prod migrate logs.
--
-- SCOPE: LOGIN attribute only. Grant set (31 SELECT objects, 20260611/20260612/
-- 20260617) and schema USAGE (sibling 20260701_ni3_mcp_readonly_core_usage.sql)
-- are owned elsewhere and NOT touched. The role must never be SUPERUSER or
-- BYPASSRLS (asserted below) — RLS fail-closed (MT-2) stays binding on every
-- session this login opens: without SET app.current_org_id a canonical read
-- returns 0 rows (PATTERN-001, and that is correct; see docs/dev/mcp-tools.md).
--
-- Idempotent + re-runnable: ALTER ROLE re-asserts the same end state either way.
-- DEV RECOVERY NOTE: migrations run once. If a dev build ran WITHOUT the secret
-- (role recorded NOLOGIN), re-provision the credential out-of-chain as
-- fieldpro_admin (ALTER ROLE mcp_readonly LOGIN PASSWORD '...') — sanctioned as
-- environment bootstrap, same class as the fieldpro_admin password itself
-- (db/init/00_bootstrap_provisioner.sh); the chain's posture is unchanged by it.
-- The right path is simply to have MCP_READONLY_PASSWORD exported (backend/.env)
-- whenever a dev rebuild runs migrate.
-- ============================================================

BEGIN;

DO $$
DECLARE
  pw text := NULLIF(current_setting('app.mcp_readonly_password', true), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcp_readonly') THEN
    RAISE EXCEPTION 'NI-3: role mcp_readonly does not exist — 20260611_mcp_readonly_canonical_grant_provision.sql must sort before this file';
  END IF;

  IF pw IS NOT NULL THEN
    -- DEV PATH: secret present in the migrate environment.
    EXECUTE format('ALTER ROLE mcp_readonly WITH LOGIN PASSWORD %L', pw);
    RAISE NOTICE 'NI-3 login gate: DEV path — mcp_readonly LOGIN provisioned from MCP_READONLY_PASSWORD';
  ELSE
    -- PROD PATH: no secret in the migrate environment. Actively assert NOLOGIN
    -- so the chain also heals hand-set login drift.
    ALTER ROLE mcp_readonly WITH NOLOGIN;
    RAISE NOTICE 'NI-3 login gate: PROD path — MCP_READONLY_PASSWORD absent; mcp_readonly asserted NOLOGIN';
  END IF;
END $$;

-- Posture assertion: the resulting role state must match the gate decision, and
-- the role must never carry SUPERUSER/BYPASSRLS (the identity wall and RLS
-- fail-closed both depend on it).
DO $$
DECLARE
  pw text := NULLIF(current_setting('app.mcp_readonly_password', true), '');
  r  record;
BEGIN
  SELECT rolcanlogin, rolsuper, rolbypassrls INTO r
  FROM pg_roles WHERE rolname = 'mcp_readonly';

  IF r.rolsuper OR r.rolbypassrls THEN
    RAISE EXCEPTION 'NI-3: mcp_readonly is SUPERUSER/BYPASSRLS (super=%, bypassrls=%) — labor-safety posture violated', r.rolsuper, r.rolbypassrls;
  END IF;

  IF (pw IS NOT NULL) <> r.rolcanlogin THEN
    RAISE EXCEPTION 'NI-3: login gate mismatch — secret present=%, rolcanlogin=%', (pw IS NOT NULL), r.rolcanlogin;
  END IF;
END $$;

COMMIT;
