-- 20251203_add_details_to_hazards.sql

BEGIN;

ALTER TABLE public.hazards
    ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb NOT NULL;

COMMIT;

-- DOWN MIGRATION (optional):
-- BEGIN;
-- ALTER TABLE public.hazards DROP COLUMN IF EXISTS details;
-- COMMIT;