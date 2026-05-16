CREATE OR REPLACE VIEW core.v_infra_transit AS
SELECT
  i.*,
  slm.location_id,
  COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved
FROM public.infrastructure_issues i
LEFT JOIN public.assets a
  ON a.id = i.asset_id
LEFT JOIN public.route_run_stops rrs
  ON rrs.id = i.route_run_stop_id
LEFT JOIN public.route_runs rr
  ON rr.id = rrs.route_run_id
LEFT JOIN core.v_stop_location_map slm
  ON slm.stop_id = i.stop_id;