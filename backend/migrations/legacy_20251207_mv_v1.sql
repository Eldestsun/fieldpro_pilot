CREATE MATERIALIZED VIEW public.cleanliness_risk_mv AS
SELECT
    s."STOP_ID"              AS stop_id,
    s.pool_id                AS pool_id,
    s.is_hotspot             AS is_hotspot,
    s.has_trash              AS has_trash,
    s.compactor              AS has_compactor,
    s.last_level3_at         AS last_level3_at,

    r.days_since_last_l3,
    r.recent_trash_volume_avg,
    r.cleanliness_score,
    r.l3_urgency_weight,
    r.hotspot_weight,
    r.combined_risk_score,
    r.computed_at
FROM public.stop_risk_snapshot r
JOIN public.stops s
  ON s."STOP_ID" = r.stop_id;

CREATE INDEX cleanliness_risk_mv_stop_id_idx
    ON public.cleanliness_risk_mv (stop_id);

CREATE INDEX cleanliness_risk_mv_pool_cleanliness_idx
    ON public.cleanliness_risk_mv (pool_id, cleanliness_score DESC);

CREATE INDEX cleanliness_risk_mv_hotspot_idx
    ON public.cleanliness_risk_mv (is_hotspot, combined_risk_score DESC);

CREATE MATERIALIZED VIEW public.safety_risk_mv AS
SELECT
    s."STOP_ID"              AS stop_id,
    s.pool_id                AS pool_id,
    s.is_hotspot             AS is_hotspot,

    r.has_recent_hazard,
    r.hazard_days_ago,
    r.hazard_decay_factor,
    r.last_hazard_at,
    r.last_hazard_severity,
    r.safety_score,
    r.combined_risk_score,
    r.computed_at
FROM public.stop_risk_snapshot r
JOIN public.stops s
  ON s."STOP_ID" = r.stop_id;

CREATE INDEX safety_risk_mv_stop_id_idx
    ON public.safety_risk_mv (stop_id);

CREATE INDEX safety_risk_mv_pool_safety_idx
    ON public.safety_risk_mv (pool_id, safety_score DESC);

CREATE INDEX safety_risk_mv_recent_hazard_idx
    ON public.safety_risk_mv (has_recent_hazard, hazard_days_ago);

CREATE MATERIALIZED VIEW public.infrastructure_risk_mv AS
SELECT
    s."STOP_ID"              AS stop_id,
    s.pool_id                AS pool_id,
    s.is_hotspot             AS is_hotspot,
    s.compactor              AS has_compactor,

    r.infra_issue_score,
    r.infrastructure_score,
    r.combined_risk_score,
    r.computed_at
FROM public.stop_risk_snapshot r
JOIN public.stops s
  ON s."STOP_ID" = r.stop_id;

CREATE INDEX infrastructure_risk_mv_stop_id_idx
    ON public.infrastructure_risk_mv (stop_id);

CREATE INDEX infrastructure_risk_mv_pool_infra_idx
    ON public.infrastructure_risk_mv (pool_id, infrastructure_score DESC);

CREATE MATERIALIZED VIEW public.workforce_equity_mv AS
SELECT
    wm.run_date,
    wm.user_id,
    wm.route_run_id,

    rr.route_pool_id,
    rr.base_id,
    rr.status           AS run_status,

    wm.total_stops,
    wm.total_minutes,
    wm.total_hotspots,
    wm.total_compactors,
    wm.difficulty_score,

    wm.created_at       AS metrics_created_at
FROM public.workforce_metrics wm
JOIN public.route_runs rr
  ON rr.id = wm.route_run_id;

CREATE INDEX workforce_equity_mv_run_date_user_idx
    ON public.workforce_equity_mv (run_date, user_id);

CREATE INDEX workforce_equity_mv_pool_date_idx
    ON public.workforce_equity_mv (route_pool_id, run_date);

CREATE MATERIALIZED VIEW public.level3_compliance_mv AS
SELECT
    s."STOP_ID"              AS stop_id,
    s.pool_id                AS pool_id,
    s.is_hotspot             AS is_hotspot,

    s.last_level3_at,
    r.days_since_last_l3,
    (r.days_since_last_l3 > 30) AS is_overdue_30d,

    r.l3_urgency_weight,
    r.cleanliness_score,
    r.computed_at
FROM public.stop_risk_snapshot r
JOIN public.stops s
  ON s."STOP_ID" = r.stop_id;

CREATE INDEX level3_compliance_mv_stop_id_idx
    ON public.level3_compliance_mv (stop_id);

CREATE INDEX level3_compliance_mv_pool_overdue_idx
    ON public.level3_compliance_mv (pool_id, is_overdue_30d, days_since_last_l3 DESC);

-- Nightly after riskMapJob finishes
REFRESH MATERIALIZED VIEW public.cleanliness_risk_mv;
REFRESH MATERIALIZED VIEW public.safety_risk_mv;
REFRESH MATERIALIZED VIEW public.infrastructure_risk_mv;
REFRESH MATERIALIZED VIEW public.workforce_equity_mv;
REFRESH MATERIALIZED VIEW public.level3_compliance_mv;
