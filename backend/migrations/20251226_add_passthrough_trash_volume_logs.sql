CREATE OR REPLACE VIEW core.v_trash_volume_logs_transit AS
SELECT
  tvl.*,
  slm.location_id,
  COALESCE(a.org_id, rr.org_id, slm.org_id) AS org_id_resolved
FROM public.trash_volume_logs tvl
LEFT JOIN public.assets a
  ON a.id = tvl.asset_id
LEFT JOIN public.route_run_stops rrs
  ON rrs.id = tvl.route_run_stop_id
LEFT JOIN public.route_runs rr
  ON rr.id = rrs.route_run_id
LEFT JOIN core.v_stop_location_map slm
  ON slm.stop_id = tvl.stop_id;