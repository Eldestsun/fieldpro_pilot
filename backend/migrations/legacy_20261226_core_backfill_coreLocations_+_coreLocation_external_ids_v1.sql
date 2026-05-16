-- Creates one core.location per transit stop (keyed by external id)
WITH src AS (
  SELECT
    ts.org_id,
    ts.stop_id
  FROM public.transit_stops ts
),
ins AS (
  INSERT INTO core.locations (org_id, location_type, label, lon, lat, active)
  SELECT
    ts.org_id,
    'transit_stop',
    ts.stop_id,      -- label kept simple for now
    ts.lon,
    ts.lat,
    true
  FROM public.transit_stops ts
  WHERE NOT EXISTS (
    SELECT 1
    FROM core.location_external_ids lei
    WHERE lei.org_id = ts.org_id
      AND lei.source_system = 'metro_stop'
      AND lei.external_id = ts.stop_id
  )
  RETURNING id, org_id, label
)
INSERT INTO core.location_external_ids (org_id, location_id, source_system, external_id)
SELECT
  ins.org_id,
  ins.id,
  'metro_stop',
  ins.label
FROM ins;