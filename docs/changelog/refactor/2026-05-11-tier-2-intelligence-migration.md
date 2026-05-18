# 2026-05-11 — Tier 2: intelligence migration to canonical core.*

Tier 2 of the refactor moves intelligence reads off the transit-vertical legacy tables and onto the canonical layer. See `planning/TIER_2_INTELLIGENCE_MIGRATION.md`.

## What changed

### Change 1 — `rebuildStopRiskSnapshot()` canonical CTEs
`backend/src/intelligence/riskMapService.ts`:
- Rewrote the four score CTEs (`l3`, `trash`, `haz`, `infra`) to read from `core.observations` and `core.visits` instead of `level3_logs`, `trash_volume_logs`, `hazards`, `infrastructure_issues`.
- Stop-identity translation: Path B/C from `planning/architecture/ADAPTER_BOUNDARY.md` — `transit_stop_assets` on `asset_id` (filtered `active = TRUE AND role = 'primary'`). Path E (`core.visits.route_run_stop_id`) is unavailable until Tier 5.
- `trash`: reads level from `payload->>'level'` jsonb (no `observed_value` column exists on `core.observations`).
- `haz`: filters `observation_type = 'safety_concern_present'` (the canonical umbrella; `hazard_present` is not an emitted type). `last_hazard_severity` hardcoded to `1.0` because `core.observations.severity` is never written. See ISSUE-007.
- `infra`: filters `observation_type = 'infrastructure_issue_present'`. Severity proxy: `LEAST(COUNT(*), 5)` in place of `AVG(severity)`.
- Scoring weights (`HOTSPOT_BASE_WEIGHT`, `L3_DAYS_WEIGHT`, `TRASH_VOL_WEIGHT`, `HAZARD_BASE_WEIGHT`, `L3_DAYS_CAP`, target-day constants) unchanged.
- Base CTE already used lowercase `stop_id` (the `public.stops` view exposes lowercase columns over `transit_stops`) — no `"STOP_ID"` rename needed in this file.

### Change 2 — additive verification harness
- Added `rebuildStopRiskSnapshotLegacy()` preserving the previous legacy-table query verbatim, per Tier 2 additive discipline.
- Verified structurally: both functions execute without error against the live DB, producing 206 rows each (the `pool_id IS NOT NULL AND (has_trash OR compactor)` base set). All four score sources are currently empty on both the canonical and legacy sides, so distributions are trivially identical (driven only by the `L3_DAYS_CAP` default and `HOTSPOT_BASE_WEIGHT`).
- Runtime distribution comparison is **deferred to the first real field session** that produces canonical observations through the Tier 1 emit path. The current DB has 0 rows in `core.observations`, 1 row (uncompleted) in `core.visits`, and 0 rows in every legacy source table — no data on either side to compare.

### `arrivalObservations()` hardening
`backend/src/domains/observation/observationService.ts`:
- Added `tsa.active = TRUE AND tsa.role = 'primary'` to the `transit_stop_assets` join so historical or secondary asset re-pairings cannot leak into the prior-state lookup. Query structure, observation types, and post-processing are unchanged.
- The Path A → Path B migration of this function landed earlier in commit `e231ed9`; this is a follow-on hardening, not a re-migration.

### Documentation
- `planning/architecture/ADAPTER_BOUNDARY.md` §6 rewritten — removed the stale claim that `arrivalObservations()` uses Path A (`clean_logs` bridge). It uses Path B and has since `e231ed9`. Noted the active/role filter addition.
- `docs/KNOWN_ISSUES.md` — added ISSUE-007 (hazard severity not captured in canonical observations) to track the underweighting of high-severity hazards until the write path is updated.

## Why
- Tier 2 of the refactor migrates intelligence reads off the transit-vertical legacy tables and onto the canonical layer. `riskMapService` now consumes the same operational truth that `core.observations` / `core.visits` already capture, instead of duplicating it through transit-only event logs.
- The legacy function is preserved during the verification window so the canonical output can be diff-checked once real data exists.
- The arrival-read hardening prevents a class of correctness bug (wrong asset's history bleeding into a stop's prior state) that the original Path B join had no defense against.

## Files touched
- `backend/src/intelligence/riskMapService.ts`
- `backend/src/domains/observation/observationService.ts`
- `planning/architecture/ADAPTER_BOUNDARY.md`
- `docs/KNOWN_ISSUES.md`
- `planning/REFACTOR_INDEX.md`
- `docs/changelog/2026-05-11-tier-2-intelligence-migration.md` (this file)

## Verification
- `tsc --noEmit` clean.
- Live smoke: `rebuildStopRiskSnapshot()` and `rebuildStopRiskSnapshotLegacy()` both wrote 206 rows; `combined_risk_score` distribution identical (avg 67.229, max 78.800) — entirely the default `L3_DAYS_CAP` + hotspot contribution since all four score sources are empty.

## Follow-ups (out of scope for Tier 2)
- KI-001: emit `severity` on `core.observations` from the write path so the hazard CTE can derive a real `MAX(severity)` rather than a hardcoded `1.0`.
- After Tier 5 writes `core.visits.route_run_stop_id`, the `l3` CTE can switch from Path B/C to Path E (shorter, safer adapter boundary).
- After Tier 8 makes `asset_id` the canonical caller-supplied identity, `arrivalObservations()` can drop its `stopId` parameter and the `transit_stop_assets` join entirely (Path F).
- Re-run the canonical-vs-legacy distribution comparison after the first real field session and confirm within the 10% delta from the Tier 2 done-criteria.
- Delete `rebuildStopRiskSnapshotLegacy()` once that comparison passes.
- Stale-doc sweep: `ADAPTER_BOUNDARY.md` §1 still claims `core.observations` has 31 rows and `asset_id` is 87/87 populated. The current DB has 0 rows. Refresh the row-count column when the DB has real data again.
