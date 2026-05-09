# 2026-05-08 — Tier 6D: Remove Hardcoded Localhost

## What changed
- `backend/src/db.ts` — replaced hardcoded host, port, user, password, and database
  literals with env var lookups (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`,
  `PGDATABASE`), with existing local-dev values as fallbacks. Also supports
  `DATABASE_URL` connection string (takes precedence over individual vars).
- `backend/.env.example` — rewritten to document all required env vars:
  database (PG* and DATABASE_URL), PORT, OSRM_BASE_URL, Azure Entra vars,
  MinIO vars, TZ, and migration runner invocation pattern.

## Why
- Hardcoded credentials in `db.ts` would fail in any containerised or
  non-local environment where the DB is addressed by container name or
  remote hostname rather than `localhost`.
- Sub-task D of Tier 6: all service addresses must come from environment
  variables so the backend can be deployed outside local dev.

## Files touched
- `backend/src/db.ts`
- `backend/.env.example`
