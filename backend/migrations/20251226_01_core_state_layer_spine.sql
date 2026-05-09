BEGIN;

-- ----------------------------
-- Core entities
-- ----------------------------

CREATE TABLE IF NOT EXISTS core.locations (
  id          bigserial PRIMARY KEY,
  org_id      bigint NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  location_type text NOT NULL,                 -- e.g. 'transit_stop', 'facility_room'
  label       text,
  lon         double precision,
  lat         double precision,
  address     text,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.location_external_ids (
  id            bigserial PRIMARY KEY,
  org_id        bigint NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  location_id   bigint NOT NULL REFERENCES core.locations(id) ON DELETE CASCADE,
  source_system text NOT NULL,                 -- e.g. 'metro', 'eam', 'gis'
  external_id   text NOT NULL,                 -- e.g. STOP_ID
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, source_system, external_id)
);

-- Many assets per location, time-bounded
-- NOTE: references public.assets for now (you are not migrating assets yet)
CREATE TABLE IF NOT EXISTS core.asset_locations (
  id          bigserial PRIMARY KEY,
  org_id      bigint NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  asset_id    bigint NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
  location_id bigint NOT NULL REFERENCES core.locations(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'primary',  -- shelter, trash_can, sign, etc.
  active      boolean NOT NULL DEFAULT true,
  installed_at timestamptz,
  removed_at   timestamptz,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_core_asset_locations_asset
  ON core.asset_locations(org_id, asset_id);

CREATE INDEX IF NOT EXISTS idx_core_asset_locations_location
  ON core.asset_locations(org_id, location_id);

-- ----------------------------
-- Core operations
-- ----------------------------

CREATE TABLE IF NOT EXISTS core.assignments (
  id            bigserial PRIMARY KEY,
  org_id        bigint NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  assignment_type text NOT NULL,               -- 'route_stop', 'work_order', 'inspection_task'
  status        text NOT NULL DEFAULT 'planned',
  location_id   bigint REFERENCES core.locations(id) ON DELETE SET NULL,
  primary_asset_id bigint REFERENCES public.assets(id) ON DELETE SET NULL,

  planned_for_date date,
  planned_start_at timestamptz,
  planned_end_at   timestamptz,

  created_by_oid text NOT NULL,
  source_system  text,                         -- optional (EAM, GIS, etc.)
  source_ref     text,                         -- optional external key
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_core_assignments_org_status
  ON core.assignments(org_id, status);

CREATE TABLE IF NOT EXISTS core.visits (
  id            bigserial PRIMARY KEY,
  org_id        bigint NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  location_id   bigint REFERENCES core.locations(id) ON DELETE SET NULL,
  primary_asset_id bigint REFERENCES public.assets(id) ON DELETE SET NULL,

  assignment_id bigint REFERENCES core.assignments(id) ON DELETE SET NULL,

  actor_oid     text NOT NULL,

  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,

  visit_type    text NOT NULL,                 -- service|inspection|spot_check|safety_skip|evidence_only|emergency|ad_hoc
  outcome       text,                          -- completed|skipped|partial|observed|blocked
  reason_code   text,
  notes         text,

  client_visit_id uuid UNIQUE,                 -- for offline idempotency if/when you use it
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_core_visits_asset_time
  ON core.visits(org_id, primary_asset_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_core_visits_location_time
  ON core.visits(org_id, location_id, started_at DESC);

CREATE TABLE IF NOT EXISTS core.observations (
  id            bigserial PRIMARY KEY,
  org_id        bigint NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  visit_id      bigint NOT NULL REFERENCES core.visits(id) ON DELETE CASCADE,
  location_id   bigint REFERENCES core.locations(id) ON DELETE SET NULL,
  asset_id      bigint REFERENCES public.assets(id) ON DELETE SET NULL,

  observation_type text NOT NULL,              -- hazard|infrastructure_issue|service_level3|trash_volume|etc.
  severity      text,
  status        text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_by_oid text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_core_observations_visit
  ON core.observations(visit_id);

CREATE TABLE IF NOT EXISTS core.evidence (
  id            bigserial PRIMARY KEY,
  org_id        bigint NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  visit_id      bigint NOT NULL REFERENCES core.visits(id) ON DELETE CASCADE,
  observation_id bigint REFERENCES core.observations(id) ON DELETE SET NULL,

  kind          text NOT NULL,                 -- completion|safety|before|after|generic
  storage_key   text NOT NULL,                 -- s3 key
  captured_at   timestamptz NOT NULL DEFAULT now(),
  captured_by_oid text NOT NULL,

  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_core_evidence_visit
  ON core.evidence(visit_id);

COMMIT;