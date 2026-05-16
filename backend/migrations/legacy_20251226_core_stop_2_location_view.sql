CREATE OR REPLACE VIEW core.v_stop_location_map AS
SELECT
  lei.org_id,
  lei.external_id AS stop_id,
  lei.location_id
FROM core.location_external_ids lei
WHERE lei.source_system = 'metro_stop';