# 2026-06-17 — CANON-NORM-1: presence-type severity receiver (the pipe)

## What changed
- New migration `backend/migrations/20260617_canon_norm_p1_presence_severity_passthrough.sql`
  sets, on **every** `core.observation_type_registry` row with `obs_kind = 'presence'` (18 rows):
  - `severity_map = {"field": "severity"}` — a passthrough field-locator (identical
    shape to the existing `trash_volume` `{"field": "level"}`) telling the §4.2
    normalizer to carry `payload.severity` into `core.observations.norm_severity` as-is.
  - `payload_schema = {"type":"object","properties":{"severity":{"type":"integer","minimum":1}},"additionalProperties":true}`
    — declares the SHAPE of the optional magnitude field; also fixes the structural
    part of ISSUE-017 (enum-key coercion — shape, not values).
  - `ok_rule` is left untouched (stays NULL — presence existence is the signal, never graded).
- Rollback `backend/migrations/rollback/20260617_canon_norm_p1_presence_severity_passthrough_rollback.sql`
  returns `severity_map`/`payload_schema` to NULL on presence rows.
- New regression test `backend/tests/canonical/presenceSeverityReceiver.test.ts`
  (+ wired into `backend/tests/run.ts`) exercising the real chain
  (`loadRegistryRules` → `normalizeObservation` → INSERT → read-back):
  payload `{severity:3}` → `norm_severity = 3`; payload `{}` → `norm_severity IS NULL`.
- **No normalizer code change.** `evaluateSeverityMap` already reads `{field}`
  generically, so `{"field":"severity"}` is honored with no edit (confirmed by test).

## Why
- P1 / CANON-NORM-1 makes core **capable** of holding a worker-reported magnitude
  for presence observations. The prior epic (ISSUE-031 / CANON-NORM Steps 2–3) added
  the §4.1 contract columns and `norm_severity`, but authored rules only for the one
  measurement type — every presence row had `severity_map = NULL`, so a presence
  payload carrying `severity` had nowhere to land and `norm_severity` stayed NULL.
- This builds the **pipe only**. It authors no severity values, no scale, no
  weighting. Real magnitudes do not flow until the picker UI ships in Capability
  Build (P2). Phase guard respected: no readers repointed, no values authored.

## Verification (live)
- `core.observations.norm_severity` = nullable `smallint` (pre-existing; confirmed).
- 18/18 presence rows now carry `severity_map = {"field":"severity"}` + `payload_schema`; `ok_rule` NULL on all.
- Full canonical suite: **114 passed, 0 failed** (incl. 3 new receiver tests).
- Inverted grep: no authored numeric values in any `severity_map` (all are `{field:...}` locators).
- Labor safety: 0 identity columns on `core.observations`.

## Files touched
- `backend/migrations/20260617_canon_norm_p1_presence_severity_passthrough.sql` (new)
- `backend/migrations/rollback/20260617_canon_norm_p1_presence_severity_passthrough_rollback.sql` (new)
- `backend/tests/canonical/presenceSeverityReceiver.test.ts` (new)
- `backend/tests/run.ts` (registered new test file)
