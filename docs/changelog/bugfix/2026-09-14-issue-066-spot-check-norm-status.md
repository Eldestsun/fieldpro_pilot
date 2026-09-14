# 2026-09-14 — ISSUE-066: spot_check grades norm_status='ok' (§3.5 anchor closed)

## What changed
- `backend/migrations/20260913_issue066_spot_check_ok_rule_backfill.sql` (new):
  - Registry: `spot_check.ok_rule = {"field":"result","eq":"no_work_needed"}` —
    the shape the LIVE normalizer consumes (`evaluateOkRule` supports
    `{field, eq|lte|gte}`, not the design doc's illustrative `{path, ok_values}`).
  - Backfill: historical `spot_check` rows with legacy `payload='{}'` and
    `norm_status IS NULL` are normalized to the §3.5 target payload
    (`{"scope":"stop","result":"no_work_needed"}`) + `norm_status='ok'`.
    Re-states the worker's original assertion (a spot_check row has only ever
    meant "assessed, no work needed") — no manufactured state (§2.1). Rows with
    any other payload untouched. Idempotent; both UPDATEs re-assert end state.
- `emitSpotCheckObservation` (`observationService.ts`): emits the §3.5 target
  payload instead of `'{}'`, so the normalizer grades `'ok'` at write time.
  Stale "§9 Q4 follow-up" comment updated.
- New regression test `backend/tests/canonical/spotCheckNormStatus.test.ts`
  (registered in `tests/run.ts`): drives the real
  `emitSpotCheckObservation → normalizeObservation → INSERT` chain against the
  live registry; asserts kind=condition, norm_status='ok', payload shape,
  no severity, no intervention, type_id resolved.

## Why
- The §3.5 spot check is the stop-level positive condition anchor that makes
  component-level silence on a completed visit readable as benign (§4.4
  absence-as-counted-signal). With `ok_rule` NULL and payload `{}` it landed
  `norm_status=NULL` — an ungraded anchor — confirmed live in the 2026-09-13
  founder E2E smoke. This was the documented §9 Q4 residual and a concrete
  piece of the T2/Intelligence readiness gate (CANON-NORM-1 chain).

## Verification
- `tsc --noEmit` clean; full backend suite **216/216** pass (incl. new test).
- Migration applied + recorded on dev via the provisioner runner (ISSUE-038
  same-step discipline); registry rule verified live. Backfill was a no-op on
  dev by design (zero operational rows post-cleanup).
- Clean-room gate: ephemeral `postgres:14` + `db/init` bootstrap → full chain
  exit 0 → fresh build carries the rule. Container destroyed.

## Files touched
- `backend/migrations/20260913_issue066_spot_check_ok_rule_backfill.sql` (new)
- `backend/src/domains/observation/observationService.ts`
- `backend/tests/canonical/spotCheckNormStatus.test.ts` (new)
- `backend/tests/run.ts`
- `docs/changelog/bugfix/2026-09-14-issue-066-spot-check-norm-status.md` (this entry)
