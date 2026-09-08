# 2026-09-08 — ISSUE-037 (final): DROP the last four frozen adapter tables

## What changed
Closed Stage-3 of the ISSUE-031 work-attribution migration by physically dropping
the last four frozen adapter tables — `public.hazards`, `public.clean_logs`,
`public.stop_photos`, `public.infrastructure_issues`. (`trash_volume_logs` was
dropped 2026-06-20; `level3_logs` on 2026-06-13.) The adapter layer's true
post-migration shape is now visible in Postgres — no vestigial tables masking it.

Migration: `backend/migrations/20260908_issue037_drop_frozen_adapter_tables.sql`.

### The dead dependency stack (the real remaining blocker)
The ISSUE-035 repo sweep cleared the last *code* readers, but three of the tables
still had a **DB-level** reader the sweep couldn't see: the materialized view
`public.stop_status_mv`, and on top of it two export views
(`export_stop_status_v1`, `export_pool_daily_summary_v1`). This whole stack is
vestigial transit-first tooling:
- `stop_status_mv` has **zero** code readers (only a comment in `migrate.ts`),
  currently 0 rows, and reads `stops_legacy` + `stop_risk_snapshot` + the three
  frozen tables. The design context doc lists it among MVs "dead in code"
  (`planning/architecture/2026-06-06-issue-018-phase-0-context.md`).
- Both export views read only from that MV; neither has any code reader.
- The live risk surface is `riskMapService` → `stop_risk_snapshot` (canonical),
  **not** this MV.

Postgres refuses to drop a table an MV reads, so removing this dead stack was
intrinsic to the card — not extra scope. The migration drops it dependents-first:
export views → MV → dead FK columns → base tables.

### Collateral drops (per card scope)
- `route_run_stops.hazard_id` and `route_run_stops.infra_issue_id` — the dead
  pointer columns (permanently NULL post-clip); dropping them removes their FKs to
  `hazards` / `infrastructure_issues`.
- `needs_facilities` — a column on `infrastructure_issues` (ISSUE-034 decided its
  removal); drops automatically with the table.

## Gate confirmation (at execution, 2026-09-08)
- **Zero code readers:** repo sweep over `backend/src` + `frontend/src` — no live
  SELECT/JOIN/INSERT/UPDATE against any of the four tables (only clip-history
  comments). ISSUE-035 (PR #121) + ISSUE-036 moved the last readers to canonical.
- **Dependency graph fully resolved:** the only inbound FKs were the two dead
  pointer columns; `stop_photos` had none; no triggers on any table. The MV/export
  stack was the only remaining DB-level dependency and is dropped here.
- **Applied via the runner** (`fieldpro_admin`, recorded in `schema_migrations` in
  the same step — ISSUE-038 discipline). Post-apply: all 7 objects gone
  (`to_regclass` NULL), both dead columns gone, zero orphan dependents.
- **Idempotent** (`IF EXISTS` throughout) — safe in the clean-room fresh-build
  sequence (which CREATEs then DROPs these) and on re-run.

## Tests
- `evidence.test.ts` (×3), `infraIssuesWriteClip.test.ts`, `cleanLogsCanonicalPivot.test.ts`,
  `ccExceptionsCanonical.test.ts`, `setup.ts` teardown: the write-clip proofs that
  used to query the mirror tables for "0 rows" now assert the stronger **structural**
  fact — `to_regclass('public.<table>') IS NULL` (the mirror is impossible, not just
  absent) — or drop the now-meaningless adapter check.
- Backend suite: **215 passed, 0 failed** against the post-drop dev DB. `tsc --noEmit`
  clean (backend). Clean-room from-empty replay is CI's gate (local cluster has no
  superuser to replay `CREATE EXTENSION pgcrypto`); this migration is append-only
  `IF EXISTS` with no later migration depending on it.
- `pg_state.sql` regenerated — the four tables, the MV, and both export views are
  absent from the dump.

## Files touched
- `backend/migrations/20260908_issue037_drop_frozen_adapter_tables.sql` (new)
- `backend/tests/setup.ts`
- `backend/tests/canonical/evidence.test.ts`
- `backend/tests/canonical/infraIssuesWriteClip.test.ts`
- `backend/tests/canonical/cleanLogsCanonicalPivot.test.ts`
- `backend/tests/canonical/ccExceptionsCanonical.test.ts`
- `planning/architecture/current_state.md` (§5.4/§5.5 marked DROPPED)
- `pg_state.sql` (regenerated)
- `docs/changelog/refactor/2026-09-08-issue-037-drop-frozen-adapter-tables.md` (this entry)

## Downstream
- Closes the ISSUE-031 Stage-3 structural cleanup: canonical (`core.*`) is now the
  sole source of truth with no frozen adapter vestiges in `public`.
- If a canonical stop-status roll-up MV is ever wanted, it is a fresh build on
  `core.*` (a new card) — the dropped transit-first version's definition survives in
  `00000000_consolidated_schema.sql` + `20260613_p1_2_redefine_stop_status_mv…`.
