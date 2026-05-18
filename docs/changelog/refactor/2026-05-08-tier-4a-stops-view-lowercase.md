# 2026-05-08 — Tier 4A: Stops View Column Rename

## What changed
- Added `backend/migrations/20260508_stops_view_lowercase_columns.sql` — drops the
  `public.stops` compat view and recreates it with unquoted lowercase column names
  matching the underlying `transit_stops` columns. Re-attaches the
  `trg_stops_readonly` INSTEAD OF trigger.
- Updated all backend query sites to use unquoted lowercase column names in SQL
  strings and lowercase keys when reading pg result rows.

## Why
- `public.stops` was a compat view introduced in phase 5c that re-exposed
  `transit_stops` lowercase columns as uppercase quoted aliases (`"STOP_ID"`,
  `"ON_STREET_NAME"`, etc.) so existing queries would not break. That shim is now
  replaced by a clean lowercase view so the codebase no longer depends on
  quoted identifiers.
- Quoted uppercase column names are a compatibility debt: they require double-quotes
  in every SQL string, cause case-sensitive result row keys in pg driver output, and
  make Tier 2's intelligence SQL rewrite harder to verify correctly.
- Sub-task A of Tier 4: prerequisite for Tier 2 (`riskMapService.ts` rewrite).

## Files touched
- `backend/migrations/20260508_stops_view_lowercase_columns.sql` (new)
- `backend/src/domains/routeRun/routeRunService.ts`
- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/src/modules/ops/opsRoutes.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/routes/devRoutes.ts`
- `backend/src/intelligence/riskMapService.ts` (one line)
