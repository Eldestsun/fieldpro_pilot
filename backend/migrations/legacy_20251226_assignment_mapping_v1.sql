CREATE OR REPLACE VIEW core.v_assignments_transit AS
SELECT
  rrs.id              AS source_route_run_stop_id,
  rr.org_id           AS org_id,
  'route_stop'::text  AS assignment_type,
  rrs.status          AS status,
  vt.location_id      AS location_id,
  rrs.asset_id        AS primary_asset_id,
  rr.id               AS source_route_run_id,
  rrs.sequence        AS sequence,
  rrs.created_at      AS created_at
FROM public.route_run_stops rrs
JOIN public.route_runs rr
  ON rr.id = rrs.route_run_id
LEFT JOIN core.v_locations_transit vt
  ON vt.stop_id = rrs.stop_id;