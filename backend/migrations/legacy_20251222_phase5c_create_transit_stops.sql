BEGIN;

-- 1A) Create the new truth table
CREATE TABLE IF NOT EXISTS public.transit_stops (
  stop_id text PRIMARY KEY,

  trf_district_code text,
  bay_code text,
  bearing_code text,
  on_street_name text,
  intersection_loc text,
  hastus_cross_street_name text,
  kcm_managed_equipment text,
  route_list text,
  num_shelters integer,
  stop_status text,
  gisobjid text,

  lon double precision,
  lat double precision,

  is_hotspot boolean NOT NULL DEFAULT false,
  compactor boolean NOT NULL DEFAULT false,
  has_trash boolean NOT NULL DEFAULT false,
  notes text,

  pool_id text,
  last_level3_at timestamptz,
  priority_class text DEFAULT 'medium',

  asset_id bigint,

  -- optional but recommended for determinism when asset_id is null
  org_id bigint NOT NULL DEFAULT 1 REFERENCES public.organizations(id)
);

-- 1B) Backfill org_id from assets.org_id when available (fallback 1)
INSERT INTO public.transit_stops (
  stop_id,
  trf_district_code, bay_code, bearing_code, on_street_name, intersection_loc,
  hastus_cross_street_name, kcm_managed_equipment, route_list, num_shelters,
  stop_status, gisobjid, lon, lat,
  is_hotspot, compactor, has_trash, notes,
  pool_id, last_level3_at, priority_class,
  asset_id, org_id
)
SELECT
  s."STOP_ID" as stop_id,
  s."TRF_DISTRICT_CODE", s."BAY_CODE", s."BEARING_CODE", s."ON_STREET_NAME", s."INTERSECTION_LOC",
  s."HASTUS_CROSS_STREET_NAME", s."KCM_MANAGED_EQUIPMENT", s."ROUTE_LIST", s."NUM_SHELTERS",
  s."STOP_STATUS", s."GISOBJID", s.lon, s.lat,
  s.is_hotspot, s.compactor, s.has_trash, s.notes,
  s.pool_id, s.last_level3_at, s.priority_class,
  s.asset_id,
  COALESCE(a.org_id, 1) as org_id
FROM public.stops s
LEFT JOIN public.assets a ON a.id = s.asset_id
ON CONFLICT (stop_id) DO NOTHING;

COMMIT;