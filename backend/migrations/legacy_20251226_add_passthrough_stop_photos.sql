CREATE OR REPLACE VIEW core.v_stop_photos_transit AS
SELECT
  sp.*,
  slm.location_id,
  COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved,
  rrs.stop_id AS stop_id -- helpful for debugging / dashboard filters
FROM public.stop_photos sp
LEFT JOIN public.assets a
  ON a.id = sp.asset_id
LEFT JOIN public.route_run_stops rrs
  ON rrs.id = sp.route_run_stop_id
LEFT JOIN public.route_runs rr
  ON rr.id = rrs.route_run_id
LEFT JOIN core.v_stop_location_map slm
  ON slm.stop_id = rrs.stop_id;