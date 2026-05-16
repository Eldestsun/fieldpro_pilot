# 2026-05-15 — Fix materialized-view migration ordering

## What changed
- Renamed `backend/migrations/20251208_mv_v1.sql` → `20251207_mv_v1.sql`

## Why
- `20251208_mv_migration_patch_uniqueIndexForConcurrentRefresh.sql` adds unique indexes to the five materialized views created by `mv_v1.sql`; alphabetically `_mv_m…` sorts before `_mv_v…`, so the patch ran first on a fresh database (Render) and failed with "relation does not exist"
- Renaming the create file to `20251207` ensures it sorts one day ahead of the patch in all filename-sorted migration runners

## Files touched
- `backend/migrations/20251207_mv_v1.sql` (renamed from 20251208_mv_v1.sql)
- `docs/changelog/2026-05-15-fix-mv-migration-ordering.md`
