-- =====================================================
-- FieldPro Enterprise Foundation: Day 1 DB Migration
-- New intelligence/logging tables + supporting columns
-- =====================================================

-- 1) New columns on existing tables
-- --------------------------------

ALTER TABLE public.stops
  ADD COLUMN last_level3_at timestamptz;

ALTER TABLE public.route_run_stops
  ADD COLUMN trash_volume smallint,
  ADD COLUMN hazard_id bigint,
  ADD COLUMN infra_issue_id bigint;


-- 2) New table: hazards
--    UL-reported safety hazards for Safety Intelligence / SRS
-- -----------------------------------------------------------

CREATE TABLE public.hazards (
    id                bigserial PRIMARY KEY,
    stop_id           text NOT NULL,
    route_run_stop_id bigint,
    reported_at       timestamptz NOT NULL DEFAULT now(),
    reported_by       bigint,
    hazard_type       text,
    severity          smallint,
    notes             text
);

-- FKs for hazards
ALTER TABLE public.hazards
  ADD CONSTRAINT hazards_stop_id_fkey
    FOREIGN KEY (stop_id) REFERENCES public.stops("STOP_ID"),
  ADD CONSTRAINT hazards_route_run_stop_id_fkey
    FOREIGN KEY (route_run_stop_id) REFERENCES public.route_run_stops(id)
    ON DELETE SET NULL;

-- Index to support (stop_id + created_at) style queries
CREATE INDEX hazards_stop_id_reported_at_idx
  ON public.hazards (stop_id, reported_at);


-- 3) New table: infrastructure_issues
--    UL-reported asset health issues for Infra Intelligence / IDS
-- ---------------------------------------------------------------

CREATE TABLE public.infrastructure_issues (
    id                bigserial PRIMARY KEY,
    stop_id           text NOT NULL,
    route_run_stop_id bigint,
    reported_at       timestamptz NOT NULL DEFAULT now(),
    reported_by       bigint,
    issue_type        text NOT NULL,
    severity          smallint,
    notes             text
);

ALTER TABLE public.infrastructure_issues
  ADD CONSTRAINT infrastructure_issues_stop_id_fkey
    FOREIGN KEY (stop_id) REFERENCES public.stops("STOP_ID"),
  ADD CONSTRAINT infrastructure_issues_route_run_stop_id_fkey
    FOREIGN KEY (route_run_stop_id) REFERENCES public.route_run_stops(id)
    ON DELETE SET NULL;

CREATE INDEX infrastructure_issues_stop_id_reported_at_idx
  ON public.infrastructure_issues (stop_id, reported_at);


-- 4) New table: trash_volume_logs
--    Per-stop volume history for Cleanliness Risk / seasonality
-- -------------------------------------------------------------

CREATE TABLE public.trash_volume_logs (
    id                bigserial PRIMARY KEY,
    route_run_stop_id bigint,
    stop_id           text NOT NULL,
    logged_at         timestamptz NOT NULL DEFAULT now(),
    volume            smallint NOT NULL,
    notes             text
);

ALTER TABLE public.trash_volume_logs
  ADD CONSTRAINT trash_volume_logs_stop_id_fkey
    FOREIGN KEY (stop_id) REFERENCES public.stops("STOP_ID"),
  ADD CONSTRAINT trash_volume_logs_route_run_stop_id_fkey
    FOREIGN KEY (route_run_stop_id) REFERENCES public.route_run_stops(id)
    ON DELETE SET NULL;

CREATE INDEX trash_volume_logs_stop_id_logged_at_idx
  ON public.trash_volume_logs (stop_id, logged_at);

CREATE INDEX trash_volume_logs_route_run_stop_id_idx
  ON public.trash_volume_logs (route_run_stop_id);


-- 5) New table: level3_logs
--    Explicit Level-3 cleans for compliance + routing weights
-- -----------------------------------------------------------

CREATE TABLE public.level3_logs (
    id                bigserial PRIMARY KEY,
    route_run_stop_id bigint,
    stop_id           text NOT NULL,
    cleaned_at        timestamptz NOT NULL DEFAULT now(),
    user_id           bigint,
    level             smallint NOT NULL,
    notes             text
);

ALTER TABLE public.level3_logs
  ADD CONSTRAINT level3_logs_stop_id_fkey
    FOREIGN KEY (stop_id) REFERENCES public.stops("STOP_ID"),
  ADD CONSTRAINT level3_logs_route_run_stop_id_fkey
    FOREIGN KEY (route_run_stop_id) REFERENCES public.route_run_stops(id)
    ON DELETE SET NULL;

CREATE INDEX level3_logs_stop_id_cleaned_at_idx
  ON public.level3_logs (stop_id, cleaned_at);


-- 6) New table: stop_scoring_history
--    Persisted CRS/SRS/IDS/WFS/PHS scores per stop over time
-- ----------------------------------------------------------

CREATE TABLE public.stop_scoring_history (
    id               bigserial PRIMARY KEY,
    stop_id          text NOT NULL,
    scored_at        timestamptz NOT NULL DEFAULT now(),
    cleanliness_score numeric(5,2),
    safety_score      numeric(5,2),
    infra_score       numeric(5,2),
    workforce_score   numeric(5,2),
    hotspot_score     numeric(5,2),
    source            text
);

ALTER TABLE public.stop_scoring_history
  ADD CONSTRAINT stop_scoring_history_stop_id_fkey
    FOREIGN KEY (stop_id) REFERENCES public.stops("STOP_ID");

CREATE INDEX stop_scoring_history_stop_id_scored_at_idx
  ON public.stop_scoring_history (stop_id, scored_at);


-- 7) New table: workforce_metrics
--    Route/UL/day aggregates for Workforce Equity / WFS
-- -----------------------------------------------------

CREATE TABLE public.workforce_metrics (
    id               bigserial PRIMARY KEY,
    route_run_id     bigint NOT NULL,
    user_id          bigint NOT NULL,
    run_date         date   NOT NULL,
    total_stops      integer NOT NULL,
    total_minutes    integer,
    total_hotspots   integer,
    total_compactors integer,
    difficulty_score numeric(6,2),
    created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workforce_metrics
  ADD CONSTRAINT workforce_metrics_route_run_id_fkey
    FOREIGN KEY (route_run_id) REFERENCES public.route_runs(id)
    ON DELETE CASCADE;

CREATE INDEX workforce_metrics_run_date_user_id_idx
  ON public.workforce_metrics (run_date, user_id);

CREATE INDEX workforce_metrics_user_id_run_date_idx
  ON public.workforce_metrics (user_id, run_date);


-- 8) Add FKs from route_run_stops to hazards / infra issues
--    (after tables exist)
-- ---------------------------------------------------------

ALTER TABLE public.route_run_stops
  ADD CONSTRAINT route_run_stops_hazard_id_fkey
    FOREIGN KEY (hazard_id) REFERENCES public.hazards(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT route_run_stops_infra_issue_id_fkey
    FOREIGN KEY (infra_issue_id) REFERENCES public.infrastructure_issues(id)
    ON DELETE SET NULL;
