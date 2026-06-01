-- ============================================================
-- Sidecar extraction — Migration A ROLLBACK (fully restores pre-A state)
-- 2026-05-30 — feat/sidecar-extraction
--
-- Reverses 20260530_sidecar_extraction_a_additive.sql. Safe to run as long as
-- Migration B has NOT been applied (the canonical identity columns must still
-- exist). Restores the canonical columns to their original NOT NULL state,
-- back-copying any sidecar-only values written during the A→B window, then
-- removes the sidecars, grants, and roles.
--
-- Order matters: re-populate + re-assert NOT NULL BEFORE dropping the sidecars,
-- so no identity is lost if the repointed (sidecar-only) write path created rows
-- whose identity never landed on the canonical column.
-- ============================================================

BEGIN;

-- 1. Back-copy any sidecar identity into NULL canonical columns (A→B-window rows).
UPDATE core.visits v
   SET actor_oid                  = s.actor_ref,
       captured_by_oid_ciphertext = COALESCE(v.captured_by_oid_ciphertext, s.actor_ref_ciphertext),
       captured_by_oid_key_id     = COALESCE(v.captured_by_oid_key_id, s.actor_ref_key_id)
  FROM core.visit_actor_audit s
 WHERE s.visit_id = v.id AND v.actor_oid IS NULL;

UPDATE core.observations o
   SET created_by_oid = s.actor_ref
  FROM core.observation_actor_audit s
 WHERE s.observation_id = o.id AND o.created_by_oid IS NULL;

UPDATE core.evidence e
   SET captured_by_oid = s.actor_ref
  FROM core.evidence_actor_audit s
 WHERE s.evidence_id = e.id AND e.captured_by_oid IS NULL;

UPDATE core.assignments a
   SET created_by_oid = s.actor_ref
  FROM core.assignment_actor_audit s
 WHERE s.assignment_id = a.id AND a.created_by_oid IS NULL;

-- 2. Restore NOT NULL (the original constraint).
ALTER TABLE core.visits        ALTER COLUMN actor_oid       SET NOT NULL;
ALTER TABLE core.observations  ALTER COLUMN created_by_oid  SET NOT NULL;
ALTER TABLE core.evidence      ALTER COLUMN captured_by_oid SET NOT NULL;
ALTER TABLE core.assignments   ALTER COLUMN created_by_oid  SET NOT NULL;

-- 3. Restore original column comments (remove the DEPRECATED markers).
COMMENT ON COLUMN core.visits.actor_oid IS NULL;
COMMENT ON COLUMN core.observations.created_by_oid IS NULL;
COMMENT ON COLUMN core.evidence.captured_by_oid IS NULL;
COMMENT ON COLUMN core.assignments.created_by_oid IS NULL;

-- 4. Revoke sidecar grants from the app role, then drop the sidecars.
REVOKE ALL ON core.visit_actor_audit, core.observation_actor_audit,
              core.evidence_actor_audit, core.assignment_actor_audit FROM fieldpro;
DROP TABLE IF EXISTS core.visit_actor_audit;
DROP TABLE IF EXISTS core.observation_actor_audit;
DROP TABLE IF EXISTS core.evidence_actor_audit;
DROP TABLE IF EXISTS core.assignment_actor_audit;

-- 5. Drop the roles. Revoke their non-sidecar grants first so DROP ROLE succeeds
--    (a role owning/holding grants cannot be dropped while dependencies remain).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'intelligence_reader') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA core, public FROM intelligence_reader;
    REVOKE USAGE ON SCHEMA core, public FROM intelligence_reader;
    DROP ROLE intelligence_reader;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'audit_reader') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA core FROM audit_reader;
    REVOKE USAGE ON SCHEMA core FROM audit_reader;
    DROP ROLE audit_reader;
  END IF;
END $$;

COMMIT;
