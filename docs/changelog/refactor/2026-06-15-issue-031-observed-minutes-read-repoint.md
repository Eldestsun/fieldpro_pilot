# 2026-06-15 — ISSUE-031 P1: repoint `observed_minutes` off clean_logs to core.visits

## What changed
- `/admin/control-center/routes` (`adminRoutes.ts` ~L1153, the `observed_minutes`
  CTE) repointed off `public.clean_logs` onto canonical `core.visits`.
  - Old: `LEFT JOIN public.clean_logs cl ON cl.route_run_stop_id = rrs.id`,
    `COALESCE(SUM(cl.duration_minutes), 0)`.
  - New: aggregated route-level visit wall-clock —
    `COALESCE(EXTRACT(EPOCH FROM SUM(v.ended_at - v.started_at)) / 60.0, 0)`
    over `v.outcome = 'completed' AND v.ended_at IS NOT NULL`.
  - Join path mirrors the CC-Repoint canonical spine:
    `route_base (route_runs) → core.assignments (source_system='route_runs',
    source_ref::bigint = route_run_id) → core.visits (assignment_id)`. The
    stop-level spine (`location_external_ids` / `stops` / `route_run_stops`) the
    clean-logs list builder carries is unnecessary here because the metric
    aggregates at the route_run level: one assignment maps to one route_run and
    every completed visit under it belongs to that run.
- No worker-identity column introduced. No clean_logs write touched. `loadRouteRunById.ts`
  untouched.

## Why
- This is the standalone reader repoint that retires the `observed_minutes`
  clean_logs read — the residual the clean-logs Layer 3 PR explicitly left open.
- **clean_logs still has one live reader** after this change:
  `loadRouteRunById.ts:81` (the route-detail cleaning-action booleans). **clean_logs
  is NOT clip-ready after this PR.** The remaining gate is Step 5.1 (D4/D5, Phase 5).

## Verification (proof)

### BEFORE vs AFTER reconciliation (live `fieldpro_db`)
The production CTE is gated to `status IN ('planned','in_progress')`; the only
active run (237) has no clean activity, so both methods trivially return 0 there.
To actually exercise the two aggregation methods, reconciled across **all**
route_runs that carry clean activity:

| route_run_id | before (Σ clean_logs.duration_minutes) | after (Σ visit wall-clock min) | n_visits | delta |
|---|---|---|---|---|
| 25  | 27 | 25.314 | 3 | −1.686 |
| 144 | 3  | 1.974  | 3 | −1.026 |

### Delta is rounding-only, not data loss
- **Row parity**: completed-visit count == clean_log count per run (25→3=3, 144→3=3).
- **Exact reproduction**: applying the legacy per-stop write rounding
  `SUM(GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v.ended_at - v.started_at))/60.0)))`
  to the canonical visit timestamps reproduces the legacy stored totals **exactly**
  (25→27, 144→3; stored `duration_minutes` were 13+13+1 and 1+1+1).
- Therefore the entire BEFORE/AFTER delta is the **documented stored-vs-wall-clock
  delta**: the legacy write stored `GREATEST(1, ceil(min))` per stop (min-1-minute
  floor + ceil), whereas the canonical read sums raw wall-clock. No row is dropped,
  duplicated, or cross-joined. The CC-Repoint clean-logs list builder made the same
  raw-wall-clock vs stored-minutes tradeoff.
- Consumer compatibility: `AdminControlCenter.tsx:329` already renders
  `Math.round(r.observed_minutes)`, so the fractional numeric is display-safe.

### Grep proof — remaining clean_logs app reads
```
$ grep -rnE '(FROM|JOIN)\s+(public\.)?clean_logs\b' --include=*.ts backend/src/
backend/src/domains/observation/cleanLogsCanonicalQuery.ts:7:  // (comment only)
backend/src/domains/routeRun/loaders/loadRouteRunById.ts:81:  LEFT JOIN clean_logs cl ON cl.route_run_stop_id = rrs.id
```
`loadRouteRunById.ts:81` is the **only** remaining live `FROM/JOIN clean_logs`
app-read (Step 5.1 / Phase 5). The `cleanLogsCanonicalQuery.ts:7` hit is a comment.
adminRoutes.ts retains no `cl.` alias / no `FROM|JOIN clean_logs` (only comments +
the intentional `clean_logs:` response-envelope key). Write path
(`cleanLogService.ts`) and `v_clean_logs_transit` view excepted by design.

### Tests
- `npm test` → **111 passed, 0 failed**. `tsc --noEmit` → clean.
- No dedicated control-center handler test exists; `cleanLogsIdentity` /
  `cleanLogsCanonicalPivot` (the clean-logs read-repoint guards) remain green.

## Files touched
- `backend/src/modules/admin/adminRoutes.ts` (observed_minutes CTE)
- `docs/changelog/refactor/2026-06-15-issue-031-observed-minutes-read-repoint.md` (this file)
