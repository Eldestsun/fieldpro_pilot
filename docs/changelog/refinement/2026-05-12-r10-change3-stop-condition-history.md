# 2026-05-12 — R10 Change 3: stop_condition_history populated after risk snapshot rebuild

## What changed
- In `riskMapService.ts`, added a `stop_condition_history` INSERT inside the `rebuildStopRiskSnapshot` transaction, after the `stop_risk_snapshot` INSERT and before COMMIT
- The insert records cleanliness, safety, and infrastructure scores for every stop that had a `core.visits` row closed in the last day
- Uses the `transit_stop_assets` one-hop translation path (Path B/C per ADAPTER_BOUNDARY.md §5) since `core.visits.route_run_stop_id` is not yet available (Tier 5)
- `ON CONFLICT (stop_id, visit_id) DO NOTHING` ensures idempotency across repeated rebuilds

## Why
- R10 requires condition history to be populated alongside each snapshot rebuild so stop-level condition trends are historically persistent
- Keeping the insert inside the same transaction ensures atomicity: a failed condition history write rolls back the snapshot too

## Files touched
- `backend/src/intelligence/riskMapService.ts`
