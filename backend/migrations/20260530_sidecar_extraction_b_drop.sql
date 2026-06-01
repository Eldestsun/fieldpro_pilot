-- ============================================================
-- Sidecar extraction — Migration B (SUBTRACTIVE / IRREVERSIBLE-IN-PRACTICE)
-- 2026-05-30 — feat/sidecar-extraction
--
-- Drops the plaintext (and S1-13 cipher) identity columns from the four canonical
-- tables. AFTER this runs, identity is absent from every surface intelligence_reader
-- can SELECT — the labor-safety guarantee (invariant #1) becomes structural in fact,
-- not just at the sidecar grant.
--
-- ── PRECONDITIONS (do not run unless ALL hold) ───────────────────────────────
--   1. Migration A applied; the four sidecars exist and are populated.
--   2. Every WRITE path repointed to the sidecar (visitService, observationService,
--      stopPhotosService, routeRunService) — no code still writes the canonical
--      identity columns.
--   3. Every legitimate-audit READ path repointed to the sidecar (sftpExport,
--      exportDeleteRoutes export selects; oidCipher decrypt reads ciphertext from
--      the sidecar).
--   4. Phase 2 verification passed (intelligence_reader refused on sidecars;
--      all intelligence reads work; audit_reader reads sidecars).
--
-- This migration re-asserts preconditions 1 (and a population check) before
-- dropping, and refuses if a sidecar is missing or empty relative to its source.
--
-- Reversal: rollback/20260530_sidecar_extraction_b_rollback.sql re-adds the columns and
-- back-copies from the sidecars. "Irreversible-in-practice" only in that any rows
-- inserted AFTER B with sidecar-only identity are fully recoverable from the
-- sidecar — no data is actually lost — but the column-shape change is disruptive,
-- hence the throwaway-dev-copy dry run before the working DB.
-- ============================================================

BEGIN;

-- Precondition guard: all four sidecars exist and cover their source rows.
DO $$
DECLARE
  missing text;
  v_src int; v_side int; o_src int; o_side int;
  e_src int; e_side int; a_src int; a_side int;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (SELECT unnest(ARRAY['visit_actor_audit','observation_actor_audit','evidence_actor_audit','assignment_actor_audit']) AS t) x
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='core' AND table_name = x.t
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration B precondition failed: sidecar(s) missing: %. Run Migration A first.', missing;
  END IF;

  SELECT count(*) INTO v_src  FROM core.visits        WHERE actor_oid      IS NOT NULL;
  SELECT count(*) INTO v_side FROM core.visit_actor_audit;
  SELECT count(*) INTO o_src  FROM core.observations  WHERE created_by_oid IS NOT NULL;
  SELECT count(*) INTO o_side FROM core.observation_actor_audit;
  SELECT count(*) INTO e_src  FROM core.evidence      WHERE captured_by_oid IS NOT NULL;
  SELECT count(*) INTO e_side FROM core.evidence_actor_audit;
  SELECT count(*) INTO a_src  FROM core.assignments   WHERE created_by_oid IS NOT NULL;
  SELECT count(*) INTO a_side FROM core.assignment_actor_audit;

  -- Every canonical row that still carries identity must be represented in its sidecar.
  IF v_side < v_src OR o_side < o_src OR e_side < e_src OR a_side < a_src THEN
    RAISE EXCEPTION 'Migration B precondition failed: sidecar under-covers source (visits %/%, obs %/%, evidence %/%, assignments %/%). Re-backfill before dropping.',
      v_side, v_src, o_side, o_src, e_side, e_src, a_side, a_src;
  END IF;
END $$;

-- Drop the canonical identity columns (+ the visits S1-13 cipher columns, now in the sidecar).
ALTER TABLE core.visits        DROP COLUMN actor_oid;
ALTER TABLE core.visits        DROP COLUMN captured_by_oid_ciphertext;
ALTER TABLE core.visits        DROP COLUMN captured_by_oid_key_id;
ALTER TABLE core.observations  DROP COLUMN created_by_oid;
ALTER TABLE core.evidence      DROP COLUMN captured_by_oid;
ALTER TABLE core.assignments   DROP COLUMN created_by_oid;

COMMIT;
