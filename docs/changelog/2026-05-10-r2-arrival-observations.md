# 2026-05-10 — R2: Arrival Observations — Real Prior State

## What changed
- `arrivalObservations()` in `observationService.ts` is now async and queries `core.observations` for the most recent observation of each arrival type at the stop, rather than returning hardcoded dirty defaults
- Added `stopId?: string` parameter to `emitObservationsForStop()` — when provided, the real prior state lookup runs; when absent, the function falls back to dirty defaults (safe backward-compatible behaviour for callers that don't yet pass stopId)
- Extracted `arrivalObservationDefaults()` as the explicit fallback — called when stopId is unavailable or when no prior visit exists for the stop
- Added `ARRIVAL_OBSERVATION_TYPES` constant covering: `ground_condition`, `trash_can_condition`, `shelter_condition`, `pad_condition`
- SQL join path: **Path B** — `core.observations.asset_id → transit_stop_assets.asset_id WHERE stop_id = $1`. `core.observations.asset_id` is populated on 100% of rows; `transit_stop_assets` translates the transit `stop_id` to a canonical `asset_id` at the boundary (1 adapter hop, tolerated as a vertical identifier translation). `ORDER BY o.observation_type, o.created_at DESC` selects the most recent observation per type.
- **Correction** (same session): initial commit used Path A (`clean_logs` bridge, 3 adapter hops — `core.observations → core.visits → clean_logs → route_run_stops`). Replaced with Path B after `ADAPTER_BOUNDARY.md` audit confirmed `core.observations.asset_id` is fully populated and `transit_stop_assets` is available, making Path A unnecessary. Do not revert to Path A. See `planning/architecture/ADAPTER_BOUNDARY.md` for the full join map.

## Why
- Workers always arrived at stops showing maximally-dirty state regardless of actual condition history
- After Tier 1 verified that `core.observations` is reliably populated on every stop completion, the prior-state lookup is now meaningful
- A correct arrival baseline makes the observation delta (what changed during the visit) accurate

## Done criteria met
- [x] `arrivalObservations()` accepts `stopId` and queries `core.observations` for prior state
- [x] Stops with prior completed visits will show correct arrival state (not always dirty)
- [x] Stops with no prior visits default to dirty — no error
- [x] All internal callers in `observationService.ts` pass `stopId` and `client` to `arrivalObservations()`
- [x] `tsc --noEmit` passes clean

## Files touched
- `backend/src/domains/observation/observationService.ts`
