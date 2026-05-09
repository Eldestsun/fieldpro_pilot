-- 1) Function
CREATE OR REPLACE FUNCTION public.enforce_route_runs_pool_invariant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  p_org_id bigint;
  p_base_id text;
BEGIN
  -- If no pool, nothing to enforce
  IF NEW.route_pool_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lookup the pool we reference
  SELECT rp.org_id, rp.base_id
    INTO p_org_id, p_base_id
  FROM public.route_pools rp
  WHERE rp.id = NEW.route_pool_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'route_pool_id % not found', NEW.route_pool_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- org_id: autofill if null; otherwise enforce match
  IF NEW.org_id IS NULL THEN
    NEW.org_id := p_org_id;
  ELSIF NEW.org_id <> p_org_id THEN
    RAISE EXCEPTION
      'route_runs.org_id % does not match route_pools.org_id % (pool=%)',
      NEW.org_id, p_org_id, NEW.route_pool_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- base_id: autofill if null; otherwise enforce match
  IF NEW.base_id IS NULL THEN
    NEW.base_id := p_base_id;
  ELSIF NEW.base_id <> p_base_id THEN
    RAISE EXCEPTION
      'route_runs.base_id % does not match route_pools.base_id % (pool=%)',
      NEW.base_id, p_base_id, NEW.route_pool_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Trigger
DROP TRIGGER IF EXISTS trg_route_runs_pool_invariant ON public.route_runs;

CREATE TRIGGER trg_route_runs_pool_invariant
BEFORE INSERT OR UPDATE OF route_pool_id, org_id, base_id
ON public.route_runs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_route_runs_pool_invariant();
