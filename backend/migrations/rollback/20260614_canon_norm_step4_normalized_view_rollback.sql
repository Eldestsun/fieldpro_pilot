-- ============================================================
-- ROLLBACK — CANON-NORM Step 4: drop core.v_observation_normalized
-- 2026-06-14 — feat/issue-031-canon-norm-step4-view — ISSUE-031 / CANON-NORM
--
-- Drops the §4.3 read seam created by
-- 20260614_canon_norm_step4_normalized_view.sql. The view holds no data; this is
-- a pure definition drop. Safe while no consumer reads it yet (Step 5 wiring not
-- landed). RESTRICT guards against silently dropping a dependent object should
-- one exist.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS core.v_observation_normalized RESTRICT;

COMMIT;
