-- ISSUE-031 P1.2: redefine stop_status_mv (remove dead l3_events CTE), drop level3_logs
-- Investigation: l3_events CTE is no-op (level3_logs empty: 0 rows, 0-row join, byte-identical output).
--   Re-verified pre-migration: last_l3_completed_at == clean_visits.last_l3_from_clean_at for all
--   14,916 rows (0 mismatches), so dropping l3_events/l3_unified and pointing last_l3_at directly at
--   clean_visits.last_l3_from_clean_at is output-identical.
-- See: planning/architecture/2026-06-13-issue-031-migration-sequence.md §P1 (Step 1.2)
--
-- RUN AS: postgres (superuser / BYPASSRLS). Source tables (stops_legacy, clean_logs, hazards,
--   infrastructure_issues, stop_risk_snapshot) are FORCE ROW LEVEL SECURITY; fieldpro is NOT
--   bypassrls. Populating as postgres materializes the all-org row set (14,916), matching the
--   pre-migration count. Ownership and grants are restored to fieldpro below — DROP+CREATE does
--   NOT preserve them.
--
-- ── ISSUE-038 — MUST BE SKIPPED ON AN ALREADY-POPULATED DB, NOT RE-RUN ───────
-- The runner (`npm run migrate`) connects as the app role `fieldpro`, which is
-- NOT bypassrls. If this migration is RE-RUN through the runner against a DB that
-- already holds data, the `CREATE MATERIALIZED VIEW ... AS SELECT` reads the
-- FORCE-RLS source tables with NO `app.current_org_id` set, so it materializes
-- ZERO rows — silently replacing a 14,916-row MV with an empty one. That is data
-- corruption, not a harmless collision. Therefore on a populated DB this file is
-- RECORDED-AS-APPLIED and SKIPPED by the reconcile migration
-- (`00000001_reconcile_issue038_record_canon_drift.sql`), which gates on
-- `to_regclass('public.level3_logs') IS NULL` (this migration's distinctive,
-- already-applied effect). The IF NOT EXISTS / IF EXISTS guards added below are
-- for the FRESH-DB path only, where the source tables are empty and a 0-row MV is
-- correct. See ISSUE-038 card §6/§7.

BEGIN;

-- Step 1: Drop dependent export views (recreated below)
DROP VIEW IF EXISTS public.export_stop_status_v1;
DROP VIEW IF EXISTS public.export_pool_daily_summary_v1;

-- Step 2: Drop the MV (Postgres has no CREATE OR REPLACE MATERIALIZED VIEW)
DROP MATERIALIZED VIEW IF EXISTS public.stop_status_mv;

-- Step 3: Recreate stop_status_mv WITHOUT the l3_events / l3_unified CTEs.
--   Only change vs. the live definition: the l3_events CTE (reading the dead level3_logs table)
--   and the l3_unified passthrough are removed, and every reference to l3_unified.last_l3_at is
--   replaced with clean_visits.last_l3_from_clean_at directly. Everything else is verbatim.
CREATE MATERIALIZED VIEW public.stop_status_mv AS
 WITH risk AS (
         SELECT r.stop_id,
            r.days_since_last_l3,
            r.recent_trash_volume_avg,
            r.cleanliness_score,
            r.safety_score,
            r.infrastructure_score,
            r.hotspot_weight,
            r.l3_urgency_weight,
            r.combined_risk_score,
            r.computed_at
           FROM stop_risk_snapshot r
        ), haz_30d AS (
         SELECT h.stop_id,
            count(*) FILTER (WHERE h.reported_at >= (now() - '30 days'::interval)) AS hazards_30d,
            count(*) FILTER (WHERE h.reported_at >= (now() - '30 days'::interval) AND COALESCE(h.hazard_type, ''::text) ~~* '%needle%'::text) AS needles_30d,
            max(h.reported_at) AS last_hazard_at
           FROM hazards h
          GROUP BY h.stop_id
        ), infra_30d AS (
         SELECT i.stop_id,
            count(*) FILTER (WHERE i.reported_at >= (now() - '30 days'::interval)) AS infra_30d,
            max(i.reported_at) AS last_infra_at,
            ( SELECT i2.issue_type
                   FROM infrastructure_issues i2
                  WHERE i2.stop_id = i.stop_id
                  ORDER BY i2.reported_at DESC NULLS LAST
                 LIMIT 1) AS most_recent_infra_type
           FROM infrastructure_issues i
          GROUP BY i.stop_id
        ), clean_visits AS (
         SELECT c.stop_id,
            count(*) FILTER (WHERE c.cleaned_at >= (now() - '30 days'::interval)) AS visits_30d,
            max(c.cleaned_at) AS last_visit_at,
            max(c.cleaned_at) FILTER (WHERE c.washed_pad IS TRUE) AS last_pad_scrub_at,
            max(c.cleaned_at) FILTER (WHERE c.level = 3) AS last_l3_from_clean_at
           FROM clean_logs c
          GROUP BY c.stop_id
        )
 SELECT s."STOP_ID" AS stop_id,
    s.pool_id,
    s.is_hotspot,
    s.priority_class,
    s.has_trash,
    s.compactor AS has_compactor,
        CASE
            WHEN cv.last_l3_from_clean_at IS NULL THEN NULL::integer
            ELSE date_part('day'::text, now() - cv.last_l3_from_clean_at)::integer
        END AS days_since_last_l3,
        CASE
            WHEN cv.last_visit_at IS NULL THEN NULL::integer
            ELSE date_part('day'::text, now() - cv.last_visit_at)::integer
        END AS days_since_last_visit,
        CASE
            WHEN cv.last_pad_scrub_at IS NULL THEN NULL::integer
            ELSE date_part('day'::text, now() - cv.last_pad_scrub_at)::integer
        END AS days_since_last_pad_scrub,
    COALESCE(cv.visits_30d, 0::bigint)::integer AS visits_30d,
    COALESCE(hz.hazards_30d, 0::bigint)::integer AS hazards_30d,
    COALESCE(hz.needles_30d, 0::bigint)::integer AS needles_30d,
    COALESCE(inf.infra_30d, 0::bigint)::integer AS infra_30d,
        CASE
            WHEN cv.last_l3_from_clean_at IS NULL THEN 'unknown'::text
            WHEN (now() - cv.last_l3_from_clean_at) <= '7 days'::interval THEN '0-7'::text
            WHEN (now() - cv.last_l3_from_clean_at) <= '14 days'::interval THEN '8-14'::text
            WHEN (now() - cv.last_l3_from_clean_at) <= '30 days'::interval THEN '15-30'::text
            ELSE '30+'::text
        END AS l3_aging_bucket,
    risk.recent_trash_volume_avg,
    risk.cleanliness_score,
    risk.hotspot_weight,
    risk.l3_urgency_weight,
    risk.safety_score,
    risk.infrastructure_score,
    risk.combined_risk_score,
    hz.last_hazard_at,
    inf.last_infra_at,
    inf.most_recent_infra_type,
    cv.last_visit_at,
    cv.last_pad_scrub_at,
    cv.last_l3_from_clean_at AS last_l3_completed_at,
    now() AS as_of,
    risk.computed_at
   FROM stops_legacy s
     LEFT JOIN risk ON risk.stop_id = s."STOP_ID"
     LEFT JOIN haz_30d hz ON hz.stop_id = s."STOP_ID"
     LEFT JOIN infra_30d inf ON inf.stop_id = s."STOP_ID"
     LEFT JOIN clean_visits cv ON cv.stop_id = s."STOP_ID";

-- Step 4: Recreate indexes on stop_status_mv (verbatim from pre-migration)
--   IF NOT EXISTS (ISSUE-038 idempotency guard) — harmless on the fresh path
--   (the MV was just dropped+recreated, so the indexes are gone and get created).
CREATE UNIQUE INDEX IF NOT EXISTS stop_status_mv_stop_id_uniq ON public.stop_status_mv USING btree (stop_id);
CREATE INDEX IF NOT EXISTS stop_status_mv_pool_idx ON public.stop_status_mv USING btree (pool_id);

-- Step 4b: Restore ownership to fieldpro (created as postgres above).
ALTER MATERIALIZED VIEW public.stop_status_mv OWNER TO fieldpro;

-- Step 4c/5: Restore grants and recreate export views AS fieldpro, so ownership and the ACL
--   grantor exactly match the pre-migration objects:
--     stop_status_mv              -> mcp_readonly=r, intelligence_reader=r  (grantor fieldpro)
--     export_stop_status_v1       -> mcp_readonly=r                          (grantor fieldpro)
--     export_pool_daily_summary_v1-> mcp_readonly=r                          (grantor fieldpro)
SET ROLE fieldpro;

GRANT SELECT ON public.stop_status_mv TO mcp_readonly;
GRANT SELECT ON public.stop_status_mv TO intelligence_reader;

-- Step 5: Recreate export views verbatim (CREATE OR REPLACE — ISSUE-038 guard)
CREATE OR REPLACE VIEW public.export_stop_status_v1 AS
 SELECT ss.stop_id,
    ss.pool_id,
    ss.is_hotspot,
    ss.priority_class,
    ss.days_since_last_l3,
    ss.days_since_last_visit,
    ss.days_since_last_pad_scrub,
    ss.l3_aging_bucket,
    ss.visits_30d,
    ss.hazards_30d,
    ss.needles_30d,
    ss.infra_30d,
    ss.cleanliness_score,
    ss.hotspot_weight,
    ss.l3_urgency_weight,
    ss.combined_risk_score,
    ss.last_visit_at,
    ss.last_pad_scrub_at,
    ss.last_l3_completed_at,
    ss.last_hazard_at,
    ss.last_infra_at,
    ss.most_recent_infra_type,
    ss.as_of
   FROM stop_status_mv ss;
GRANT SELECT ON public.export_stop_status_v1 TO mcp_readonly;

CREATE OR REPLACE VIEW public.export_pool_daily_summary_v1 AS
 SELECT ss.pool_id,
    ss.as_of::date AS as_of_date,
    count(*)::integer AS stops_total,
    sum(
        CASE
            WHEN ss.days_since_last_l3 > 30 THEN 1
            ELSE 0
        END)::integer AS stops_overdue_l3_30d,
    round(avg(ss.cleanliness_score), 2) AS avg_cleanliness_score,
    round(avg(ss.hotspot_weight), 2) AS avg_hotspot_weight,
    round(avg(ss.l3_urgency_weight), 3) AS avg_l3_urgency,
    round(avg(ss.combined_risk_score), 2) AS avg_combined_risk,
    sum(ss.hazards_30d)::integer AS hazards_30d_total,
    sum(ss.infra_30d)::integer AS infra_30d_total
   FROM stop_status_mv ss
  GROUP BY ss.pool_id, (ss.as_of::date);
GRANT SELECT ON public.export_pool_daily_summary_v1 TO mcp_readonly;

RESET ROLE;

-- Step 6: Drop level3_logs.
--   ISSUE-038 — DROP DEPENDENT VIEW FIRST (lexical-order robustness): on a fresh
--   clean build the runner sorts files lexically, so this file ("p1_2") runs
--   BEFORE "p1_drop_dead_transit_views" ("p1_2" < "p1_drop"). That sibling is what
--   normally drops core.v_level3_logs_transit, which 00000000_consolidated creates
--   reading public.level3_logs. Without dropping it here first, the DROP TABLE
--   below fails "cannot drop table level3_logs because other objects depend on it"
--   (it succeeded on dev only because the migrations were hand-applied in intended
--   order, p1_drop_dead before p1_2). Dropping it here (IF EXISTS) makes this file
--   self-sufficient regardless of order; p1_drop_dead's own DROP VIEW IF EXISTS is
--   then a harmless no-op. The other live dependent, stop_status_mv, was already
--   dropped+recreated above WITHOUT the level3_logs reference. DROP TABLE also
--   removes the owned sequence level3_logs_id_seq.
DROP VIEW IF EXISTS core.v_level3_logs_transit;
DROP TABLE IF EXISTS public.level3_logs;

COMMIT;
