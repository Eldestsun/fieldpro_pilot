# 2026-05-15 — Fix day7 migration ordering and phase5c FK sort bug

## What changed
- `backend/migrations/20251212_day7_intelligence_enforcement.sql` — new file, copied from `data/db/intelligence/day7_intelligence_enforcement.sql`; creates `public.stop_status_mv` (and its two indexes), which `20251212_day7_mv_hardening_and_exports.sql` requires at startup via an explicit guard
- `backend/migrations/20251222_phase5c_fk_transfer_transit_stops.sql` — renamed from `20251222_phase5c_FK_transfer_transit_stops.sql` (uppercase FK → lowercase fk)

## Why
**day7 / stop_status_mv:** `day7_intelligence_enforcement.sql` was never promoted into the migrations folder; it lived only in `data/db/intelligence/`. The hardening migration (`day7_mv_hardening_and_exports.sql`) raises an explicit exception if `stop_status_mv` is absent, so every fresh Render deploy failed here. Placing it at `20251212_day7_intelligence_enforcement.sql` puts it after the two `add_*` migrations that add `priority_class` and `origin_type` (which the MV query uses) and before `day7_mv_hardening_and_exports.sql` (i < m alphabetically).

**phase5c FK_transfer case bug:** Node.js `Array.prototype.sort()` is case-sensitive and sorts by Unicode code point, so `'F'` (70) < `'c'` (99). The uppercase `FK_transfer` filename therefore ran *before* `create_transit_stops`, causing `ADD CONSTRAINT … REFERENCES public.transit_stops` to fail on a fresh database because `transit_stops` did not yet exist. Lowercasing `FK` to `fk` puts the transfer last in the phase5c group (`f` > `e` > `c`), which is the correct dependency order: create → convert → escape_hatch → fk_transfer.

## Additional ordering issue noted (not fixed here — different problem type)
`20251223_001_route_run_identity.sql` and `20251223_assign_user_oid_route_runs.sql` appear to be duplicates (both `ALTER TABLE route_runs ADD COLUMN assigned_user_oid / created_by_oid`). On a fresh database `001` runs first (digit sorts before letter in Node.js), then `assign_user_oid_route_runs` fails with "column already exists." This needs a separate fix (remove the duplicate or add `ADD COLUMN IF NOT EXISTS`).

## Files touched
- `backend/migrations/20251212_day7_intelligence_enforcement.sql` (new — copied from data/db/intelligence/)
- `backend/migrations/20251222_phase5c_fk_transfer_transit_stops.sql` (renamed from FK_transfer)
- `docs/changelog/2026-05-15-fix-day7-migration-ordering.md`
