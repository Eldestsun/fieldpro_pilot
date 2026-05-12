# 2026-05-12 — R10: Stop Effort History (replace workforce_metrics)

## What changed
- Added `stop_effort_history` table (migration `20260508_replace_surveillance_tables.sql`)
- Added `stop_condition_history` table (same migration)
- `cleanLogService.ts`: inserts `stop_effort_history` row after each stop completion
- `riskMapService.ts`: inserts `stop_condition_history` rows after `stop_risk_snapshot` rebuild
  - Adapted spec SQL to use `transit_stop_assets` Path B join (`route_run_stop_id` not yet on `core.visits` — Tier 5 deferred column)

## Why
- Replaces dropped `workforce_metrics` and `stop_scoring_history` surveillance tables
- New tables are worker-safe by structure: no `user_id`, no `workforce_score`, keyed by `(stop_id, visit_id)`
- Enables stop-level route planning intelligence without worker attribution

## Files touched
- `backend/migrations/20260508_replace_surveillance_tables.sql`
- `backend/src/domains/routeRunStop/cleanLogService.ts`
- `backend/src/intelligence/riskMapService.ts`
