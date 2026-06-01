-- ============================================================
-- Sidecar extraction — Migration B ROLLBACK (re-add dropped identity columns)
-- 2026-05-30 — feat/sidecar-extraction
--
-- Reverses 20260530_sidecar_extraction_b_drop.sql: re-adds the canonical identity
-- columns (nullable) and back-copies values from the sidecars. Leaves the columns
-- NULLABLE and the sidecars in place — i.e. it restores the A→B intermediate state,
-- NOT the pre-A state. To go all the way back to pre-A, run this, then
-- 20260530_sidecar_extraction_a_rollback.sql.
--
-- Requires the sidecars to still exist (they are the source of truth for identity
-- once B has run). If the sidecars were dropped, identity for post-B rows is
-- unrecoverable — do not drop sidecars while B is in effect.
-- ============================================================

BEGIN;

-- Guard: sidecars must exist to source the back-copy.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (SELECT unnest(ARRAY['visit_actor_audit','observation_actor_audit','evidence_actor_audit','assignment_actor_audit']) AS t) x
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='core' AND table_name = x.t
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot roll back Migration B: source sidecar(s) missing: %. Identity for post-B rows is unrecoverable.', missing;
  END IF;
END $$;

-- 1. Re-add the columns (nullable; matches the A→B intermediate shape).
ALTER TABLE core.visits        ADD COLUMN actor_oid                  text;
ALTER TABLE core.visits        ADD COLUMN captured_by_oid_ciphertext bytea;
ALTER TABLE core.visits        ADD COLUMN captured_by_oid_key_id     text;
ALTER TABLE core.observations  ADD COLUMN created_by_oid             text;
ALTER TABLE core.evidence      ADD COLUMN captured_by_oid            text;
ALTER TABLE core.assignments   ADD COLUMN created_by_oid             text;

-- 2. Back-copy identity from the sidecars.
UPDATE core.visits v
   SET actor_oid                  = s.actor_ref,
       captured_by_oid_ciphertext = s.actor_ref_ciphertext,
       captured_by_oid_key_id     = s.actor_ref_key_id
  FROM core.visit_actor_audit s WHERE s.visit_id = v.id;

UPDATE core.observations o
   SET created_by_oid = s.actor_ref
  FROM core.observation_actor_audit s WHERE s.observation_id = o.id;

UPDATE core.evidence e
   SET captured_by_oid = s.actor_ref
  FROM core.evidence_actor_audit s WHERE s.evidence_id = e.id;

UPDATE core.assignments a
   SET created_by_oid = s.actor_ref
  FROM core.assignment_actor_audit s WHERE s.assignment_id = a.id;

-- NOTE: NOT NULL is intentionally NOT re-asserted here — that belongs to the
-- a_rollback (pre-A restoration). Re-asserting it now would fail for any post-B
-- row whose parent had no sidecar entry.

COMMIT;
