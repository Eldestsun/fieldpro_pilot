BEGIN;

-- drop dependent view first
DROP VIEW IF EXISTS core.v_asset_locations_transit;

-- drop the view that is conflicting
DROP VIEW IF EXISTS core.v_locations_transit;

-- recreate it with the canonical column names you want
CREATE VIEW core.v_locations_transit AS
SELECT
  l.id          AS location_id,
  l.org_id,
  l.location_type,
  l.label,
  l.lon, l.lat,
  lei.source_system,
  lei.external_id AS stop_id
FROM core.locations l
JOIN core.location_external_ids lei
  ON lei.location_id = l.id
WHERE l.location_type = 'transit_stop'
  AND lei.source_system = 'metro_stop';

-- recreate the dependent view
CREATE VIEW core.v_asset_locations_transit AS
SELECT
  al.id              AS asset_location_id,
  al.org_id,
  al.location_id,
  vt.stop_id,
  al.asset_id,
  al.role,
  al.active,
  al.installed_at,
  al.removed_at,
  al.notes
FROM core.asset_locations al
JOIN core.v_locations_transit vt
  ON vt.location_id = al.location_id;

COMMIT;