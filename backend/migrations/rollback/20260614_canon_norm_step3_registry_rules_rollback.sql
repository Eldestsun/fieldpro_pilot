-- ============================================================
-- ROLLBACK — Canonical State Layer registry rules, STEP 3 (Sub-task A)
-- 2026-06-14 — feat/issue-031-canon-norm-step3-normalizer — ISSUE-031 / CANON-NORM
--
-- Reverses 20260614_canon_norm_step3_registry_rules.sql. Returns ok_rule and
-- severity_map to NULL on every row (the Step 2 state). The §4.1 contract columns
-- themselves are NOT dropped here — that is Step 2's rollback. Safe only while the
-- normalizer is unwired or tolerant of NULL rules (it is: a NULL ok_rule yields
-- norm_status NULL, additive discipline).
--
-- Apply as superuser / bypassrls (registry is FORCE ROW LEVEL SECURITY).
-- ============================================================

BEGIN;

UPDATE core.observation_type_registry
   SET ok_rule = NULL, severity_map = NULL
 WHERE ok_rule IS NOT NULL OR severity_map IS NOT NULL;

COMMIT;
