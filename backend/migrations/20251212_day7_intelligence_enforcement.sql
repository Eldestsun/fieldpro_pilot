-- db/intelligence/day7_intelligence_enforcement.sql
-- DAY 7 — Intelligence Enforcement (Pilot Hardened)
-- Adds intelligence-facing MV(s) only. No core table renames/reshapes.

BEGIN;

DROP VIEW IF EXISTS public.export_route_run_origin_mix_v1;
DROP VIEW IF EXISTS public.export_pool_daily_summary_v1;
DROP VIEW IF EXISTS public.export_stop_status_v1;

DROP MATERIALIZED VIEW IF EXISTS public.stop_status_mv;

CREATE MATERIALIZED VIEW public.stop_status_mv AS
WITH
risk AS (
  SELECT
    r.stop_id,
    r.days_since_last_l3,
    r.recent_trash_volume_avg,
    r.cleanliness_score,
    r.safety_score,
    r.infrastructure_score,
    r.hotspot_weight,
    r.l3_urgency_weight,
    r.combined_risk_score,
    r.computed_at
  FROM public.stop_risk_snapshot r
),

haz_30d AS (
  SELECT
    h.stop_id,
    COUNT(*) FILTER (WHERE h.reported_at >= now() - interval '30 days') AS hazards_30d,
    COUNT(*) FILTER (
      WHERE h.reported_at >= now() - interval '30 days'
        AND COALESCE(h.hazard_type,'') ILIKE '%needle%'
    ) AS needles_30d,
    MAX(h.reported_at) AS last_hazard_at
  FROM public.hazards h
  GROUP BY h.stop_id
),

infra_30d AS (
  SELECT
    i.stop_id,
    COUNT(*) FILTER (WHERE i.reported_at >= now() - interval '30 days') AS infra_30d,
    MAX(i.reported_at) AS last_infra_at,
    (
      SELECT i2.issue_type
      FROM public.infrastructure_issues i2
      WHERE i2.stop_id = i.stop_id
      ORDER BY i2.reported_at DESC NULLS LAST
      LIMIT 1
    ) AS most_recent_infra_type
  FROM public.infrastructure_issues i
  GROUP BY i.stop_id
),

-- last visit + pad scrub derived from clean_logs.cleaned_at + clean_logs.washed_pad
clean_visits AS (
  SELECT
    c.stop_id,
    COUNT(*) FILTER (WHERE c.cleaned_at >= now() - interval '30 days') AS visits_30d,
    MAX(c.cleaned_at) AS last_visit_at,
    MAX(c.cleaned_at) FILTER (WHERE c.washed_pad IS TRUE) AS last_pad_scrub_at,
    MAX(c.cleaned_at) FILTER (WHERE c.level = 3) AS last_l3_from_clean_at
  FROM public.clean_logs c
  GROUP BY c.stop_id
),

-- last L3 from level3_logs (authoritative “L3 event log”)
l3_events AS (
  SELECT
    l.stop_id,
    MAX(l.cleaned_at) FILTER (WHERE l.level = 3) AS last_l3_from_l3log_at
  FROM public.level3_logs l
  GROUP BY l.stop_id
),

-- unified last_l3_at: take the newest L3 event from either source
l3_unified AS (
  SELECT
    COALESCE(cv.stop_id, le.stop_id) AS stop_id,
    GREATEST(
      cv.last_l3_from_clean_at,
      le.last_l3_from_l3log_at
    ) AS last_l3_at
  FROM clean_visits cv
  FULL OUTER JOIN l3_events le
    ON le.stop_id = cv.stop_id
)

SELECT
  s."STOP_ID"                  AS stop_id,
  s.pool_id,
  s.is_hotspot,
  s.priority_class,
  s.has_trash,
  s.compactor                  AS has_compactor,

  -- days-since primitives (movement)
  CASE
    WHEN lu.last_l3_at IS NULL THEN NULL
    ELSE DATE_PART('day', now() - lu.last_l3_at)::int
  END AS days_since_last_l3,

  CASE
    WHEN cv.last_visit_at IS NULL THEN NULL
    ELSE DATE_PART('day', now() - cv.last_visit_at)::int
  END AS days_since_last_visit,

  CASE
    WHEN cv.last_pad_scrub_at IS NULL THEN NULL
    ELSE DATE_PART('day', now() - cv.last_pad_scrub_at)::int
  END AS days_since_last_pad_scrub,

  -- 30d counts (time-window)
  COALESCE(cv.visits_30d, 0)::int      AS visits_30d,
  COALESCE(hz.hazards_30d, 0)::int     AS hazards_30d,
  COALESCE(hz.needles_30d, 0)::int     AS needles_30d,
  COALESCE(inf.infra_30d, 0)::int      AS infra_30d,

  -- aging bucket (required primitive)
  CASE
    WHEN lu.last_l3_at IS NULL THEN 'unknown'
    WHEN (now() - lu.last_l3_at) <= interval '7 days'  THEN '0-7'
    WHEN (now() - lu.last_l3_at) <= interval '14 days' THEN '8-14'
    WHEN (now() - lu.last_l3_at) <= interval '30 days' THEN '15-30'
    ELSE '30+'
  END AS l3_aging_bucket,

  -- risk components (from snapshot; still useful even if snapshot refresh cadence differs)
  risk.recent_trash_volume_avg,
  risk.cleanliness_score,
  risk.hotspot_weight,
  risk.l3_urgency_weight,
  risk.safety_score,
  risk.infrastructure_score,
  risk.combined_risk_score,

  -- story timestamps
  hz.last_hazard_at,
  inf.last_infra_at,
  inf.most_recent_infra_type,
  cv.last_visit_at,
  cv.last_pad_scrub_at,
  lu.last_l3_at AS last_l3_completed_at,

  -- as_of for time movement even if snapshot is stale
  now() AS as_of,
  risk.computed_at

FROM public.stops s
LEFT JOIN risk        ON risk.stop_id = s."STOP_ID"
LEFT JOIN haz_30d hz  ON hz.stop_id   = s."STOP_ID"
LEFT JOIN infra_30d inf ON inf.stop_id = s."STOP_ID"
LEFT JOIN clean_visits cv ON cv.stop_id = s."STOP_ID"
LEFT JOIN l3_unified lu   ON lu.stop_id = s."STOP_ID"
WITH NO DATA;

-- Required for REFRESH ... CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS stop_status_mv_stop_id_uniq
  ON public.stop_status_mv (stop_id);

-- Helpful access path
CREATE INDEX IF NOT EXISTS stop_status_mv_pool_idx
  ON public.stop_status_mv (pool_id);

COMMIT;