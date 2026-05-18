# 2026-05-13 — S1-7 EAM Bridge Route Log

## What changed
- Added `eam_bridge_route_log` table: one row per completed route run, containing
  `org_id`, `route_run_id`, `completed_at`, `stop_count`, `exception_count`, and
  a `canonical_summary` JSONB column with run_date, route_pool_id, and per-stop
  status data suitable for EAMS work-order generation
- Added `eam_bridge_populate_state` table: singleton watermark row that tracks the
  `finished_at` high-water mark of the last successful populate run
- Created `backend/src/scripts/populateEamBridge.ts`: selects completed `route_runs`
  closed since the last watermark, aggregates stop/exception counts, inserts one
  bridge row per run via `ON CONFLICT (route_run_id) DO NOTHING`, advances watermark
- Registered `pnpm eam-bridge:populate` in `backend/package.json`
- Added 3 integration tests in `backend/tests/canonical/eamBridge.test.ts`:
  labor-safety column check, correct stop/exception counts, idempotency

## Why
- S1-7 of Security Sprint 1: creates the structured EAMS integration surface that
  KCM IT will inspect to confirm BASELINE feeds EAMS rather than competing with it
- Structural labor safety: `eam_bridge_route_log` has no worker identity columns
  (`actor_oid`, `captured_by_oid`, `user_id`, `assigned_user_oid`) — enforced by
  schema and verified by a dedicated test on every CI run

## EAMS contract note
`eam_bridge_route_log` is the EAMS-facing contract surface. Any schema change
to this table (column add, rename, type change, drop) requires coordination with
KCM IT / the EAMS (Hexagon) team before deployment. Do not alter unilaterally.
Access model: read-only from EAMS; write-only from BASELINE populate script.

## Files touched
- `backend/migrations/20260513_eam_bridge_route_log.sql` (new)
- `backend/src/scripts/populateEamBridge.ts` (new)
- `backend/tests/canonical/eamBridge.test.ts` (new)
- `backend/tests/run.ts` (import added)
- `backend/package.json` (`eam-bridge:populate` script added)
