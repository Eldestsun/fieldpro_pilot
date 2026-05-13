-- ============================================================
-- R11 Change 2 — RLS on core location mapping tables
-- These were missed by Tier 7 — both have org_id but no policy.
-- ============================================================

ALTER TABLE core.asset_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.asset_locations FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON core.asset_locations
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

ALTER TABLE core.location_external_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.location_external_ids FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON core.location_external_ids
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

COMMENT ON POLICY org_isolation ON core.asset_locations IS
  'Tenant isolation — mirrors Tier 7 pattern. Missed in original RLS migration.';

COMMENT ON POLICY org_isolation ON core.location_external_ids IS
  'Tenant isolation — mirrors Tier 7 pattern. Missed in original RLS migration.';
