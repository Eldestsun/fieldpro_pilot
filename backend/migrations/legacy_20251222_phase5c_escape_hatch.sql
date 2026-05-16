BEGIN;

CREATE TABLE IF NOT EXISTS public.transit_stop_assets (
  id bigserial PRIMARY KEY,
  stop_id text NOT NULL REFERENCES public.transit_stops(stop_id) ON DELETE CASCADE,
  asset_id bigint NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,

  role text NOT NULL DEFAULT 'primary', -- e.g. primary/shelter/pad/can/sign/light/etc.
  active boolean NOT NULL DEFAULT true,

  installed_at timestamptz,
  removed_at timestamptz,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- prevent duplicates (same stop/asset/role while active)
CREATE UNIQUE INDEX IF NOT EXISTS ux_transit_stop_assets_active
ON public.transit_stop_assets(stop_id, asset_id, role)
WHERE active = true;

-- ensure at most ONE active primary per stop (UL slice invariant)
CREATE UNIQUE INDEX IF NOT EXISTS ux_transit_stop_assets_one_primary
ON public.transit_stop_assets(stop_id)
WHERE active = true AND role = 'primary';

-- backfill from transit_stops.asset_id
INSERT INTO public.transit_stop_assets (stop_id, asset_id, role, active)
SELECT stop_id, asset_id, 'primary', true
FROM public.transit_stops
WHERE asset_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;