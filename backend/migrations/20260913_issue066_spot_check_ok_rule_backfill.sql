-- ============================================================================
-- ISSUE-066 — spot_check grading: registry ok_rule + historical backfill.
--
-- WHY: the §3.5 spot check is the stop-level POSITIVE condition anchor — the
-- one row that makes component-level silence on a completed visit readable as
-- benign (§4.4 absence-as-counted-signal). Until now the registry row carried
-- ok_rule = NULL (Step 3 deliberately deferred condition rules) and the write
-- path emitted payload '{}', so every spot_check landed norm_status = NULL and
-- the anchor carried no grade. Confirmed live in the 2026-09-13 founder E2E
-- smoke. This closes the §9 Q4 residual (CANONICAL_STATE_LAYER_DESIGN.md).
--
-- RULE SHAPE: the LIVE normalizer (observationNormalizer.ts evaluateOkRule)
-- consumes {field, eq|lte|gte} — NOT the design doc's illustrative
-- {path, ok_values}. spot_check: payload.result === 'no_work_needed' -> 'ok'.
-- The write path (emitSpotCheckObservation, same PR) now emits the §3.5 target
-- payload {"scope":"stop","result":"no_work_needed"}.
--
-- BACKFILL: historical spot_check rows with the legacy '{}' payload and NULL
-- norm_status are normalized to the target payload + 'ok'. This re-states the
-- worker's original assertion at write time ("assessed, no work needed" is the
-- ONLY thing a spot_check row has ever meant) — it does NOT manufacture a fact
-- the field did not produce (§2.1). Rows with any other payload are untouched.
--
-- RLS NOTE: registry + observations are FORCE RLS. Runner is fieldpro_admin
-- (BYPASSRLS) on the provisioner path — the UPDATEs apply org-agnostically,
-- correct because the rule is a property of the type's semantics. SET LOCAL
-- keeps the statements effective under a non-bypass fallback runner (all live
-- rows are org 1 — seed_b convention).
--
-- IDEMPOTENT: both UPDATEs re-assert their own end state; re-runs match 0 rows.
-- ============================================================================
BEGIN;
SET LOCAL app.current_org_id = '1';

UPDATE core.observation_type_registry
   SET ok_rule = '{"field": "result", "eq": "no_work_needed"}'::jsonb
 WHERE observation_key = 'spot_check'
   AND (ok_rule IS NULL OR ok_rule <> '{"field": "result", "eq": "no_work_needed"}'::jsonb);

UPDATE core.observations
   SET payload     = '{"scope": "stop", "result": "no_work_needed"}'::jsonb,
       norm_status = 'ok'
 WHERE observation_type = 'spot_check'
   AND norm_status IS NULL
   AND payload = '{}'::jsonb;

COMMIT;
