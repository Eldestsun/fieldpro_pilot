-- ISSUE-037 (final): physically DROP the last FOUR frozen adapter tables —
-- public.hazards, public.clean_logs, public.stop_photos, public.infrastructure_issues —
-- closing the Stage-3 structural cleanup of the ISSUE-031 work-attribution migration.
-- (trash_volume_logs dropped 2026-06-20; level3_logs dropped 2026-06-13.)
--
-- Parent: ISSUE-031 (Stage-2 write-clip complete). Gate: ISSUE-035 (reader repoints,
-- merged PR #121) + ISSUE-036 (stop_photos read-path pilot-gate) both closed. Since
-- Stage 2 these tables are FROZEN — written by nothing; canonical (core.*) is sole truth.
--
-- ── Gate re-confirmed at execution (2026-09-08, against fieldpro_db + live grep) ──
--   1. ZERO live CODE readers. Repo sweep over backend/src + frontend/src: no live
--      SELECT/JOIN/INSERT/UPDATE against any of the four tables (only clip-history
--      comments). ISSUE-035 moved the last three readers (populateEamBridge is_exception,
--      Control-Center skips-by-reason, loadRouteRunById spot-check photoKeys) onto
--      canonical; ISSUE-036 moved the stop_photos read path.
--   2. ONE DB-level dependency chain remained — the dead transit-first risk/export stack:
--         hazards, clean_logs, infrastructure_issues
--             └─> stop_status_mv (materialized view; 0 rows, no code reader)
--                     ├─> export_stop_status_v1        (view; no code reader)
--                     └─> export_pool_daily_summary_v1 (view; no code reader)
--      This whole stack is vestigial: the design context doc records these MVs as
--      "dead in code" (planning/architecture/2026-06-06-issue-018-phase-0-context.md),
--      grep finds no reader of the MV or either export view anywhere in backend/src or
--      frontend/src, and the live risk surface is riskMapService -> stop_risk_snapshot
--      (canonical), NOT this MV. It must be removed to unblock the table drops; leaving
--      it would make the drops impossible (Postgres refuses to drop a table an MV reads).
--   3. Only inbound FKs were the dead pointer columns route_run_stops.hazard_id ->
--      hazards and route_run_stops.infra_issue_id -> infrastructure_issues (both
--      permanently NULL post-clip). The card's scope drops these dead columns here.
--   4. stop_photos has NO inbound FK and NO dependent view/MV — it drops on its own.
--   5. needs_facilities is a COLUMN on infrastructure_issues (ISSUE-034 decided its
--      removal); it drops automatically when that table drops.
--   6. No triggers on any of the four tables. Owned sequences, indexes, and RLS
--      policies drop automatically with each table; grants vanish with the objects.
--
-- Ownership: 4 tables owned by fieldpro_admin (the migrate runner's role, BYPASSRLS);
-- MV + export views owned by fieldpro, droppable by fieldpro_admin as a role member.
-- CI runs migrations as a privileged role. Recreation source, if ever needed:
-- 00000000_consolidated_schema.sql (tables/views) + 20260613_p1_2_redefine_stop_status_mv…
-- (final MV shape). No rollback file: these are empty, dead, frozen objects at pilot.
--
-- Idempotent (IF EXISTS throughout) so the clean-room fresh-build gate — which CREATEs
-- these objects earlier in the sequence and then DROPs them here — and any re-run are
-- both safe. Ordered dependents-first: views -> MV -> FK columns -> base tables.

-- 1. Dead export views over the dead MV.
DROP VIEW IF EXISTS public.export_pool_daily_summary_v1;
DROP VIEW IF EXISTS public.export_stop_status_v1;

-- 2. Dead transit-first risk MV (0 rows, no code reader; canonical replacement is
--    stop_risk_snapshot via riskMapService).
DROP MATERIALIZED VIEW IF EXISTS public.stop_status_mv;

-- 3. Dead pointer columns on route_run_stops (drops their FKs to hazards /
--    infrastructure_issues). Permanently NULL post-clip; nothing reads them.
ALTER TABLE public.route_run_stops DROP COLUMN IF EXISTS hazard_id;
ALTER TABLE public.route_run_stops DROP COLUMN IF EXISTS infra_issue_id;

-- 4. The four frozen adapter tables. No CASCADE: with steps 1–3 done these have zero
--    dependents, so a plain DROP succeeds and any UNEXPECTED dependency fails loudly
--    instead of being silently removed. needs_facilities drops with infrastructure_issues.
DROP TABLE IF EXISTS public.hazards;
DROP TABLE IF EXISTS public.clean_logs;
DROP TABLE IF EXISTS public.stop_photos;
DROP TABLE IF EXISTS public.infrastructure_issues;
