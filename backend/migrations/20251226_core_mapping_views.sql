CREATE OR REPLACE VIEW core.v_assets AS
SELECT * FROM public.assets;

CREATE OR REPLACE VIEW core.v_locations_transit AS
SELECT
  ts.org_id,
  ts.stop_id          AS external_location_id,
  'transit_stop'::text AS location_type,
  ts.stop_id          AS label,
  ts.lon, ts.lat,
  NULL::text          AS address,
  true                AS active
FROM public.transit_stops ts;

CREATE OR REPLACE VIEW core.v_asset_locations_transit AS
SELECT
  ts.org_id,
  tsa.asset_id,
  ts.stop_id AS external_location_id,
  tsa.role,
  tsa.active,
  tsa.installed_at,
  tsa.removed_at,
  tsa.notes
FROM public.transit_stop_assets tsa
JOIN public.transit_stops ts ON ts.stop_id = tsa.stop_id;