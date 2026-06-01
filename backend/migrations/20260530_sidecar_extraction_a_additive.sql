-- ============================================================
-- Sidecar extraction — Migration A (ADDITIVE, fully reversible)
-- 2026-05-30 — feat/sidecar-extraction
--
-- Makes invariant #1 (worker identity not readable by intelligence) STRUCTURAL,
-- per CANONICAL_STATE_LAYER_DESIGN.md §3.2. Worker identity currently lives in
-- plaintext, NOT NULL, on four canonical tables the intelligence layer can read:
--
--     core.visits.actor_oid            (+ S1-13 cipher: captured_by_oid_ciphertext / _key_id)
--     core.observations.created_by_oid
--     core.evidence.captured_by_oid
--     core.assignments.created_by_oid
--
-- This migration RELOCATES that identity into four no-grant sidecars and stands
-- up the role boundary. It does NOT drop the canonical columns — that is the
-- irreversible Migration B, run only after the sidecars are verified populated
-- and every reader/writer is repointed (additive-before-removing).
--
-- ── THE SIDECAR TEMPLATE (defined once; all four are the same shape) ──────────
--   core.<entity>_actor_audit (
--       <entity>_id          <pk-type> PRIMARY KEY REFERENCES core.<entity>(id) ON DELETE CASCADE,
--       org_id               bigint NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
--       actor_ref            text   NOT NULL,   -- worker OID (plaintext)
--       actor_ref_ciphertext bytea,             -- S1-13 envelope; see note
--       actor_ref_key_id     text,              -- S1-13 key id
--       recorded_at          timestamptz NOT NULL DEFAULT now()
--   );
--   RLS ENABLED + FORCED; org_isolation policy in the guarded COALESCE/NULLIF
--   form (PATTERN-001); index on org_id.
--
--   CIPHER SCOPE: the template carries actor_ref_ciphertext / actor_ref_key_id on
--   ALL FOUR sidecars for shape consistency, but they are POPULATED ONLY on
--   core.visit_actor_audit — that is the relocation of the S1-13 KMS-encryption
--   commitment (NIST SC-13/SC-28), which was scoped to core.visits. Extending
--   encryption to observation/evidence/assignment identity is a tracked follow-on
--   (KNOWN_ISSUES); because the columns already exist, that extension is a backfill,
--   not a schema migration. The no-grant role boundary below is what enforces
--   labor-safety for all four regardless of cipher state.
--
-- ON DELETE CASCADE on every sidecar PK means the GDPR export-delete path
-- (exportDeleteRoutes.ts) purges identity automatically when the parent canonical
-- row is deleted — no separate sidecar delete needed.
--
-- The four NOT NULL identity columns are made NULLABLE here (expand/contract) so
-- the repointed write paths can write identity to the sidecar INSTEAD of the
-- canonical row in the A→B window. Values are retained until Migration B drops
-- the columns. This migration is fully reversible (see rollback/20260530_sidecar_extraction_a_rollback.sql).
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. SIDECAR TABLES (+ RLS + guarded org_isolation policy + org_id index)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. core.visit_actor_audit  (carries the relocated S1-13 cipher)
CREATE TABLE IF NOT EXISTS core.visit_actor_audit (
    visit_id             bigint PRIMARY KEY REFERENCES core.visits(id) ON DELETE CASCADE,
    org_id               bigint NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    actor_ref            text   NOT NULL,
    actor_ref_ciphertext bytea,
    actor_ref_key_id     text,
    recorded_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE core.visit_actor_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.visit_actor_audit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON core.visit_actor_audit;
CREATE POLICY org_isolation ON core.visit_actor_audit
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
CREATE INDEX IF NOT EXISTS visit_actor_audit_org_idx ON core.visit_actor_audit (org_id);
COMMENT ON TABLE core.visit_actor_audit IS
  'Identity sidecar for core.visits (CANONICAL_STATE_LAYER_DESIGN §3.2). actor_ref = worker OID. Cipher columns hold the relocated S1-13 KMS envelope. No grant to intelligence_reader — labor-safety boundary is structural here.';

-- 1b. core.observation_actor_audit
CREATE TABLE IF NOT EXISTS core.observation_actor_audit (
    observation_id       bigint PRIMARY KEY REFERENCES core.observations(id) ON DELETE CASCADE,
    org_id               bigint NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    actor_ref            text   NOT NULL,
    actor_ref_ciphertext bytea,
    actor_ref_key_id     text,
    recorded_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE core.observation_actor_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.observation_actor_audit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON core.observation_actor_audit;
CREATE POLICY org_isolation ON core.observation_actor_audit
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
CREATE INDEX IF NOT EXISTS observation_actor_audit_org_idx ON core.observation_actor_audit (org_id);
COMMENT ON TABLE core.observation_actor_audit IS
  'Identity sidecar for core.observations (§3.2). actor_ref = worker OID. No grant to intelligence_reader.';

-- 1c. core.evidence_actor_audit
CREATE TABLE IF NOT EXISTS core.evidence_actor_audit (
    evidence_id          bigint PRIMARY KEY REFERENCES core.evidence(id) ON DELETE CASCADE,
    org_id               bigint NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    actor_ref            text   NOT NULL,
    actor_ref_ciphertext bytea,
    actor_ref_key_id     text,
    recorded_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE core.evidence_actor_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.evidence_actor_audit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON core.evidence_actor_audit;
CREATE POLICY org_isolation ON core.evidence_actor_audit
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
CREATE INDEX IF NOT EXISTS evidence_actor_audit_org_idx ON core.evidence_actor_audit (org_id);
COMMENT ON TABLE core.evidence_actor_audit IS
  'Identity sidecar for core.evidence (§3.2). actor_ref = worker OID. No grant to intelligence_reader.';

-- 1d. core.assignment_actor_audit
CREATE TABLE IF NOT EXISTS core.assignment_actor_audit (
    assignment_id        bigint PRIMARY KEY REFERENCES core.assignments(id) ON DELETE CASCADE,
    org_id               bigint NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    actor_ref            text   NOT NULL,
    actor_ref_ciphertext bytea,
    actor_ref_key_id     text,
    recorded_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE core.assignment_actor_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.assignment_actor_audit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON core.assignment_actor_audit;
CREATE POLICY org_isolation ON core.assignment_actor_audit
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
CREATE INDEX IF NOT EXISTS assignment_actor_audit_org_idx ON core.assignment_actor_audit (org_id);
COMMENT ON TABLE core.assignment_actor_audit IS
  'Identity sidecar for core.assignments (§3.2). actor_ref = worker OID. No grant to intelligence_reader.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. BACKFILL existing identity into the sidecars (10 rows in dev: 1/3/2/4).
--    Runs with org_isolation in force; the migrate runner sets app.current_org_id
--    or runs as a bypassrls role. Guard: if neither, the INSERTs see 0 source rows
--    and the assertion in §5 fails loudly rather than silently under-backfilling.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO core.visit_actor_audit (visit_id, org_id, actor_ref, actor_ref_ciphertext, actor_ref_key_id)
SELECT v.id, v.org_id, v.actor_oid, v.captured_by_oid_ciphertext, v.captured_by_oid_key_id
FROM core.visits v
WHERE v.actor_oid IS NOT NULL
ON CONFLICT (visit_id) DO NOTHING;

INSERT INTO core.observation_actor_audit (observation_id, org_id, actor_ref)
SELECT o.id, o.org_id, o.created_by_oid
FROM core.observations o
WHERE o.created_by_oid IS NOT NULL
ON CONFLICT (observation_id) DO NOTHING;

INSERT INTO core.evidence_actor_audit (evidence_id, org_id, actor_ref)
SELECT e.id, e.org_id, e.captured_by_oid
FROM core.evidence e
WHERE e.captured_by_oid IS NOT NULL
ON CONFLICT (evidence_id) DO NOTHING;

INSERT INTO core.assignment_actor_audit (assignment_id, org_id, actor_ref)
SELECT a.id, a.org_id, a.created_by_oid
FROM core.assignments a
WHERE a.created_by_oid IS NOT NULL
ON CONFLICT (assignment_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. EXPAND/CONTRACT step 1: drop NOT NULL on the canonical identity columns so
--    repointed writers can write identity to the sidecar INSTEAD of the row.
--    (Values remain until Migration B drops the columns.)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE core.visits        ALTER COLUMN actor_oid      DROP NOT NULL;
ALTER TABLE core.observations  ALTER COLUMN created_by_oid DROP NOT NULL;
ALTER TABLE core.evidence      ALTER COLUMN captured_by_oid DROP NOT NULL;
ALTER TABLE core.assignments   ALTER COLUMN created_by_oid DROP NOT NULL;

COMMENT ON COLUMN core.visits.actor_oid IS
  'DEPRECATED 2026-05-30 — relocated to core.visit_actor_audit.actor_ref. Dropped in Migration B. Do not read in new code.';
COMMENT ON COLUMN core.observations.created_by_oid IS
  'DEPRECATED 2026-05-30 — relocated to core.observation_actor_audit.actor_ref. Dropped in Migration B.';
COMMENT ON COLUMN core.evidence.captured_by_oid IS
  'DEPRECATED 2026-05-30 — relocated to core.evidence_actor_audit.actor_ref. Dropped in Migration B.';
COMMENT ON COLUMN core.assignments.created_by_oid IS
  'DEPRECATED 2026-05-30 — relocated to core.assignment_actor_audit.actor_ref. Dropped in Migration B.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ROLES + GRANTS — the structural boundary.
--    NOLOGIN group roles (tested via SET ROLE this pass; LOGIN added when the
--    app-connection-wiring follow-on lands — until then the running app still
--    queries as fieldpro and the guarantee is not yet binding on intelligence
--    reads; see CANONICAL_STATE_LAYER_DESIGN §3.2 status + KNOWN_ISSUES app-wiring).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'intelligence_reader') THEN
    CREATE ROLE intelligence_reader NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_reader') THEN
    CREATE ROLE audit_reader NOLOGIN;
  END IF;
END $$;

-- 4a. intelligence_reader: read the canonical + normalized + MV surfaces, but
--     NO grant on any sidecar. Grant-broad-then-revoke-sidecars so current AND
--     future core tables stay readable while the four sidecars are explicitly
--     withheld. (No ALTER DEFAULT PRIVILEGES: a future canonical table is
--     default-deny until explicitly granted — the safe direction, and it means a
--     future sidecar is never auto-granted.)
GRANT USAGE ON SCHEMA core, public TO intelligence_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA core TO intelligence_reader;
REVOKE ALL ON core.visit_actor_audit, core.observation_actor_audit,
              core.evidence_actor_audit, core.assignment_actor_audit
       FROM intelligence_reader;
-- Intelligence read dependencies in public (riskMapService CTEs + the 5 MVs +
-- cleanLogService effort-history read).
GRANT SELECT ON
  public.cleanliness_risk_mv, public.infrastructure_risk_mv,
  public.level3_compliance_mv, public.safety_risk_mv, public.stop_status_mv,
  public.transit_stop_assets, public.stops, public.stop_risk_snapshot,
  public.stop_effort_history
TO intelligence_reader;

-- 4b. audit_reader: read the four sidecars (legitimate audit/export) + the
--     canonical parents to join against.
GRANT USAGE ON SCHEMA core TO audit_reader;
GRANT SELECT ON
  core.visit_actor_audit, core.observation_actor_audit,
  core.evidence_actor_audit, core.assignment_actor_audit,
  core.visits, core.observations, core.evidence, core.assignments
TO audit_reader;

-- 4c. fieldpro (the app role) writes + reads the sidecars (write paths, and the
--     export/delete paths until the audit-connection follow-on lands).
GRANT SELECT, INSERT, UPDATE, DELETE ON
  core.visit_actor_audit, core.observation_actor_audit,
  core.evidence_actor_audit, core.assignment_actor_audit
TO fieldpro;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ASSERTIONS — fail loudly if backfill under-ran or the boundary is mis-granted.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_src int; v_side int;
  o_src int; o_side int;
  e_src int; e_side int;
  a_src int; a_side int;
  leak int;
BEGIN
  SELECT count(*) INTO v_src  FROM core.visits        WHERE actor_oid      IS NOT NULL;
  SELECT count(*) INTO v_side FROM core.visit_actor_audit;
  SELECT count(*) INTO o_src  FROM core.observations  WHERE created_by_oid IS NOT NULL;
  SELECT count(*) INTO o_side FROM core.observation_actor_audit;
  SELECT count(*) INTO e_src  FROM core.evidence      WHERE captured_by_oid IS NOT NULL;
  SELECT count(*) INTO e_side FROM core.evidence_actor_audit;
  SELECT count(*) INTO a_src  FROM core.assignments   WHERE created_by_oid IS NOT NULL;
  SELECT count(*) INTO a_side FROM core.assignment_actor_audit;

  IF v_src <> v_side OR o_src <> o_side OR e_src <> e_side OR a_src <> a_side THEN
    RAISE EXCEPTION 'Sidecar backfill mismatch (sidecar/src): visits %/%, obs %/%, evidence %/%, assignments %/%. Check app.current_org_id / RLS context.',
      v_side, v_src, o_side, o_src, e_side, e_src, a_side, a_src;
  END IF;

  -- intelligence_reader must NOT have any privilege on any sidecar.
  SELECT count(*) INTO leak
  FROM information_schema.role_table_grants
  WHERE grantee = 'intelligence_reader'
    AND table_schema = 'core'
    AND table_name IN ('visit_actor_audit','observation_actor_audit','evidence_actor_audit','assignment_actor_audit');
  IF leak <> 0 THEN
    RAISE EXCEPTION 'Boundary breach: intelligence_reader holds % grant(s) on a sidecar', leak;
  END IF;
END $$;

COMMIT;
