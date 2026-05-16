# 2026-05-15 — Render build fixes: frontend TS errors + migration ordering

## What changed
- `frontend/src/components/today-route/__tests__/StopWizard.test.tsx`: updated two `PhotoDto` mock objects to include `kind`, `captured_at`, and `created_by_oid` fields (and corrected `id` from number to string) to match the current type definition
- `frontend/src/test-setup.ts`: replaced `global.URL` with `globalThis.URL` to eliminate the "Cannot find name 'global'" TypeScript error
- `frontend/vite.config.ts`: removed the `/// <reference types="vitest" />` triple-slash directive and the `test: {}` config block; vitest config moved to standalone `frontend/vitest.config.ts`
- `frontend/vitest.config.ts`: new file — standalone vitest config that imports from `vitest/config` (correct type, no conflict with `UserConfigExport`)
- `backend/migrations/20251130_base_schema.sql`: new migration that creates the ten foundational tables that pre-date the migration system (`organizations`, `asset_types`, `bases`, `assets`, `route_pools`, `stops`, `route_runs`, `route_run_stops`, `clean_logs`, `stop_risk_snapshot`) plus the `core` schema; all DDL uses `IF NOT EXISTS` so the migration is idempotent against the existing dev database

## Why
- `tsc -b && vite build` in the frontend Dockerfile compiled test files, surfacing three TypeScript errors that are harmless in Vitest but fatal under plain `tsc`
- The Render deployment runs `migrate.js` against a fresh PostgreSQL instance where the foundational tables (created manually before the migration system was introduced) do not exist; `20251201_add_stop_photos.sql` failed immediately because `public.route_run_stops` was absent, which cascaded to `20251202_intelligence_foundation.sql` and `20251203_add_details_to_hazards.sql` also failing

## Files touched
- `frontend/src/components/today-route/__tests__/StopWizard.test.tsx`
- `frontend/src/test-setup.ts`
- `frontend/vite.config.ts`
- `frontend/vitest.config.ts`
- `backend/migrations/20251130_base_schema.sql`
- `docs/changelog/2026-05-15-render-build-fixes.md`
