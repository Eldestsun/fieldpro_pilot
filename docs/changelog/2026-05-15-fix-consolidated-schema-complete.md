# 2026-05-15 — Complete audit and fix of consolidated schema on fresh DB

## What changed

- `backend/migrations/00000000_consolidated_schema.sql` — fixed one sed duplication artifact: `CREATE SCHEMA IF NOT EXISTS IF NOT EXISTS core;` → `CREATE SCHEMA IF NOT EXISTS core;` (already committed in prior fix)

## Audit results

Full consolidated schema applied via both `psql` and the migration runner (`migrate.ts`) against two independent fresh Postgres 14 containers (port 5433 and 5434):

- **psql run**: zero errors — all CREATE statements succeeded, 53 tables visible in `information_schema`
- **Runner run**: `apply 00000000_consolidated_schema.sql` followed by 58 `skip (legacy)` lines — `Migration run complete.` with exit 0

No additional errors found beyond the `CREATE SCHEMA` duplication fixed in `2026-05-15-fix-consolidated-schema-syntax.md`.

The `column h.asset_id does not exist` error reported in the Render logs was caused by the consolidated schema failing before reaching the view definitions (due to the syntax error), leaving Render's DB in a state where it fell through to legacy migration files that referenced objects in the wrong order. On a clean DB with the syntax error fixed, the schema applies in full and the column reference is valid.

## Why

- Render staging was blocked with a syntax error that prevented any fresh-DB deployment from succeeding.
- A complete audit was performed rather than single-error iteration to confirm no other issues remain.

## Files touched

- `backend/migrations/00000000_consolidated_schema.sql` (fix already committed)
- `docs/changelog/2026-05-15-fix-consolidated-schema-complete.md` (this file)
