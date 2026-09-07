-- ISSUE-061 — De-KCM the transit_stops adapter table (Option A of
-- planning/specs/2026-07-11-transit-stops-deKCM.md, the recommended shape,
-- dispatched on founder go-ahead).
--
-- Goal: transit-generic, not KCM-specific. Keep global invariants and the
-- routing-load-bearing descriptors; fold every King County Hastus/GIS export
-- artifact into a generic source_attributes jsonb; rename the one generic
-- descriptor carrying a KCM name (hastus_cross_street_name -> cross_street).
--
-- DEPARTURE from the proposal, recorded: the spec assumed an EMPTY table
-- (pre-reseed). The table now carries live rows, so the four "drop dead"
-- columns are folded into source_attributes too before dropping — schema is
-- equally de-KCM'd and no data is lost. jsonb_strip_nulls keeps the bag lean.
--
-- Runs as the provisioner (BYPASSRLS) via the runner; idempotent throughout.

ALTER TABLE public.transit_stops
  ADD COLUMN IF NOT EXISTS source_attributes jsonb NOT NULL DEFAULT '{}';

DO $$
BEGIN
  -- Fold KCM export fields into source_attributes BEFORE dropping. Guarded on
  -- column existence so a re-run (columns already gone) is a no-op.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transit_stops'
      AND column_name = 'trf_district_code'
  ) THEN
    UPDATE public.transit_stops
    SET source_attributes = source_attributes || jsonb_strip_nulls(jsonb_build_object(
      'trf_district_code',     trf_district_code,
      'bay_code',              bay_code,
      'num_shelters',          num_shelters,
      'stop_status',           stop_status,
      'gisobjid',              gisobjid,
      'route_list',            route_list,
      'kcm_managed_equipment', kcm_managed_equipment
    ));
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transit_stops'
      AND column_name = 'hastus_cross_street_name'
  ) THEN
    ALTER TABLE public.transit_stops RENAME COLUMN hastus_cross_street_name TO cross_street;
  END IF;
END $$;

-- Rebuild the read-only compatibility view. The view drop must PRECEDE the
-- column drops (the old view enumerates the KCM columns and blocks them).
-- Column REMOVAL requires DROP + CREATE (OR REPLACE can only append), which
-- discards the trigger and grants — both are recreated below exactly as
-- provisioned before (trg_stops_readonly guard + fieldpro's full DML grant
-- set; writes still raise via stops_readonly()). No other dependents exist
-- (verified via pg_depend).
DROP VIEW IF EXISTS public.stops;

ALTER TABLE public.transit_stops
  DROP COLUMN IF EXISTS kcm_managed_equipment,
  DROP COLUMN IF EXISTS route_list,
  DROP COLUMN IF EXISTS gisobjid,
  DROP COLUMN IF EXISTS stop_status,
  DROP COLUMN IF EXISTS trf_district_code,
  DROP COLUMN IF EXISTS bay_code,
  DROP COLUMN IF EXISTS num_shelters;

CREATE VIEW public.stops AS
 SELECT ts.stop_id,
    ts.bearing_code,
    ts.on_street_name,
    ts.intersection_loc,
    ts.cross_street,
    ts.lon,
    ts.lat,
    ts.is_hotspot,
    ts.compactor,
    ts.has_trash,
    ts.notes,
    ts.pool_id,
    ts.last_level3_at,
    ts.priority_class,
    ts.asset_id,
    ts.active,
    ts.source_attributes
   FROM public.transit_stops ts;

CREATE TRIGGER trg_stops_readonly
  INSTEAD OF INSERT OR UPDATE OR DELETE ON public.stops
  FOR EACH ROW EXECUTE FUNCTION public.stops_readonly();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stops TO fieldpro;
