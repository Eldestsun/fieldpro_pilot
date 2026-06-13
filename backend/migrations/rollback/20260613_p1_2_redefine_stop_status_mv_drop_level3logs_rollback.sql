-- ROLLBACK for 20260613_p1_2_redefine_stop_status_mv_drop_level3logs.sql
-- Restores public.level3_logs (0 rows — no data restore needed) and reverts stop_status_mv to its
-- pre-P1.2 definition (with the l3_events / l3_unified CTEs).
-- RUN AS: postgres (superuser / BYPASSRLS) — same reasons as the forward migration.

BEGIN;

-- Step A: Recreate level3_logs (0 rows; FORCE RLS; fail-open org_isolation policy; owner fieldpro)
CREATE SEQUENCE IF NOT EXISTS public.level3_logs_id_seq;

CREATE TABLE public.level3_logs (
    id bigint NOT NULL DEFAULT nextval('public.level3_logs_id_seq'::regclass),
    route_run_stop_id bigint,
    stop_id text NOT NULL,
    cleaned_at timestamptz NOT NULL DEFAULT now(),
    user_id bigint,
    level smallint NOT NULL,
    notes text,
    asset_id bigint,
    visit_id bigint,
    org_id bigint NOT NULL,
    CONSTRAINT level3_logs_pkey PRIMARY KEY (id),
    CONSTRAINT level3_logs_asset_id_fk FOREIGN KEY (asset_id) REFERENCES public.assets(id),
    CONSTRAINT level3_logs_route_run_stop_id_fkey FOREIGN KEY (route_run_stop_id) REFERENCES public.route_run_stops(id) ON DELETE SET NULL,
    CONSTRAINT level3_logs_stop_id_fkey FOREIGN KEY (stop_id) REFERENCES public.transit_stops(stop_id),
    CONSTRAINT level3_logs_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES core.visits(id) ON DELETE SET NULL
);
ALTER SEQUENCE public.level3_logs_id_seq OWNED BY public.level3_logs.id;

CREATE INDEX idx_level3_logs_stop_id ON public.level3_logs USING btree (stop_id);
CREATE INDEX idx_level3_logs_visit_id ON public.level3_logs USING btree (visit_id);
CREATE INDEX level3_logs_stop_id_cleaned_at_idx ON public.level3_logs USING btree (stop_id, cleaned_at);

ALTER TABLE public.level3_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level3_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.level3_logs
    USING (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint)))
    WITH CHECK (((COALESCE(current_setting('app.current_org_id'::text, true), ''::text) = ''::text) OR (org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::bigint)));

ALTER TABLE public.level3_logs OWNER TO fieldpro;
ALTER SEQUENCE public.level3_logs_id_seq OWNER TO fieldpro;

-- Step B: Revert stop_status_mv to the pre-P1.2 definition (with l3_events / l3_unified)
DROP VIEW IF EXISTS public.export_stop_status_v1;
DROP VIEW IF EXISTS public.export_pool_daily_summary_v1;
DROP MATERIALIZED VIEW IF EXISTS public.stop_status_mv;

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
        ), l3_events AS (
         SELECT l.stop_id,
            max(l.cleaned_at) FILTER (WHERE l.level = 3) AS last_l3_from_l3log_at
           FROM level3_logs l
          GROUP BY l.stop_id
        ), l3_unified AS (
         SELECT COALESCE(cv_1.stop_id, le.stop_id) AS stop_id,
            GREATEST(cv_1.last_l3_from_clean_at, le.last_l3_from_l3log_at) AS last_l3_at
           FROM clean_visits cv_1
             FULL JOIN l3_events le ON le.stop_id = cv_1.stop_id
        )
 SELECT s."STOP_ID" AS stop_id,
    s.pool_id,
    s.is_hotspot,
    s.priority_class,
    s.has_trash,
    s.compactor AS has_compactor,
        CASE
            WHEN lu.last_l3_at IS NULL THEN NULL::integer
            ELSE date_part('day'::text, now() - lu.last_l3_at)::integer
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
            WHEN lu.last_l3_at IS NULL THEN 'unknown'::text
            WHEN (now() - lu.last_l3_at) <= '7 days'::interval THEN '0-7'::text
            WHEN (now() - lu.last_l3_at) <= '14 days'::interval THEN '8-14'::text
            WHEN (now() - lu.last_l3_at) <= '30 days'::interval THEN '15-30'::text
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
    lu.last_l3_at AS last_l3_completed_at,
    now() AS as_of,
    risk.computed_at
   FROM stops_legacy s
     LEFT JOIN risk ON risk.stop_id = s."STOP_ID"
     LEFT JOIN haz_30d hz ON hz.stop_id = s."STOP_ID"
     LEFT JOIN infra_30d inf ON inf.stop_id = s."STOP_ID"
     LEFT JOIN clean_visits cv ON cv.stop_id = s."STOP_ID"
     LEFT JOIN l3_unified lu ON lu.stop_id = s."STOP_ID";

CREATE UNIQUE INDEX stop_status_mv_stop_id_uniq ON public.stop_status_mv USING btree (stop_id);
CREATE INDEX stop_status_mv_pool_idx ON public.stop_status_mv USING btree (pool_id);

ALTER MATERIALIZED VIEW public.stop_status_mv OWNER TO fieldpro;

SET ROLE fieldpro;
GRANT SELECT ON public.stop_status_mv TO mcp_readonly;
GRANT SELECT ON public.stop_status_mv TO intelligence_reader;

CREATE VIEW public.export_stop_status_v1 AS
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

CREATE VIEW public.export_pool_daily_summary_v1 AS
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

COMMIT;
