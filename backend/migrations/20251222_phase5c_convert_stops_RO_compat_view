BEGIN;

ALTER TABLE public.stops RENAME TO stops_legacy;

CREATE VIEW public.stops AS
SELECT
  ts.stop_id AS "STOP_ID",
  ts.trf_district_code AS "TRF_DISTRICT_CODE",
  ts.bay_code AS "BAY_CODE",
  ts.bearing_code AS "BEARING_CODE",
  ts.on_street_name AS "ON_STREET_NAME",
  ts.intersection_loc AS "INTERSECTION_LOC",
  ts.hastus_cross_street_name AS "HASTUS_CROSS_STREET_NAME",
  ts.kcm_managed_equipment AS "KCM_MANAGED_EQUIPMENT",
  ts.route_list AS "ROUTE_LIST",
  ts.num_shelters AS "NUM_SHELTERS",
  ts.stop_status AS "STOP_STATUS",
  ts.gisobjid AS "GISOBJID",
  ts.lon,
  ts.lat,
  ts.is_hotspot,
  ts.compactor,
  ts.has_trash,
  ts.notes,
  ts.pool_id,
  ts.last_level3_at,
  ts.priority_class,
  ts.asset_id
FROM public.transit_stops ts;

COMMIT;