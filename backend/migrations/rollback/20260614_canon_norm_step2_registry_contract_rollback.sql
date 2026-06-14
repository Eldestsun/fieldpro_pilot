-- ============================================================
-- ROLLBACK — Canonical State Layer registry contract, STEP 2
-- 2026-06-14 — feat/issue-031-canon-norm-step2-registry — ISSUE-031 / CANON-NORM
--
-- Reverses 20260614_canon_norm_step2_registry_contract.sql. Drops the obs_kind
-- value-domain CHECK and the four §4.1 contract columns. DROP COLUMN discards the
-- populated obs_kind classification — safe only while these columns are still
-- unwired (no normalizer reading them, no consumer joining on them).
--
-- Apply as superuser / bypassrls (registry is FORCE ROW LEVEL SECURITY).
-- ============================================================

BEGIN;

ALTER TABLE core.observation_type_registry
    DROP CONSTRAINT IF EXISTS obs_type_registry_obs_kind_chk;

ALTER TABLE core.observation_type_registry DROP COLUMN IF EXISTS severity_map;
ALTER TABLE core.observation_type_registry DROP COLUMN IF EXISTS ok_rule;
ALTER TABLE core.observation_type_registry DROP COLUMN IF EXISTS payload_schema;
ALTER TABLE core.observation_type_registry DROP COLUMN IF EXISTS obs_kind;

COMMIT;
