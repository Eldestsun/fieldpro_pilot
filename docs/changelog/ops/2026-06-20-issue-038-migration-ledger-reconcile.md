# 2026-06-20 — Migration-ledger reconciliation + idempotency guards (ISSUE-038)

## What changed

**PART 1 — record the 11 hand-applied canon migrations, runner-owned (new file)**
- Added `backend/migrations/00000001_reconcile_issue038_record_canon_drift.sql`. It is
  named to sort immediately after `00000000_consolidated_schema.sql` and before the
  `20260613_*` canon batch, so on an already-populated DB it records the 11 drifted
  ISSUE-031 migrations in `schema_migrations` **before** the runner can collide on them.
- Each `INSERT` is gated on a **catalog probe of that migration's own already-present
  effect** (`pg_namespace`, `to_regclass`, `information_schema.columns`, `pg_class`),
  so it is **fresh-safe**: on an empty DB the effects don't exist yet → every gate is
  false → nothing is recorded → the runner applies all 11 for real. Catalog-only probes
  also mean the file can never trip RLS or error on a FORCE-RLS table.
- It records the 7 catalog-verifiable migrations (#1 transit schema, #2 MV redefine /
  level3_logs drop, #3 dead-view drop, #4 obs columns, #5 registry contract, #7
  normalized view, #10 view grant). The 4 pure-data backfills (#6 step3 rules, #8 step6
  backfill, #9 hazard/infra severity, #11 presence passthrough) have no honest catalog
  probe and are deliberately left for the runner to re-run as idempotent **0-row no-ops**
  under the app role's RLS.

**PART 2 — idempotency guards on the 11 (edited 2 files)**
- `20260613_create_transit_schema.sql`: `CREATE SCHEMA transit` → `CREATE SCHEMA IF NOT
  EXISTS transit`.
- `20260613_p1_2_redefine_stop_status_mv_drop_level3logs.sql`: `DROP TABLE` →
  `DROP TABLE IF EXISTS`; `CREATE [UNIQUE] INDEX` → `IF NOT EXISTS`; export views →
  `CREATE OR REPLACE VIEW`. **Plus a real fresh-build fix:** added `DROP VIEW IF EXISTS
  core.v_level3_logs_transit;` before the `DROP TABLE`, because the runner sorts files
  lexically and `"p1_2"` < `"p1_drop"`, so this file runs **before** the sibling that
  normally drops that dependent view; without it the fresh build fails *"cannot drop
  table level3_logs because other objects depend on it."*
- The other 9 were already idempotent (`ADD COLUMN IF NOT EXISTS`, guarded `ADD
  CONSTRAINT` DO-blocks, `DROP VIEW IF EXISTS`, `CREATE OR REPLACE VIEW`, idempotent
  UPDATEs) — audited, no change needed.

**Runner — honor mid-run ledger inserts (edited `backend/src/scripts/migrate.ts`)**
- The runner snapshotted the applied-set **once** before the loop, so rows the reconcile
  migration inserts mid-run were invisible and the loop still tried to re-run them.
  Added a re-read of `schema_migrations` after each successful apply, merged into the
  in-memory skip set. Minimal and additive (only ever *adds* genuinely-recorded
  filenames to the skip set).

## Why

- `npm run migrate` against an already-populated DB died on the first unrecorded canon
  file (`CREATE SCHEMA transit` → "already exists" / "must be owner"). The 11 ISSUE-031
  canon migrations were hand-applied via `psql` and never recorded — the §4a gate of the
  ISSUE-038 card confirmed all 11 EFFECT-PRESENT (card §6), so recording them is truth.
- **Record-and-skip, not re-run, is load-bearing for #2.** The runner connects as the
  non-bypassrls app role `fieldpro`. Re-running the MV-redefine migration through the
  runner would execute `CREATE MATERIALIZED VIEW ... AS SELECT` over FORCE-RLS source
  tables with no `app.current_org_id`, materializing **0 rows** — silently replacing the
  14,916-row `stop_status_mv` with an empty one. Idempotency guards stop the *error*;
  only the reconcile's skip stops the *data loss*.

## Verification (pre-commit, local — scratch DBs only, dev untouched)

Both done-criteria proven; dev `fieldpro_db` was never mutated (MV still 14,916,
canon-recorded still 0 afterward).

- **Criterion A — clean path (admin role, empty DB).** `CREATE EXTENSION pgcrypto` in
  consolidated requires an admin/superuser role, so a fresh provision runs migrations as
  the admin (the `fieldpro` app role is the runtime role, not the provisioner). On an
  empty DB the reconcile recorded **nothing** (fresh-safe, verified), the 11 applied
  fresh, and the run reached `exit 0 / "Migration run complete."` with all 11 recorded; a
  re-run was a pure no-op. The clean-built schema **matches the dev known-good** under
  `pg_dump --schema-only --no-owner --no-privileges` (only diff: pg_dump's random
  `\restrict` tokens + 3 `COMMENT ON POLICY` lines the clean build *has* and dev lacks).
- **Criterion B — re-run path (app role `fieldpro`, canonical-state clone of dev).**
  `exit 0`, no collision. Reconcile recorded the 7 catalog migrations → #1–#5/#7/#10
  **skipped** (incl. #2, so the MV was **not** re-materialized); the 4 data backfills
  re-ran as 0-row no-ops. **Corruption tripwire: `stop_status_mv` stayed 14,916 rows.**
  A second run was a pure no-op (0 applies). Data integrity intact (observations 38,
  obs_kind 38/38, trash_volume `ok_rule.lte`=1, presence severity_map 18).
- **Regression proof:** with the fix stashed, the pre-fix clean build fails at the
  identical line, confirming the fix introduced no new clean-path breakage.

## Findings (out of ISSUE-038 scope — reported, not fixed)

1. **Second clean-build blocker at `20260612_mcp_readonly_revoke_canonical_only.sql`.**
   Its step-6 assertion requires `mcp_readonly` to hold SELECT on `core.observations`,
   but `00000000_consolidated_schema.sql` never grants it (dev has it from a source not
   reproduced in consolidated). The first-ever clean-room rebuild surfaces this — same
   *class* as ISSUE-038 (consolidated/ledger drift), a separate card. Bypassed as a
   labeled test instrument to isolate the 11; NOT fixed here (touches labor-safety grant
   boundaries — needs a scoped decision).
2. **Live environments still carry the drift until `npm run migrate` is run post-merge**
   (as an admin role for a fresh DB; as `fieldpro` for an already-populated one). Dev was
   intentionally not reconciled before review/merge.

## Standing rule added

`baseline/fieldpro_pilot/CLAUDE.md` — no out-of-band `psql` apply of a migration without
recording it in `schema_migrations` in the same step. That habit created this drift.
