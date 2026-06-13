# 2026-06-13 — ISSUE-031 P1.1: evict four dead `core.v_*_transit` views

## What changed
- Created forward migration `backend/migrations/20260613_p1_drop_dead_transit_views.sql`.
- Migration drops four dead transit translation views from `core`:
  - `core.v_infra_transit`
  - `core.v_level3_logs_transit`
  - `core.v_stop_photos_transit`
  - `core.v_trash_volume_logs_transit`
- All four use `DROP VIEW IF EXISTS` (idempotent).
- Applied to `fieldpro_db` as the `postgres` superuser — four `DROP VIEW` results.
- The five live transit adapter views (`v_asset_locations_transit`,
  `v_assignments_transit`, `v_clean_logs_transit`, `v_hazards_transit`,
  `v_locations_transit`) are **not** in the drop list and remain in `core`.

## Why
- ISSUE-031 P1, Step 1.1 of the migration sequence
  (`planning/architecture/2026-06-13-issue-031-migration-sequence.md` §P1).
- These four views are dead weight: the gate check (run in a prior session and
  treated as confirmed for this task) found **zero application readers** in
  `backend/src` / `frontend/src` and **zero `pg_depend` dependencies** on any of
  the four. Evicting them shrinks the canonical↔transit surface ahead of the
  later view-eviction work that relocates live adapters into the `transit.*`
  schema created in P0.
- Step 1.2 (dropping `level3_logs`) is **out of scope** here: `public.stop_status_mv`
  still depends on `level3_logs`, so that drop is blocked and deferred.

## Phase verification (paste-back)
Run against `fieldpro_db` as superuser (`postgres` MCP):

| Check | Query | Result |
|-------|-------|--------|
| Before | `SELECT count(*) FROM information_schema.views WHERE table_schema='core' AND table_name IN (the four names);` | `4` |
| Apply | `psql -f 20260613_p1_drop_dead_transit_views.sql` | `DROP VIEW` ×4 |
| After | `SELECT count(*) FROM information_schema.views WHERE table_schema='core' AND table_name IN (the four names);` | `0` |
| Survivors | `SELECT table_name FROM information_schema.views WHERE table_schema='core' AND table_name LIKE '%transit%';` | 5 live adapter views remain |

## Files touched
- `backend/migrations/20260613_p1_drop_dead_transit_views.sql` (new)
- `docs/changelog/refactor/2026-06-13-issue-031-p1-dead-view-eviction.md` (new)
