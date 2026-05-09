-- 1) cleanliness_risk_mv: one row per stop_id by design
CREATE UNIQUE INDEX cleanliness_risk_mv_stop_id_uniq
    ON public.cleanliness_risk_mv (stop_id);

-- 2) safety_risk_mv
CREATE UNIQUE INDEX safety_risk_mv_stop_id_uniq
    ON public.safety_risk_mv (stop_id);

-- 3) infrastructure_risk_mv
CREATE UNIQUE INDEX infrastructure_risk_mv_stop_id_uniq
    ON public.infrastructure_risk_mv (stop_id);

-- 4) level3_compliance_mv
CREATE UNIQUE INDEX level3_compliance_mv_stop_id_uniq
    ON public.level3_compliance_mv (stop_id);

-- 5) workforce_equity_mv
-- uniqueness is per run + user + route_run by design
CREATE UNIQUE INDEX workforce_equity_mv_run_user_route_uniq
    ON public.workforce_equity_mv (run_date, user_id, route_run_id);