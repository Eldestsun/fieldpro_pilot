-- ============================================================
-- ROLLBACK — Canonical State Layer normalized observation columns, STEP 1
-- 2026-06-14 — feat/issue-031-canon-norm-step1-columns — ISSUE-031 / CANON-NORM
--
-- Reverses 20260614_canon_norm_step1_observation_columns.sql. Safe to run only
-- while the columns are still unwired (no normalizer writing them, no consumer
-- reading them). Drops the value-domain CHECK constraints and the five columns.
-- DROP COLUMN cascades the inline FK on type_id automatically.
--
-- NOTE: once Step 6 backfills these columns, rolling back DISCARDS the normalized
-- values. Do not run this after backfill without an explicit decision.
-- ============================================================

BEGIN;

ALTER TABLE core.observations DROP CONSTRAINT IF EXISTS observations_norm_severity_chk;
ALTER TABLE core.observations DROP CONSTRAINT IF EXISTS observations_norm_status_chk;
ALTER TABLE core.observations DROP CONSTRAINT IF EXISTS observations_obs_kind_chk;

ALTER TABLE core.observations DROP COLUMN IF EXISTS type_id;
ALTER TABLE core.observations DROP COLUMN IF EXISTS intervention;
ALTER TABLE core.observations DROP COLUMN IF EXISTS norm_severity;
ALTER TABLE core.observations DROP COLUMN IF EXISTS norm_status;
ALTER TABLE core.observations DROP COLUMN IF EXISTS obs_kind;

COMMIT;
