-- T2-A2 — codify transit_stops.active into the migration chain.
--
-- This filename was RECORDED in dev's public.schema_migrations on 2026-09-04
-- (T2-A2 prep: column + widened stops view hand-applied to dev) but the file
-- itself never landed in the repo — recorded-but-missing drift, the mirror
-- image of the ISSUE-038 class. A clean-room build therefore lacked the
-- column and PR #114's CI failed with `column "active" does not exist`.
-- This file restores the on-disk half under the already-recorded name:
-- dev treats it as applied (content verified identical: boolean NOT NULL
-- DEFAULT true; view includes ts.active); fresh builds apply it.
--
-- Idempotent either way.

ALTER TABLE public.transit_stops
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true NOT NULL;

-- Widen the read-only compatibility view to expose active. CREATE OR REPLACE
-- appends the column (legal: existing columns unchanged, additions at the
-- end) and preserves existing grants and the read-only INSTEAD OF guard.
CREATE OR REPLACE VIEW public.stops AS
 SELECT ts.stop_id,
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
    ts.asset_id,
    ts.active
   FROM public.transit_stops ts;

COMMENT ON COLUMN public.transit_stops.active IS
  'T2-A2 retirement flag: false = retired. Hidden from admin/ops lists by default and excluded from route planning (pool candidates + ad-hoc picker). Previously existed on dev only as unrecorded drift; codified 2026-09-06.';
