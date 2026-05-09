BEGIN;

-- ============================================================
-- Drop workforce_equity_mv first — it depends on
-- workforce_metrics and cannot be dropped after the table.
-- Zero backend readers, zero frontend readers as of 2026-05-08.
-- The route-level capacity signals it produced will be rebuilt
-- from stop_effort_history aggregated at route level in R10.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS public.workforce_equity_mv;

-- ============================================================
-- Drop surveillance-adjacent tables.
-- workforce_metrics: per-worker performance metrics keyed by
-- user_id. Permanently out of scope per labor safety guardrails.
-- stop_scoring_history: contains workforce_score column.
-- Neither table has rows or backend writers as of 2026-05-08.
-- ============================================================

DROP TABLE IF EXISTS public.workforce_metrics;
DROP TABLE IF EXISTS public.stop_scoring_history;

-- ============================================================
-- Replacement 1: stop_effort_history
-- Per-stop service effort derived from canonical visits.
-- No user_id. Worker-safe by structure.
-- Write paths wired in R10 after Tier 1 completes.
-- ============================================================

CREATE TABLE public.stop_effort_history (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stop_id          text NOT NULL
                     REFERENCES transit_stops(stop_id)
                     ON DELETE CASCADE,
  visit_id         bigint NOT NULL
                     REFERENCES core.visits(id)
                     ON DELETE CASCADE,
  run_date         date NOT NULL,
  service_minutes  integer,
  stop_type        text NOT NULL
                     CHECK (stop_type IN
                       ('hotspot', 'compactor', 'standard')),
  complexity_score numeric(4,2),
  had_hazard       boolean NOT NULL DEFAULT false,
  had_infra_issue  boolean NOT NULL DEFAULT false,
  trash_volume     numeric(4,2),
  computed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stop_id, visit_id)
);

CREATE INDEX idx_stop_effort_stop_date
  ON public.stop_effort_history (stop_id, run_date);
CREATE INDEX idx_stop_effort_run_date
  ON public.stop_effort_history (run_date);

COMMENT ON TABLE public.stop_effort_history IS
  'Per-stop service effort history. Derived from core.visits and
   core.observations. No user_id — worker-safe by structure.
   Keyed by (stop_id, visit_id). Write paths wired in R10.';

-- ============================================================
-- Replacement 2: stop_condition_history
-- Per-stop condition scores over time. No workforce_score.
-- Worker-safe by structure.
-- Write paths wired in R10 after Tier 2 completes.
-- ============================================================

CREATE TABLE public.stop_condition_history (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stop_id            text NOT NULL
                       REFERENCES transit_stops(stop_id)
                       ON DELETE CASCADE,
  visit_id           bigint NOT NULL
                       REFERENCES core.visits(id)
                       ON DELETE CASCADE,
  scored_at          timestamptz NOT NULL DEFAULT now(),
  cleanliness_score  numeric(5,2),
  safety_score       numeric(5,2),
  infra_score        numeric(5,2),
  asset_id           bigint REFERENCES assets(id),
  UNIQUE (stop_id, visit_id)
);

CREATE INDEX idx_stop_condition_stop_scored
  ON public.stop_condition_history (stop_id, scored_at DESC);

COMMENT ON TABLE public.stop_condition_history IS
  'Per-stop condition score history. Derived from core.observations
   via riskMapService. No workforce_score — worker-safe by structure.
   Replaces stop_scoring_history. Write paths wired in R10.';

COMMIT;
