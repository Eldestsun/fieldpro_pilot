-- External ID uniqueness (prevents duplicates per system)
create unique index if not exists ux_location_external_ids
on core.location_external_ids(org_id, source_system, external_id);

-- Asset-to-location relationship uniqueness (time-bounded model will evolve later)
create index if not exists ix_asset_locations_asset
on core.asset_locations(org_id, asset_id);

create index if not exists ix_asset_locations_location
on core.asset_locations(org_id, location_id);

-- Visits: fast time-series reads
CREATE INDEX IF NOT EXISTS ix_visits_asset_time
ON core.visits(org_id, primary_asset_id, started_at DESC);

-- Evidence/observations: fast lookup by visit
create index if not exists ix_evidence_visit
on core.evidence(org_id, visit_id);

create index if not exists ix_observations_visit
on core.observations(org_id, visit_id);