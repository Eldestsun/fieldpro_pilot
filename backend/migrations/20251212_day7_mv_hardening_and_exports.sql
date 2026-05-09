-- ============================================================
-- Day 7 – Intelligence Enforcement Delta
-- Tighten MV contracts for time-awareness + pilot safety
-- Add export_* translation layer (PowerBI-safe)
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_matviews
    WHERE schemaname='public' AND matviewname='stop_status_mv'
  ) THEN
    RAISE EXCEPTION 'stop_status_mv missing. Run day7_intelligence_enforcement.sql first.';
  END IF;
END $$;

---------------------------------------------------------------
-- 1) CLEANLINESS RISK MV (time-aware + priority_class)
---------------------------------------------------------------
-- Drop dependent export views first (no CASCADE)
DROP VIEW IF EXISTS public.export_route_run_origin_mix_v1;
DROP VIEW IF EXISTS public.export_pool_daily_summary_v1;
DROP VIEW IF EXISTS public.export_stop_status_v1;

DROP MATERIALIZED VIEW IF EXISTS public.cleanliness_risk_mv;

CREATE MATERIALIZED VIEW public.cleanliness_risk_mv AS
SELECT
    s."STOP_ID"                 AS stop_id,
    s.pool_id                   AS pool_id,
    s.is_hotspot                AS is_hotspot,
    s.priority_class            AS priority_class,   -- NEW
    s.has_trash                 AS has_trash,
    s.compactor                 AS has_compactor,
    s.last_level3_at            AS last_level3_at,

    -- Time primitives
    r.days_since_last_l3        AS days_since_last_l3,
    CASE
      WHEN r.days_since_last_l3 <= 7  THEN '0-7'
      WHEN r.days_since_last_l3 <= 14 THEN '8-14'
      WHEN r.days_since_last_l3 <= 30 THEN '15-30'
      ELSE '30+'
    END                         AS l3_aging_bucket,
    (r.days_since_last_l3 > 30) AS is_overdue_30d,

    -- Scores (routing + ops)
    r.recent_trash_volume_avg   AS recent_trash_volume_avg,
    r.cleanliness_score         AS cleanliness_score,
    r.hotspot_weight            AS hotspot_weight,
    r.l3_urgency_weight         AS l3_urgency_weight,
    r.combined_risk_score       AS combined_risk_score,

    -- As-of / recompute anchor (movement)
    now()                       AS as_of,
    r.computed_at               AS computed_at
FROM public.stop_risk_snapshot r
JOIN public.stops s
  ON s."STOP_ID" = r.stop_id;

CREATE UNIQUE INDEX cleanliness_risk_mv_stop_id_uniq
    ON public.cleanliness_risk_mv (stop_id);

CREATE INDEX cleanliness_risk_mv_pool_cleanliness_idx
    ON public.cleanliness_risk_mv (pool_id, cleanliness_score DESC);

CREATE INDEX cleanliness_risk_mv_pool_overdue_idx
    ON public.cleanliness_risk_mv (pool_id, is_overdue_30d, days_since_last_l3 DESC);

---------------------------------------------------------------
-- 2) SAFETY RISK MV (time-aware buckets + as_of)
---------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS public.safety_risk_mv;

CREATE MATERIALized VIEW public.safety_risk_mv AS
SELECT
    s."STOP_ID"              AS stop_id,
    s.pool_id                AS pool_id,
    s.is_hotspot             AS is_hotspot,
    s.priority_class         AS priority_class, -- NEW

    r.has_recent_hazard,
    r.hazard_days_ago,
    CASE
      WHEN r.hazard_days_ago IS NULL THEN NULL
      WHEN r.hazard_days_ago <= 7  THEN '0-7'
      WHEN r.hazard_days_ago <= 14 THEN '8-14'
      WHEN r.hazard_days_ago <= 30 THEN '15-30'
      ELSE '30+'
    END                     AS hazard_aging_bucket,

    r.hazard_decay_factor,
    r.last_hazard_at,
    r.last_hazard_severity,
    r.safety_score,
    r.combined_risk_score,
    now()                   AS as_of,
    r.computed_at
FROM public.stop_risk_snapshot r
JOIN public.stops s
  ON s."STOP_ID" = r.stop_id;

CREATE UNIQUE INDEX safety_risk_mv_stop_id_uniq
    ON public.safety_risk_mv (stop_id);

CREATE INDEX safety_risk_mv_pool_safety_idx
    ON public.safety_risk_mv (pool_id, safety_score DESC);

CREATE INDEX safety_risk_mv_recent_hazard_idx
    ON public.safety_risk_mv (has_recent_hazard, hazard_days_ago);

---------------------------------------------------------------
-- 3) INFRASTRUCTURE RISK MV (time-aware as_of)
-- NOTE: true "days_since_last_infra" lives best in stop_status_mv
-- (because infra events are in infra table), but we keep this MV
-- as a stable contract for infra_score now.
---------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS public.infrastructure_risk_mv;

CREATE MATERIALIZED VIEW public.infrastructure_risk_mv AS
SELECT
    s."STOP_ID"              AS stop_id,
    s.pool_id                AS pool_id,
    s.is_hotspot             AS is_hotspot,
    s.priority_class         AS priority_class, -- NEW
    s.compactor              AS has_compactor,

    r.infra_issue_score,
    r.infrastructure_score,
    r.combined_risk_score,
    now()                    AS as_of,
    r.computed_at
FROM public.stop_risk_snapshot r
JOIN public.stops s
  ON s."STOP_ID" = r.stop_id;

CREATE UNIQUE INDEX infrastructure_risk_mv_stop_id_uniq
    ON public.infrastructure_risk_mv (stop_id);

CREATE INDEX infrastructure_risk_mv_pool_infra_idx
    ON public.infrastructure_risk_mv (pool_id, infrastructure_score DESC);

---------------------------------------------------------------
-- 4) WORKFORCE EQUITY MV (PILOT-SAFE: route/pool only)
-- Replace per-user surfacing with structural load by route_run/pool/day.
---------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS public.workforce_equity_mv;

CREATE MATERIALIZED VIEW public.workforce_equity_mv AS
WITH wm_rollup AS (
  SELECT
      wm.run_date,
      wm.route_run_id,

      -- aggregate only (pilot-safe)
      SUM(wm.total_stops)::int         AS total_stops,
      SUM(wm.total_minutes)::int       AS total_minutes,
      SUM(wm.total_hotspots)::int      AS total_hotspots,
      SUM(wm.total_compactors)::int    AS total_compactors,

      -- If difficulty_score exists per row, average it.
      ROUND(AVG(wm.difficulty_score)::numeric, 2) AS difficulty_score,

      MAX(wm.created_at) AS metrics_created_at
  FROM public.workforce_metrics wm
  GROUP BY wm.run_date, wm.route_run_id
)
SELECT
    w.run_date,
    w.route_run_id,

    rr.route_pool_id,
    rr.base_id,
    rr.status           AS run_status,

    w.total_stops,
    w.total_minutes,
    w.total_hotspots,
    w.total_compactors,
    w.difficulty_score,

    -- Pilot-safe "capacity flag" (neutral)
    CASE
      WHEN w.total_minutes >= 420 THEN 'overloaded'      -- ~7h work window
      WHEN w.total_minutes >= 360 THEN 'elevated'
      ELSE 'normal'
    END AS capacity_flag,

    w.metrics_created_at
FROM wm_rollup w
JOIN public.route_runs rr
  ON rr.id = w.route_run_id;

CREATE UNIQUE INDEX workforce_equity_mv_run_route_uniq
    ON public.workforce_equity_mv (run_date, route_run_id);

CREATE INDEX workforce_equity_mv_pool_date_idx
    ON public.workforce_equity_mv (route_pool_id, run_date);

---------------------------------------------------------------
-- 5) LEVEL-3 COMPLIANCE MV (time-aware buckets + as_of)
---------------------------------------------------------------

DROP MATERIALIZED VIEW IF EXISTS public.level3_compliance_mv;

CREATE MATERIALIZED VIEW public.level3_compliance_mv AS
SELECT
    s."STOP_ID"              AS stop_id,
    s.pool_id                AS pool_id,
    s.is_hotspot             AS is_hotspot,
    s.priority_class         AS priority_class, -- NEW

    s.last_level3_at,
    r.days_since_last_l3,
    (r.days_since_last_l3 > 30) AS is_overdue_30d,

    CASE
      WHEN r.days_since_last_l3 <= 7  THEN '0-7'
      WHEN r.days_since_last_l3 <= 14 THEN '8-14'
      WHEN r.days_since_last_l3 <= 30 THEN '15-30'
      ELSE '30+'
    END AS l3_aging_bucket,

    r.l3_urgency_weight,
    r.cleanliness_score,
    now() AS as_of,
    r.computed_at
FROM public.stop_risk_snapshot r
JOIN public.stops s
  ON s."STOP_ID" = r.stop_id;

CREATE UNIQUE INDEX level3_compliance_mv_stop_id_uniq
    ON public.level3_compliance_mv (stop_id);

CREATE INDEX level3_compliance_mv_pool_overdue_idx
    ON public.level3_compliance_mv (pool_id, is_overdue_30d, days_since_last_l3 DESC);

---------------------------------------------------------------
-- 6) EXPORT CONTRACT VIEWS (translation layer)
-- External systems should query only these export_* views.
---------------------------------------------------------------

-- 6.1 Stop current condition (single contract for BI + in-app drilldowns)
CREATE OR REPLACE VIEW public.export_stop_status_v1 AS
SELECT
    ss.stop_id,
    ss.pool_id,

    -- intent + hints (not "truth")
    ss.is_hotspot,
    ss.priority_class,

    -- time primitives
    ss.days_since_last_l3,
    ss.days_since_last_visit,
    ss.days_since_last_pad_scrub,
    ss.l3_aging_bucket,
    ss.visits_30d,
    ss.hazards_30d,
    ss.needles_30d,
    ss.infra_30d,

    -- risk posture
    ss.cleanliness_score,
    ss.hotspot_weight,
    ss.l3_urgency_weight,
    ss.combined_risk_score,

    -- last event timestamps for defensibility
    ss.last_visit_at,
    ss.last_pad_scrub_at,
    ss.last_l3_completed_at,
    ss.last_hazard_at,
    ss.last_infra_at,
    ss.most_recent_infra_type,

    ss.as_of
FROM public.stop_status_mv ss;

-- 6.2 Pool daily summary (minimal, decision-oriented)
CREATE OR REPLACE VIEW public.export_pool_daily_summary_v1 AS
SELECT
    ss.pool_id,
    ss.as_of::date AS as_of_date,

    COUNT(*)::int AS stops_total,
    SUM(CASE WHEN ss.days_since_last_l3 > 30 THEN 1 ELSE 0 END)::int AS stops_overdue_l3_30d,

    ROUND(AVG(ss.cleanliness_score)::numeric, 2)    AS avg_cleanliness_score,
    ROUND(AVG(ss.hotspot_weight)::numeric, 2)       AS avg_hotspot_weight,
    ROUND(AVG(ss.l3_urgency_weight)::numeric, 3)    AS avg_l3_urgency,
    ROUND(AVG(ss.combined_risk_score)::numeric, 2)  AS avg_combined_risk,

    SUM(ss.hazards_30d)::int AS hazards_30d_total,
    SUM(ss.infra_30d)::int   AS infra_30d_total
FROM public.stop_status_mv ss
GROUP BY ss.pool_id, ss.as_of::date;

-- 6.3 Route run origin mix (uses new route_run_stops.origin_type)
CREATE OR REPLACE VIEW public.export_route_run_origin_mix_v1 AS
SELECT
    rrs.route_run_id,
    COUNT(*)::int AS stops_total,
    SUM(CASE WHEN rrs.origin_type = 'planned'   THEN 1 ELSE 0 END)::int AS planned_stops,
    SUM(CASE WHEN rrs.origin_type = 'emergency' THEN 1 ELSE 0 END)::int AS emergency_stops,
    SUM(CASE WHEN rrs.origin_type = 'ul_ad_hoc' THEN 1 ELSE 0 END)::int AS ul_ad_hoc_stops
FROM public.route_run_stops rrs
GROUP BY rrs.route_run_id;

COMMIT;