CREATE OR REPLACE VIEW core.v_level3_logs_transit AS
SELECT
  l3.*,
  slm.location_id,
  COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved
FROM public.level3_logs l3
LEFT JOIN public.assets a
  ON a.id = l3.asset_id
LEFT JOIN public.route_run_stops rrs
  ON rrs.id = l3.route_run_stop_id
LEFT JOIN public.route_runs rr
  ON rr.id = rrs.route_run_id
LEFT JOIN core.v_stop_location_map slm
  ON slm.stop_id = l3.stop_id;