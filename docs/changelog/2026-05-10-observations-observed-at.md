# 2026-05-10 — Rename core.observations.created_at → observed_at

## What changed
- `ALTER TABLE core.observations RENAME COLUMN created_at TO observed_at`
- Updated `observationService.ts` — `ORDER BY o.created_at DESC` → `o.observed_at DESC`
- Updated `loadRouteRunById.ts` — `o.created_at AS observed_at` → `o.observed_at` in SELECT; `o.created_at` → `o.observed_at` in GROUP BY

## Why
- `created_at` is a generic audit timestamp. On an observation row, the moment of recording is the observation time — `observed_at` is the correct domain name.
- `loadRouteRunById.ts` was already aliasing `o.created_at AS observed_at` in its query, confirming the intent. The alias is now unnecessary.
- Cleaned up before Tier 2 writes new queries against `core.observations`, so all future queries use the right column name from the start.

## Files touched
- `pg_state.sql` (regenerated)
- `backend/src/domains/observation/observationService.ts`
- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
