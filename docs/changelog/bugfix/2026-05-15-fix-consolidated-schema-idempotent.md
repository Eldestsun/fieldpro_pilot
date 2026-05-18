# 2026-05-15 — Fix consolidated schema to be fully idempotent

## What changed

- `backend/migrations/00000000_consolidated_schema.sql` — made every CREATE
  statement safe to run against a DB that already has some objects:
  - `CREATE FUNCTION` → `CREATE OR REPLACE FUNCTION` (5 functions)
  - `CREATE TABLE` → `CREATE TABLE IF NOT EXISTS` (35 tables)
  - `CREATE INDEX` → `CREATE INDEX IF NOT EXISTS` (61 indexes)
  - `CREATE UNIQUE INDEX` → `CREATE UNIQUE INDEX IF NOT EXISTS` (10 unique indexes)
  - `CREATE SEQUENCE` → `CREATE SEQUENCE IF NOT EXISTS` (19 sequences)
  - `CREATE SCHEMA` → `CREATE SCHEMA IF NOT EXISTS` (already done, confirmed)
  - `CREATE TRIGGER` → `DROP TRIGGER IF EXISTS <name> ON <table>;` prepended
    before each `CREATE TRIGGER` (5 triggers)
- `docs/ops/render-deploy.md` — added "Recovering from a failed consolidated
  schema migration" section documenting the DB reset procedure and when it
  applies.

## Why

- Render's DB had partial state from earlier deployment attempts that used the
  legacy per-file migration approach. When the consolidated schema was deployed,
  the migration runner tried to apply `00000000_consolidated_schema.sql` but
  failed immediately on `CREATE FUNCTION enforce_route_runs_pool_invariant`
  because that function already existed from a previously applied legacy
  migration file.
- Making every CREATE idempotent means the consolidated schema can now apply
  cleanly even if some objects exist, removing the hard dependency on a
  perfectly empty DB.
- The immediate fix for Render's current state is still a DB reset (documented
  in the runbook) since the partial state includes tables and constraints that
  the idempotent forms alone cannot reconcile cleanly.

## Files touched

- `backend/migrations/00000000_consolidated_schema.sql`
- `docs/ops/render-deploy.md`
- `docs/changelog/2026-05-15-fix-consolidated-schema-idempotent.md` (this file)
