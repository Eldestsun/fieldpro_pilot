# 2026-05-11 — R10 Stop Effort History (Steps 1 & 2)

## What changed
- Migration `20260508_replace_surveillance_tables.sql` (already applied as of 2026-05-08) creates `stop_effort_history` and `stop_condition_history` — no `user_id`, no `workforce_score`, worker-safe by structure
- `cleanLogService.ts`: after `emitObservationsForStop`, inserts one row into `stop_effort_history` per stop completion; computes `service_minutes`, `stop_type`, `had_hazard`, `had_infra_issue`, and `trash_volume` from canonical `core.visits` and `core.observations`
- `complexity_score` set to `NULL` for now — derived metric, not a blocking field; payload key varies by observation type, deferred until observation schema is more uniform
- Corrected four SQL bugs vs. the R10 spec draft:
  - `observed_value` column does not exist on `core.observations` — values live in `payload` jsonb
  - `observation_type = 'hazard_present'` → `'safety_concern_present'` (actual emitted type)
  - `observation_type = 'infra_condition'` → `'infrastructure_issue_present'`; presence check only, no numeric cast
  - `trash_volume` read changed from `observed_value::numeric` → `(payload->>'level')::numeric`

## Why
- Replace dropped surveillance tables (`workforce_metrics`, `stop_scoring_history`) with stop-level planning signals that carry no worker attribution
- Enable intelligence queries: average service time per stop, complexity trends, stop schedule adjustment signals

## Files touched
- `backend/migrations/20260508_replace_surveillance_tables.sql` (pre-existing, Step 1)
- `backend/src/domains/routeRunStop/cleanLogService.ts`
