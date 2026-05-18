# 2026-05-08 — Tier 6A: Migration Runner

## What changed
- Added `backend/migrations/migrations_manifest.sql` — creates the `schema_migrations` tracking table
- Added `backend/scripts/migrate.ts` — ts-node migration runner that applies pending `.sql` files from `backend/migrations/` in filename order, tracks applied files in `schema_migrations`, wraps each migration in a transaction, rolls back and exits with code 1 on failure
- Added `"migrate": "ts-node scripts/migrate.ts"` to `backend/package.json` scripts

## Why
- The migrations directory has 30+ ad hoc SQL files with no runner and no applied-state tracking
- Without a runner there is no repeatable way to bring a new environment up to the correct schema, and no way to detect drift between environments
- Sub-task A of Tier 6 establishes the migration primitive that all subsequent schema changes (Tier 4, R10) depend on

## Files touched
- `backend/migrations/migrations_manifest.sql` (new)
- `backend/scripts/migrate.ts` (new)
- `backend/package.json` (added migrate script)
