-- ============================================================
-- Canonical State Layer — normalized observation shape, STEP 3 (Sub-task A):
--   populate ok_rule / severity_map on core.observation_type_registry
-- 2026-06-14 — feat/issue-031-canon-norm-step3-normalizer — ISSUE-031 / CANON-NORM
--
-- Step 2 added the four §4.1 contract columns (obs_kind / payload_schema / ok_rule /
-- severity_map) and populated obs_kind only. ok_rule and severity_map landed NULL
-- on every row. This migration fills them so the write-time normalizer (Sub-task B,
-- §4.2) can compute norm_status / norm_severity.
--
-- ── DERIVATION (from the live seeder columns value_type / valid_values) ──────────
-- The rules are DERIVED from the seeder shape, which encodes the same information:
--
--   obs_kind = 'action'      -> ok_rule = NULL, severity_map = NULL
--                               (an intervention has no ok/not_ok grade, §3.3/§4.2)
--   obs_kind = 'presence'    -> ok_rule = NULL
--                               (existence of the row IS the signal; norm_status
--                                stays NULL by design, §3.3/§4.2 presence case)
--   value_type = 'state'     -> ok_rule = NULL
--   (condition rows)           State-typed condition rows (ground/shelter/pad/
--                               trash_can_condition, spot_check) are not graded by
--                               an ok_rule in this step. The cleaning write path no
--                               longer emits the *_condition rows (retired arrival
--                               state, §2.1), and spot_check is written with payload
--                               '{}' — there is no state field to grade, and the
--                               §3.5 'ok' anchor / refined payload shape ({scope,
--                               result}) reconciliation is its own follow-up (§9 Q4).
--                               Leaving ok_rule NULL keeps norm_status NULL rather
--                               than manufacturing a wrong grade (additive discipline).
--   obs_kind = 'measurement' -> derive ok_rule + severity_map from valid_values.
--                               The ONLY measurement type is trash_volume.
--
-- ── trash_volume (the only row that gets real rules) ────────────────────────────
-- Live row: value_type='numeric', valid_values={"min":0,"max":4}, obs_kind='measurement'.
-- Live payload shape (observationService.ts): { "level": <0..4> }.
-- Design §4.1 / §7 worked example: trash_volume is measurement with ok_max = 1
-- ("bin fill 0–4", ok when level <= 1). So:
--   ok_rule      = {"field": "level", "lte": 1}   -- norm_status = ok iff level <= 1
--   severity_map = {"field": "level"}             -- norm_severity = level (0..4),
--                                                    a direct read on the 0..N scale
--
-- ── RLS NOTE (apply as superuser / bypassrls) ───────────────────────────────────
-- core.observation_type_registry is FORCE ROW LEVEL SECURITY. An UPDATE under a
-- non-superuser role WITHOUT app.current_org_id would silently affect ZERO rows
-- (CLAUDE.md § RLS Context Gotcha / PATTERN-001). Applied as the postgres superuser
-- (repo migration convention), which bypasses RLS. The rules are a property of the
-- type_key's SEMANTICS, not of the org, so updating by observation_key org-agnostically
-- is correct.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────────
-- The UPDATE re-asserts the same JSON on re-run. The NULL-affirming UPDATES make the
-- additive intent explicit and are also idempotent (NULL -> NULL).
-- ============================================================

BEGIN;

-- measurement (1): trash_volume — the only type with a graded threshold + severity.
UPDATE core.observation_type_registry
   SET ok_rule      = '{"field": "level", "lte": 1}'::jsonb,
       severity_map = '{"field": "level"}'::jsonb
 WHERE observation_key = 'trash_volume'
   AND obs_kind = 'measurement';

-- condition / action / presence: ok_rule and severity_map remain NULL by design
-- (see header). These statements make the intent explicit and self-documenting;
-- they are no-ops against the Step 2 state (already NULL) and stay idempotent.
UPDATE core.observation_type_registry
   SET ok_rule = NULL, severity_map = NULL
 WHERE obs_kind = 'action';

UPDATE core.observation_type_registry
   SET ok_rule = NULL, severity_map = NULL
 WHERE obs_kind = 'presence';

UPDATE core.observation_type_registry
   SET ok_rule = NULL, severity_map = NULL
 WHERE obs_kind = 'condition'
   AND value_type = 'state';

COMMIT;
