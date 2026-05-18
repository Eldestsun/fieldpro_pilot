# 2026-05-15 — Fix consolidated schema sed duplication artifact

## What changed

- `backend/migrations/00000000_consolidated_schema.sql` — removed doubled `IF NOT EXISTS` on the `CREATE SCHEMA` statement (line 30). The previous session's sed replacement of `CREATE SCHEMA` → `CREATE SCHEMA IF NOT EXISTS` ran against a line that had already been manually updated to include `IF NOT EXISTS`, producing `CREATE SCHEMA IF NOT EXISTS IF NOT EXISTS core;` which is a syntax error.

## Why

- Render (and any fresh-DB deployment) would fail immediately at this line with `syntax error at or near "NOT"`, blocking all subsequent migrations and preventing the backend from starting.
- The fix is a single-word removal; all other idempotency transformations (OR REPLACE, IF NOT EXISTS for tables/indexes/sequences, DROP TRIGGER IF EXISTS for triggers) were applied correctly and are unaffected.

## Files touched

- `backend/migrations/00000000_consolidated_schema.sql`
- `docs/changelog/2026-05-15-fix-consolidated-schema-syntax.md` (this file)
