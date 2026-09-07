-- ISSUE-024 / RLS-TSA — make sync_transit_stop_primary_asset org-aware.
--
-- The trigger (AFTER INSERT OR UPDATE OF asset_id ON public.transit_stops)
-- inserted into transit_stop_assets WITHOUT its NOT NULL org_id, so any
-- runtime asset_id write crashed (latent: stops were historically bulk-loaded;
-- the CI seed works around it by disabling the trigger). Fix: the link row
-- inherits the stop's org (NEW.org_id), and the deactivation UPDATEs are
-- org-scoped so a same-named stop_id in another org can never be touched
-- (transit_stop_assets is FORCE RLS; under an org-scoped app connection RLS
-- already constrains this — the explicit predicate makes the trigger correct
-- under BYPASSRLS callers too, e.g. seeds and migrations).
--
-- Idempotent: CREATE OR REPLACE FUNCTION; trigger binding unchanged.

CREATE OR REPLACE FUNCTION public.sync_transit_stop_primary_asset()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- If asset_id is null, deactivate any existing active primary
  IF NEW.asset_id IS NULL THEN
    UPDATE public.transit_stop_assets
    SET active = false, updated_at = now()
    WHERE stop_id = NEW.stop_id AND org_id = NEW.org_id
      AND role = 'primary' AND active = true;
    RETURN NEW;
  END IF;

  -- Deactivate any other active primary for this stop (same org only)
  UPDATE public.transit_stop_assets
  SET active = false, updated_at = now()
  WHERE stop_id = NEW.stop_id
    AND org_id = NEW.org_id
    AND role = 'primary'
    AND active = true
    AND asset_id <> NEW.asset_id;

  -- Ensure the desired primary is active. org_id inherited from the stop
  -- (ISSUE-024: previously omitted → NOT NULL violation on every fire).
  INSERT INTO public.transit_stop_assets (stop_id, asset_id, role, active, org_id)
  VALUES (NEW.stop_id, NEW.asset_id, 'primary', true, NEW.org_id)
  ON CONFLICT (stop_id, asset_id, role) WHERE active = true
  DO UPDATE SET active = true, updated_at = now();

  RETURN NEW;
END;
$function$;
