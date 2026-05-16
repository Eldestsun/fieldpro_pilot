BEGIN;

-- 0.1) stops.priority_class
ALTER TABLE public.stops
  ADD COLUMN IF NOT EXISTS priority_class text;

-- Backfill: keep existing behavior stable.
-- If is_hotspot already exists and is true, default to 'hotspot', else 'medium'
UPDATE public.stops
SET priority_class = CASE
  WHEN COALESCE(is_hotspot, false) THEN 'hotspot'
  ELSE 'medium'
END
WHERE priority_class IS NULL;

-- Allowed values
ALTER TABLE public.stops
  ADD CONSTRAINT stops_priority_class_chk
  CHECK (priority_class IN ('light', 'medium', 'hotspot'));

-- Pilot-safe contradiction guard:
-- If is_hotspot is true, priority_class cannot be 'light'
ALTER TABLE public.stops
  ADD CONSTRAINT stops_hotspot_priority_consistency_chk
  CHECK (NOT (COALESCE(is_hotspot,false) = true AND priority_class = 'light'));

-- Optional: default for new rows
ALTER TABLE public.stops
  ALTER COLUMN priority_class SET DEFAULT 'medium';

COMMIT;