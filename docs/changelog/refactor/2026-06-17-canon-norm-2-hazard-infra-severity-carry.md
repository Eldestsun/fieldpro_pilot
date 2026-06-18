# 2026-06-17 — CANON-NORM-2: carry hazard/infra severity into norm_severity + backfill

## What changed

### Part A — write-side severity threading (`observationService.ts`)
- The hazard branch of `submitObservations` now threads the worker's severity into
  the observation **payload** as a NUMBER (`payload.severity`), so the existing §4.2
  normalizer carries it into `core.observations.norm_severity` via the CANON-NORM-1
  passthrough (`severity_map = {"field":"severity"}`). Previously severity was written
  only to the legacy `severity` **text** column (`"high"`), which the normalizer cannot
  read, so `norm_severity` stayed NULL on every hazard presence row.
- The numeric value uses the adapter's existing `toNumericSeverity` scale
  (`low/medium/high → 1/2/3`), now **exported** from `hazardService.ts` and imported by
  `observationService.ts`. This is the SAME number the hazards adapter stores in
  `public.hazards.severity` — a mechanical passthrough, not an authored magnitude.
- The legacy `severity` text column write is **preserved** (additive discipline).
- When the worker reports **no** severity, nothing is threaded → `norm_severity` stays
  NULL. Canonical deliberately does NOT replicate the adapter's synthetic default-of-1
  (`toNumericSeverity(undefined)=1`) — that default is an adapter artifact, not a
  worker-asserted fact (no-manufactured-state, §4.4 / invariant #5).
- **Infra:** the infrastructure capture path carries no severity at the source
  (`InfraIssueInput`/`infraIssueDetails` have no severity field; the adapter INSERT omits
  it; every `public.infrastructure_issues.severity` is NULL). There is nothing to thread,
  so no infra write-side change was made — `norm_severity` correctly stays NULL and the
  CANON-NORM-1 receiver already accepts a `severity` field if a future surface emits one.

### Part B — backfill (`20260617_canon_norm_2_backfill_hazard_infra_severity.sql`)
- Brings existing presence observations into the normalized shape by joining back to the
  adapter tables on `visit_id` and carrying `public.hazards.severity` /
  `public.infrastructure_issues.severity` into `norm_severity` (guarded by
  `severity IS NOT NULL` and `norm_severity IS NULL`). Idempotent; rollback included.
- Hazard-vs-infra presence types are enumerated explicitly (the registry does not encode
  the distinction — both are `obs_kind='presence'`), reusing the same hazard presence
  type list `cleanLogService` already uses for `stop_effort_history.had_hazard`.
- The infra UPDATE is a verified no-op on current data (all infra severity NULL); present
  for symmetry and future infra severity.

### Tests
- New `backend/tests/canonical/hazardSeverityCarry.test.ts` (wired into `run.ts`)
  exercises the real write chain (`emitObservationsForStop → submitObservations →
  normalizeObservation → INSERT → read-back`): `"high" → norm_severity=3`,
  numeric `3 → 3`, and no-severity → `norm_severity NULL`.

## Why
- P1 / CANON-NORM-2 closes the build-list item "carry hazard/infra severity into
  canonical `norm_severity`" (design §8 item 5 / audit `2026-06-14-canon-norm-build-state`).
  CANON-NORM-1 opened the receiver; the write path never put a numeric severity into the
  payload, so real magnitudes (which exist only in the adapter tables) never reached
  canonical. This makes canonical **lossless** for hazard severity — the prerequisite for
  the eventual intelligence repoint and the adapter write-clip (separate cards).
- Phase guard respected: no severity values/scales/weightings authored; no readers
  repointed; the carry is mechanical (the adapter already holds the number).

## Verification (live, dev DB)
- **Lossless reconstruction (before → after)** for the real hazard visits:
  | obs_id | visit | type | norm_severity BEFORE | norm_severity AFTER | adapter `hazards.severity` |
  |---|---|---|---|---|---|
  | 46 | 92 | encampment_present | NULL | **3** | 3 |
  | 56 | 96 | biohazard_present | NULL | **3** | 3 |
- **Backfill counts:** hazard presence rows with a non-null adapter severity = **2**;
  rows now matching `norm_severity` = **2**; infra rows with non-null adapter severity = **0**
  (infra UPDATE affected 0 rows, as expected).
- `tsc --noEmit`: **clean**.
- Canonical suite: **117 passed, 0 failed** (114 prior + 3 new).
- Labor safety: **0** worker-identity columns on `core.observations`.

## Files touched
- `backend/src/domains/observation/observationService.ts` (thread numeric severity into payload)
- `backend/src/domains/routeRunStop/hazardService.ts` (export `toNumericSeverity`)
- `backend/migrations/20260617_canon_norm_2_backfill_hazard_infra_severity.sql` (new)
- `backend/migrations/rollback/20260617_canon_norm_2_backfill_hazard_infra_severity_rollback.sql` (new)
- `backend/tests/canonical/hazardSeverityCarry.test.ts` (new)
- `backend/tests/run.ts` (registered new test file)
