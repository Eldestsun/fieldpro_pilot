-- ============================================================
-- ROLLBACK — CANON-NORM-1: presence-type severity RECEIVER
-- 2026-06-17 — feat/canon-norm-1-presence-severity-receiver — CANON-NORM-1
--
-- Reverses 20260617_canon_norm_p1_presence_severity_passthrough.sql. Returns
-- severity_map and payload_schema to NULL on presence rows (the pre-CANON-NORM-1
-- / post-Step-3 state). The §4.1 contract columns themselves are NOT dropped here
-- (that is Step 2's rollback), and ok_rule is left untouched (it was already NULL
-- on presence rows and this migration never set it).
--
-- Safe at any time: the normalizer tolerates a NULL severity_map (yields
-- norm_severity NULL, additive discipline), and no reader consumes presence
-- norm_severity yet (the picker UI that feeds it is P2).
--
-- Apply as superuser / bypassrls (registry is FORCE ROW LEVEL SECURITY).
-- ============================================================

BEGIN;

UPDATE core.observation_type_registry
   SET severity_map   = NULL,
       payload_schema = NULL
 WHERE obs_kind = 'presence';

COMMIT;
