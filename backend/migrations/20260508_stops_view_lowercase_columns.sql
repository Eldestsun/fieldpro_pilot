BEGIN;

-- DROP required to rename columns (CREATE OR REPLACE VIEW cannot rename columns).
-- The INSTEAD OF trigger trg_stops_readonly is dropped automatically with the view
-- and re-attached below.
DROP VIEW public.stops;

CREATE VIEW public.stops AS
SELECT
  ts.stop_id,
  ts.trf_district_code,
  ts.bay_code,
  ts.bearing_code,
  ts.on_street_name,
  ts.intersection_loc,
  ts.hastus_cross_street_name,
  ts.kcm_managed_equipment,
  ts.route_list,
  ts.num_shelters,
  ts.stop_status,
  ts.gisobjid,
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

-- Re-attach readonly guard (was dropped with the view above).
CREATE TRIGGER trg_stops_readonly
  INSTEAD OF INSERT OR DELETE OR UPDATE ON public.stops
  FOR EACH ROW EXECUTE FUNCTION stops_readonly();

COMMIT;
