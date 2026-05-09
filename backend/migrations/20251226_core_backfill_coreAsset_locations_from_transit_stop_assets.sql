INSERT INTO core.asset_locations (
  org_id,
  asset_id,
  location_id,
  role,
  active,
  installed_at,
  removed_at,
  notes
)
SELECT
  COALESCE(a.org_id, lei.org_id) AS org_id,
  tsa.asset_id,
  lei.location_id,
  tsa.role,
  tsa.active,
  tsa.installed_at,
  tsa.removed_at,
  tsa.notes
FROM public.transit_stop_assets tsa
JOIN core.location_external_ids lei
  ON lei.source_system = 'metro_stop'
 AND lei.external_id = tsa.stop_id
JOIN public.assets a
  ON a.id = tsa.asset_id
WHERE NOT EXISTS (
  SELECT 1
  FROM core.asset_locations al
  WHERE al.location_id = lei.location_id
    AND al.asset_id = tsa.asset_id
    AND al.role = tsa.role
    AND al.active = tsa.active
);