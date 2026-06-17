-- ============================================================
-- Canonical State Layer — P1 / CANON-NORM-1: presence-type severity RECEIVER
-- 2026-06-17 — feat/canon-norm-1-presence-severity-receiver — CANON-NORM-1
--
-- Makes core CAPABLE of holding a worker-reported magnitude in
-- core.observations.norm_severity for presence-kind observations. This is the
-- RECEIVER / the PIPE — it authors NO severity values, NO scale, NO weighting.
-- Real magnitudes do not flow until the picker UI ships in Capability Build (P2).
--
-- Prior epic (ISSUE-031 / CANON-NORM, Steps 2 & 3) added the four §4.1 contract
-- columns and authored ok_rule/severity_map for the ONE measurement type
-- (trash_volume) only. Every presence row was left with severity_map = NULL,
-- payload_schema = NULL — so a presence payload carrying a `severity` field has
-- nowhere to land and norm_severity stays NULL on every presence row. This
-- migration opens the passthrough.
--
-- ── WHAT THIS DOES (structural, not authoring) ──────────────────────────────
--   severity_map  = {"field": "severity"}   on every obs_kind='presence' row.
--     A PASSTHROUGH, identical in shape to trash_volume's {"field": "level"}
--     (Step 3). It tells the §4.2 normalizer: "when a payload has a `severity`
--     field, carry it into norm_severity as-is." It declares WHERE the magnitude
--     lives, not WHAT any magnitude is — the pipe exists, the pipe has no values.
--
--   payload_schema = JSON-Schema fragment declaring the SHAPE of the optional
--     magnitude field (§4.1, §6). Defining the expected shape also fixes the
--     structural part of ISSUE-017 (enum-key coercion) — shape, not values.
--       {"type":"object",
--        "properties":{"severity":{"type":"integer","minimum":1}},
--        "additionalProperties":true}
--     additionalProperties:true because presence payloads also carry notes/cause/
--     component fields (Step 5) and an absent `severity` is valid (the field is
--     not required — presence rows existed and will continue to exist with
--     payload '{}' until the P2 picker emits a magnitude).
--
--   ok_rule stays NULL on presence rows (Step 3 set it; this migration does not
--     touch it). Presence types have no ok/not_ok evaluation — existence of the
--     row IS the signal (§3.3 / §4.2 presence case). NULL is correct, not a gap.
--
-- ── NO NORMALIZER CHANGE NEEDED ─────────────────────────────────────────────
-- observationNormalizer.evaluateSeverityMap already reads {field} generically
-- (payload[map.field], rounded + smallint-clamped). {"field":"severity"} is the
-- same shape as the existing {"field":"level"}, so the write path
-- (loadRegistryRules -> normalizeObservation -> INSERT norm_severity) honors this
-- rule with no code change. Verified live.
--
-- ── NO AUTHORED VALUES (phase guard) ────────────────────────────────────────
-- There is deliberately NO map like {"fire":5,"graffiti":2}. The severity_map is
-- a field-locator only. Assigning a number to a hazard/infra TYPE is P2/P3 work,
-- not this card.
--
-- ── RLS NOTE (apply as superuser / bypassrls) ───────────────────────────────
-- core.observation_type_registry is FORCE ROW LEVEL SECURITY. An UPDATE under a
-- non-superuser role WITHOUT app.current_org_id would silently affect ZERO rows
-- (CLAUDE.md § RLS Context Gotcha / PATTERN-001). Applied as the postgres
-- superuser (repo migration convention), which bypasses RLS. The passthrough is a
-- property of the KIND's semantics, not of the org, so updating every
-- obs_kind='presence' row org-agnostically is correct.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
-- Re-asserts the same JSON on re-run (NULL -> value -> same value). Scoped by
-- obs_kind='presence' so it also covers any presence type added later.
-- ============================================================

BEGIN;

UPDATE core.observation_type_registry
   SET severity_map   = '{"field": "severity"}'::jsonb,
       payload_schema = '{"type": "object", "properties": {"severity": {"type": "integer", "minimum": 1}}, "additionalProperties": true}'::jsonb
 WHERE obs_kind = 'presence';

COMMIT;
