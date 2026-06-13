# 2026-06-13 — ISSUE-031 P1.2: redefine `stop_status_mv`, drop `public.level3_logs`

## What changed
- Created forward migration
  `backend/migrations/20260613_p1_2_redefine_stop_status_mv_drop_level3logs.sql`
  and its down-script
  `backend/migrations/rollback/20260613_p1_2_redefine_stop_status_mv_drop_level3logs_rollback.sql`.
- Redefined the `public.stop_status_mv` materialized view to remove the dead
  `l3_events` CTE (which read the empty `public.level3_logs` table) and the
  now-redundant `l3_unified` passthrough CTE. Every reference to
  `l3_unified.last_l3_at` is replaced with `clean_visits.last_l3_from_clean_at`
  directly. All other CTEs, columns, joins, and ordering are reproduced verbatim
  from the live definition.
- Because Postgres has no `CREATE OR REPLACE MATERIALIZED VIEW`, the migration
  drops the two dependent export views
  (`public.export_stop_status_v1`, `public.export_pool_daily_summary_v1`),
  drops and recreates the MV, recreates both indexes
  (`stop_status_mv_stop_id_uniq`, `stop_status_mv_pool_idx`), then recreates the
  two export views verbatim.
- Restores ownership (`fieldpro`) and grants that `DROP`+`CREATE` does not carry:
  `stop_status_mv` → `mcp_readonly`, `intelligence_reader`; both export views →
  `mcp_readonly`. Grants are issued under `SET ROLE fieldpro` so the resulting
  ACL grantor matches the pre-migration objects byte-for-byte.
- Dropped `public.level3_logs` (and its owned sequence `level3_logs_id_seq`) —
  now safe: no DB dependents remain after the MV redefine.
- Applied to `fieldpro_db` as the `postgres` superuser (BYPASSRLS): the source
  tables are `FORCE ROW LEVEL SECURITY` and `fieldpro` is not bypassrls, so the
  superuser populate materializes the all-org row set (14,916), matching the
  pre-migration count.

## Why
- ISSUE-031 P1, Step 1.2 of the migration sequence
  (`planning/architecture/2026-06-13-issue-031-migration-sequence.md` §P1).
- P1.1 left `public.level3_logs` undroppable because `stop_status_mv` referenced
  it via the `l3_events` CTE. Investigation (prior session, re-verified here)
  proved the CTE is a no-op: `level3_logs` holds 0 rows, so `l3_events` returns
  0 rows, the `FULL JOIN` in `l3_unified` reduces to a passthrough of
  `clean_visits`, and `GREATEST(last_l3_from_clean_at, NULL) = last_l3_from_clean_at`.
  Removing it is output-identical.
- Removes a dead table carrying a `user_id` worker-identity column from the
  schema — a net reduction in identity surface (labor-safety positive).

## Phase verification (paste-back)
Pre-migration substitution proof (`postgres` MCP):

| Check | Query | Result |
|-------|-------|--------|
| MV count (before) | `SELECT count(*) FROM public.stop_status_mv;` | `14916` |
| `stops_legacy` all-org | `SELECT count(*) FROM public.stops_legacy;` | `14916` |
| l3 substitution is exact | `last_l3_completed_at IS DISTINCT FROM clean_visits.last_l3_from_clean_at` over all rows | `0` mismatches |
| `level3_logs` rows | `SELECT count(*) FROM public.level3_logs;` | `0` |

Post-migration (`postgres` MCP):

| Check | Query | Result |
|-------|-------|--------|
| MV count (after) | `SELECT count(*) FROM public.stop_status_mv;` | `14916` |
| `level3_logs` gone | `SELECT count(*) FROM information_schema.tables WHERE table_name='level3_logs';` | `0` |
| export view 1 | `SELECT count(*) FROM public.export_stop_status_v1;` | `14916` (no error) |
| export view 2 | `SELECT count(*) FROM public.export_pool_daily_summary_v1;` | `8` (no error) |
| no dead refs | `position('level3_logs'/'l3_events'/'l3_unified' in viewdef)` | `0` / `0` / `0` |
| owner + ACL | `pg_class` for the three objects | `fieldpro` owner; `mcp_readonly` + (MV only) `intelligence_reader` grants restored, grantor `fieldpro` |

## Files touched
- `backend/migrations/20260613_p1_2_redefine_stop_status_mv_drop_level3logs.sql` (new)
- `backend/migrations/rollback/20260613_p1_2_redefine_stop_status_mv_drop_level3logs_rollback.sql` (new)
- `docs/changelog/refactor/2026-06-13-issue-031-p1-2-level3logs-drop.md` (new)
