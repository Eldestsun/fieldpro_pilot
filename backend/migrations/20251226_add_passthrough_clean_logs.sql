CREATE OR REPLACE VIEW core.v_clean_logs_transit AS
SELECT
  cl.*,
  slm.location_id,
  COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved
FROM public.clean_logs cl
LEFT JOIN public.assets a
  ON a.id = cl.asset_id
LEFT JOIN public.route_run_stops rrs
  ON rrs.id = cl.route_run_stop_id
LEFT JOIN public.route_runs rr
  ON rr.id = rrs.route_run_id
LEFT JOIN core.v_stop_location_map slm
  ON slm.stop_id = cl.stop_id;