# 2026-06-20 — ISSUE-037 (partial): DROP public.trash_volume_logs (first frozen adapter table)

## What changed
- Physically dropped `public.trash_volume_logs` via forward migration
  `backend/migrations/20260620_issue037_drop_trash_volume_logs.sql`
  (`DROP TABLE public.trash_volume_logs;`). The owned sequence
  `trash_volume_logs_id_seq`, all indexes, and the `org_isolation` RLS policy were
  dropped automatically with the table.
- Removed a now-dead teardown `DELETE FROM trash_volume_logs` from
  `backend/tests/canonical/cleanLogsCanonicalPivot.test.ts` (the table no longer exists;
  the sibling `clean_logs` cleanup is retained).

## Why
- ISSUE-037 Stage 3 of the ISSUE-031 adapter→core migration: physically remove the
  frozen adapter tables so the Postgres schema tells the truth about the real
  adapter-layer shape. `trash_volume_logs` is the **FIRST droppable** of the five frozen
  tables (per the ISSUE-037 card): no identity column, no FK pointer, no live readers.
  The other four (`hazards`, `clean_logs`, `stop_photos`, `infrastructure_issues`) remain —
  they still have readers tracked in ISSUE-035 / ISSUE-036.
- The dual-write mirror was clipped on 2026-06-18
  (`2026-06-18-issue-031-trash-volume-stage2-write-clip.md`); the table has been FROZEN
  (written by nothing) since. Canonical is the sole source of truth.

## Phase-1 confirmation (live proof gathered before any DDL)
Against `fieldpro_db` + live grep, 2026-06-20:
1. **Zero live readers.** `grep -rn trash_volume_logs backend/src` → 4 hits, all comments /
   canonical-replacement notes (`cleanLogService.ts:132`, `infrastructureIssueService.ts:3`,
   `riskMapService.ts:47`, `:106`). Zero `INSERT/UPDATE/SELECT ... trash_volume_logs` in live
   code. The only historical reader, `rebuildStopRiskSnapshotLegacy()`, was deleted in the
   ISSUE-031 capstone (PR #46, commit `1b3c602`).
2. **Write clipped.** `cleanLogService.ts` keeps only `UPDATE route_run_stops SET trash_volume`;
   the `INSERT INTO trash_volume_logs` is gone. No live writer.
3. **No FK pointer.** `pg_constraint`: 0 incoming FKs (`confrelid = trash_volume_logs`). The 4
   constraints on the table all point **outward** (→ `route_run_stops`, `transit_stops`,
   `assets`, `core.visits`). `route_run_stops.trash_volume` is a `smallint` VALUE column, not a
   pointer — unlike hazards there is no `route_run_stops.trash_volume_id`.
4. **Canonical serves the data.** `riskMapService.ts` `trash` CTE reads
   `core.observations` (`observation_type='trash_volume'`, `payload.level`). Losslessness
   re-confirmed in `docs/audit/2026-06-18-issue-031-losslessness-reverify.md` (`volume` →
   `payload.level`, exact). Live canonical query returned 4 trash_volume observations across
   3 assets post-drop.
5. **No dependent objects.** `core.v_trash_volume_logs_transit` was already dropped
   (`20260613_p1_drop_dead_transit_views.sql`); `pg_depend` shows 0 dependent views/rules,
   0 triggers; grants were owner-only (`mcp_readonly` revoked in `20260612`). `stop_status_mv`
   does **not** reference this table (trash avg comes from `stop_risk_snapshot`).

The hard gate (any live reader / FK pointer / dependent object / live write ⇒ STOP) was clean,
so the drop proceeded.

## Changes
| Path | Change |
|---|---|
| `backend/migrations/20260620_issue037_drop_trash_volume_logs.sql` | New forward migration — `DROP TABLE public.trash_volume_logs` |
| `backend/tests/canonical/cleanLogsCanonicalPivot.test.ts` | Removed dead `DELETE FROM trash_volume_logs` teardown (table dropped) |

## Scope boundaries (explicitly NOT done)
- Only `public.trash_volume_logs` dropped. The other four frozen tables (`hazards`,
  `clean_logs`, `stop_photos`, `infrastructure_issues`) are untouched — gated on ISSUE-035
  reader repoints + ISSUE-036.
- No FK column dropped on `route_run_stops`/`route_runs` — there was none pointing at this table.
- No reader repointed (none existed).

## Verification (post-drop)
- Table absent: `to_regclass('public.trash_volume_logs')` → NULL; `\dt` → "Did not find any
  relation"; `pg_class` entries for the name → 0; owned sequence → NULL; RLS policies → 0.
- Migration recorded in `public.schema_migrations`
  (`20260620_issue037_drop_trash_volume_logs.sql`).
- `tsc --noEmit` clean on backend **and** frontend (exit 0 both).
- Backend suite **119/119** pass; frontend suite **27/27** pass.
- Canonical trash-volume read path functions with zero reference to the dropped table.

### Note — migration runner drift (pre-existing, NOT introduced here)
`npm run migrate` currently fails on the unrelated `20260613_create_transit_schema.sql`
(`schema "transit" already exists`) because the 20260613/14/17 ISSUE-031 migrations were
applied out-of-band (manual psql) and never recorded in `schema_migrations` (last recorded
entry is `20260612`). This migration was therefore applied the same way the recent siblings
were — direct psql as `fieldpro` (the table owner; ownership suffices for `DROP`), inside a
transaction that also records the `schema_migrations` row (mirroring the runner). On a fresh
deploy the runner would apply all of these in order and reach this file normally. The runner
drift is flagged here for a future reconciliation card; fixing it was out of scope for this
drop (bundling avoided).

## Files touched
- `backend/migrations/20260620_issue037_drop_trash_volume_logs.sql` (new)
- `backend/tests/canonical/cleanLogsCanonicalPivot.test.ts`
