-- ============================================================
-- Harden org_isolation on the two unguarded core location tables
-- 2026-05-30
--
-- core.asset_locations and core.location_external_ids are the ONLY two RLS
-- policies in the database that still use the unguarded cast form:
--
--     org_id = current_setting('app.current_org_id', true)::bigint
--
-- Every other org_isolation policy (core.visits, core.observations,
-- core.locations, and 25+ public.* tables) uses the guarded form that
-- COALESCE/NULLIF-bypasses an empty/unset context. Provenance: these two
-- policies were created unguarded in legacy_20260513_r11_core_location_tables_rls.sql,
-- then re-created (to add WITH CHECK) still unguarded in
-- 20260518_rls_phase3_structural_fixes.sql Part B — while Parts A and D of the
-- same migration used the guarded form. The inconsistency was never reconciled.
--
-- Symptom (PATTERN-001): a pooled connection whose app.current_org_id was reset
-- to '' by a prior request's withOrgContext/finally hits `''::bigint` and the
-- query raises `invalid input syntax for type bigint: ""` (HTTP 500). The
-- security-definer view core.v_locations_transit reads core.location_external_ids,
-- so the start-stop visit-ensure path 500'd and no core.visits / core.observations
-- were ever written.
--
-- The primary fix is in application code (startRouteRunStopInternal now runs
-- inside withOrgContext). This migration aligned these two policies with the
-- COALESCE/NULLIF guarded form used by every other org_isolation policy, so an
-- empty context no longer raises `bigint: ""` (HTTP 500).
--
-- CORRECTION (MT-2, 2026-06-27): the original wording here claimed this guarded
-- form makes an unset/empty context "fail CLOSED (empty result)". That was WRONG.
-- The guarded form is fail-OPEN: its `COALESCE(...) = '' OR …` first branch is TRUE
-- when context is unset, so the policy admitted ALL rows. It traded a 500 for
-- silent all-rows exposure. Migration 20260627_mt2_rls_fail_closed.sql drops that
-- pass-all branch across every org-scoped policy, making unset context yield ZERO
-- rows (true fail-closed). Tenant isolation under a real org context is unchanged.
-- ============================================================

BEGIN;

-- ── core.asset_locations ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS org_isolation ON core.asset_locations;
CREATE POLICY org_isolation ON core.asset_locations
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON core.asset_locations IS
  '2026-05-30: guarded org isolation (COALESCE/NULLIF). Empty app.current_org_id bypasses instead of raising bigint:"" — matches all other org_isolation policies.';

-- ── core.location_external_ids ───────────────────────────────────────────────
DROP POLICY IF EXISTS org_isolation ON core.location_external_ids;
CREATE POLICY org_isolation ON core.location_external_ids
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );
COMMENT ON POLICY org_isolation ON core.location_external_ids IS
  '2026-05-30: guarded org isolation (COALESCE/NULLIF). Empty app.current_org_id bypasses instead of raising bigint:"" — matches all other org_isolation policies.';

-- ── Assert: no unguarded current_setting(...)::bigint org_isolation policies remain ──
DO $$
DECLARE
  unguarded_count int;
BEGIN
  SELECT count(*) INTO unguarded_count
  FROM pg_policies
  WHERE qual LIKE '%current_setting(%app.current_org_id%'
    AND qual NOT LIKE '%NULLIF%'
    AND qual NOT LIKE '%COALESCE%';
  IF unguarded_count <> 0 THEN
    RAISE EXCEPTION 'Expected 0 unguarded org_isolation policies, found %', unguarded_count;
  END IF;
END $$;

COMMIT;
