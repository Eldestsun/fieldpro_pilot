-- ============================================================
-- Provision intelligence_reader + its identity-free grant set (ISSUE-018)
-- 2026-08-16 — P1.5 Guarantee-Activation / intelligence channel wiring
--
-- WHY THIS EXISTS
-- The sidecar extraction (2026-06-01) provisioned intelligence_reader as the
-- no-identity-grant role, but its posture lived only as hand-applied grants
-- (ISSUE-040's drift class — audit_reader's set drifted to ZERO before
-- ISSUE-028 version-controlled it). This migration is the runner-owned,
-- idempotent statement of the role's existence + full privilege posture.
--
-- THE CHANNEL DESIGN (ISSUE-018, re-scoped post-031 per
-- planning/architecture/2026-06-06-issue-018-phase-0-context.md §6)
-- The intelligence consumer is the risk-map rebuild job
-- (riskMapService.rebuildStopRiskSnapshot): one transaction that reads the
-- identity-free canonical surface and writes the identity-free derived tables
-- (stop_risk_snapshot, stop_condition_history). One transaction = one
-- connection, so the WHOLE job runs on the intelligence channel — which is why
-- this "reader" role carries DML on its own two derived outputs and nothing
-- else. June's D-D finding ("cannot run as intelligence_reader — no INSERT
-- grant") is resolved by granting exactly those outputs, not by widening reads.
-- Control-Center reads stay on the app role deliberately: they are D5-scoped
-- OPERATIONAL surfaces and touch route_runs (assignment intent), which this
-- role must never reach.
--
-- PG14 NOTE (D-B / ISSUE-029, re-decided post-031 as the context doc §6.4
-- required): views still execute as their owner on PG14 (no security_invoker).
-- Accepted: the post-clip granted view set (v_observation_normalized, spine
-- translation views) is identity-free column-by-column and no view reaches a
-- sidecar; the moat is the sidecar no-grant + the runtime denial the channel
-- test proves. PG15 upgrade remains ISSUE-029.
--
-- ROLE PROVISIONING: same convention as 20260611/20260816 siblings — guarded
-- CREATE, NOLOGIN in version control; LOGIN + password are environment-owned
-- (dev .env INTELLIGENCE_READER_PASSWORD; CI throwaway per-run password).
--
-- ── GRANTED ──────────────────────────────────────────────────────────────────
--   USAGE  on schema core (re-assert)
--   SELECT (canonical, identity-free): core.observations, core.visits,
--          core.assignments, core.evidence, core.locations,
--          core.location_external_ids, core.v_observation_normalized
--   SELECT (vertical reference + derived, identity-free): public.transit_stops,
--          public.stop_risk_snapshot, public.stop_effort_history
--   DML on the job's own derived outputs: stop_risk_snapshot (INSERT, DELETE —
--          the rebuild is delete-and-rewrite per org under RLS),
--          stop_condition_history (INSERT) + USAGE on its id sequence
--
-- ── NEVER GRANTED (asserted below — the labor-safety wall) ───────────────────
--   The four core.*_actor_audit sidecars, public.identity_directory,
--   public.route_runs (assignment intent OIDs), public.audit_log.
--   No BYPASSRLS (org isolation binds; the job sets app.current_org_id).
--
-- Idempotent: guarded CREATE; GRANTs re-assert; asserts read-only.
-- ============================================================

BEGIN;

-- 1. Role exists (cluster-global).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'intelligence_reader') THEN
    CREATE ROLE intelligence_reader NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- 2. Posture guard — ASSERT-ONLY (a CREATEROLE runner cannot ALTER the
--    SUPERUSER/BYPASSRLS attributes; a breach fails the chain loudly).
DO $$
DECLARE r pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM pg_roles WHERE rolname = 'intelligence_reader';
  IF r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole THEN
    RAISE EXCEPTION
      'ISSUE-018 guard: intelligence_reader posture breach (super=% bypassrls=% createdb=% createrole=%)',
      r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole;
  END IF;
END $$;

-- 3. The grant set.
GRANT USAGE ON SCHEMA core TO intelligence_reader;

GRANT SELECT ON core.observations              TO intelligence_reader;
GRANT SELECT ON core.visits                    TO intelligence_reader;
GRANT SELECT ON core.assignments               TO intelligence_reader;
GRANT SELECT ON core.evidence                  TO intelligence_reader;
GRANT SELECT ON core.locations                 TO intelligence_reader;
GRANT SELECT ON core.location_external_ids     TO intelligence_reader;
GRANT SELECT ON core.asset_locations           TO intelligence_reader;
GRANT SELECT ON core.v_observation_normalized  TO intelligence_reader;

GRANT SELECT ON public.transit_stops           TO intelligence_reader;
GRANT SELECT ON public.stop_effort_history     TO intelligence_reader;

GRANT SELECT, INSERT, DELETE ON public.stop_risk_snapshot     TO intelligence_reader;
-- SELECT on stop_condition_history is required BY ITS OWN INSERT: the job's
-- `ON CONFLICT (stop_id, visit_id) DO NOTHING` names an explicit arbiter, and
-- Postgres demands SELECT on arbiter columns of the target table. Identity-free
-- table (R10: no worker column by design), so table-level SELECT is safe.
GRANT SELECT, INSERT         ON public.stop_condition_history TO intelligence_reader;
GRANT USAGE ON SEQUENCE public.stop_condition_history_id_seq  TO intelligence_reader;

-- 4. The labor-safety wall, asserted. intelligence_reader must hold ZERO
--    privilege on every identity-bearing object.
DO $$
DECLARE breach text;
BEGIN
  SELECT string_agg(t.tbl, '; ')
  INTO breach
  FROM (VALUES ('core.visit_actor_audit'), ('core.observation_actor_audit'),
               ('core.evidence_actor_audit'), ('core.assignment_actor_audit'),
               ('public.identity_directory'), ('public.route_runs'),
               ('public.audit_log')) AS t(tbl)
  WHERE to_regclass(t.tbl) IS NOT NULL
    AND has_table_privilege('intelligence_reader', t.tbl, 'SELECT,INSERT,UPDATE,DELETE');

  IF breach IS NOT NULL THEN
    RAISE EXCEPTION 'ISSUE-018 wall breach: intelligence_reader holds privilege on identity object(s): %', breach;
  END IF;
END $$;

COMMIT;
