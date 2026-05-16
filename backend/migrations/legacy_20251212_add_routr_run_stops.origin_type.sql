BEGIN;

-- 0.2) route_run_stops.origin_type
ALTER TABLE public.route_run_stops
  ADD COLUMN IF NOT EXISTS origin_type text;

-- Backfill existing data as 'planned'
UPDATE public.route_run_stops
SET origin_type = 'planned'
WHERE origin_type IS NULL;

ALTER TABLE public.route_run_stops
  ADD CONSTRAINT route_run_stops_origin_type_chk
  CHECK (origin_type IN ('planned', 'emergency', 'ul_ad_hoc'));

ALTER TABLE public.route_run_stops
  ALTER COLUMN origin_type SET DEFAULT 'planned';

-- Helpful index for analytics/export queries
CREATE INDEX IF NOT EXISTS route_run_stops_origin_type_idx
  ON public.route_run_stops (origin_type);

COMMIT;