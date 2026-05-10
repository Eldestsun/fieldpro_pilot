# 2026-05-10 — R2: Arrival Observations — Real Prior State

## What changed
- `arrivalObservations()` in `observationService.ts` is now async and queries `core.observations` for the most recent observation of each arrival type at the stop, rather than returning hardcoded dirty defaults
- Added `stopId?: string` parameter to `emitObservationsForStop()` — when provided, the real prior state lookup runs; when absent, the function falls back to dirty defaults (safe backward-compatible behaviour for callers that don't yet pass stopId)
- Extracted `arrivalObservationDefaults()` as the explicit fallback — called when stopId is unavailable or when no prior visit exists for the stop
- Added `ARRIVAL_OBSERVATION_TYPES` constant covering: `ground_condition`, `trash_can_condition`, `shelter_condition`, `pad_condition`
- SQL join path: `core.observations → core.visits → clean_logs → route_run_stops` — `clean_logs` is used as the bridge because `core.visits` has no `route_run_stop_id` column yet (pending Tier 5); `ORDER BY v.ended_at DESC, o.id DESC` ensures the most recent visit and the final (post-clean) observation within that visit is selected

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
