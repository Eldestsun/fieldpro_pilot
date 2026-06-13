-- ISSUE-031 P1.1: evict four dead core.v_*_transit views
-- Gate cleared: zero app readers (backend/src + frontend/src), zero pg_depend dependencies
-- Step 1.2 (level3_logs drop) is OUT OF SCOPE — blocked by public.stop_status_mv dependency
-- See: planning/architecture/2026-06-13-issue-031-migration-sequence.md §P1

DROP VIEW IF EXISTS core.v_infra_transit;
DROP VIEW IF EXISTS core.v_level3_logs_transit;
DROP VIEW IF EXISTS core.v_stop_photos_transit;
DROP VIEW IF EXISTS core.v_trash_volume_logs_transit;
