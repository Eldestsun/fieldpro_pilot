-- 20251203_add_infrastructure_issue_fields.sql

BEGIN;

-- Extend infrastructure_issues to better model Blue Card–style infra issues
-- while keeping existing data intact.

ALTER TABLE public.infrastructure_issues
    ADD COLUMN IF NOT EXISTS component text;

ALTER TABLE public.infrastructure_issues
    ADD COLUMN IF NOT EXISTS cause text;

ALTER TABLE public.infrastructure_issues
    ADD COLUMN IF NOT EXISTS needs_facilities boolean DEFAULT true NOT NULL;

ALTER TABLE public.infrastructure_issues
    ADD COLUMN IF NOT EXISTS details jsonb;

COMMIT;

-- To roll back (DOWN migration), run the following manually if needed:
-- BEGIN;
-- ALTER TABLE public.infrastructure_issues DROP COLUMN IF EXISTS details;
-- ALTER TABLE public.infrastructure_issues DROP COLUMN IF EXISTS needs_facilities;
-- ALTER TABLE public.infrastructure_issues DROP COLUMN IF EXISTS cause;
-- ALTER TABLE public.infrastructure_issues DROP COLUMN IF EXISTS component;
-- COMMIT;
