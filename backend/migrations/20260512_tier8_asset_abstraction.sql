-- ============================================================
-- Tier 8 — Asset Type Abstraction: Change 1
-- Registry tables and public.assets column promotion.
--
-- Context: public.assets already exists as the canonical asset
-- table — all operational FKs across the system point to it. The
-- spec named the target 'core.assets' anticipating a bare skeleton;
-- in practice the table lives in public.* and already carries
-- org_id, asset_type_id (→ public.asset_types), seed_key, lat/lon,
-- display_name, and active.
--
-- This migration does three things:
--
--   1. Creates core.asset_types — per-tenant asset type registry.
--      Distinct from public.asset_types (a global code/enum table
--      with no org_id). core.asset_types is what the seeder and
--      observation registry are keyed to.
--
--   2. Creates core.observation_type_registry — per-tenant,
--      per-asset-type observation type configuration. Replaces
--      hardcoded type constants in observationService.ts (Change 3).
--
--   3. Adds two genuinely new columns to public.assets:
--        attributes  — jsonb metadata bag (no prior equivalent)
--        external_id — canonical identity key (seed_key is its
--                      predecessor with the same semantic meaning)
--
-- Columns that already exist under prior names are NOT duplicated:
--   geo_lat / geo_lon  →  lat / lon  (double precision, in active use)
--   is_active          →  active     (boolean, in active use)
--   org_id             →  already present
--   asset_type_id      →  already present (→ public.asset_types)
--   display_name       →  already present
--
-- RLS follows the Tier 7 app.current_org_id bypass pattern:
--   unset variable = migration bypass; set variable = tenant filter.
-- ============================================================


-- ============================================================
-- 1.  core.asset_types
-- ============================================================

CREATE TABLE IF NOT EXISTS core.asset_types (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id       bigint NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  type_key     text   NOT NULL,
  display_name text   NOT NULL,
  description  text,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, type_key)
);

COMMENT ON TABLE core.asset_types IS
  'Per-tenant asset type registry. Defines what kinds of assets exist '
  'for this organization — transit_stop is one type among many. '
  'type_key is free text per tenant; no platform-wide enum. '
  'Distinct from public.asset_types, which is a global code table '
  'without org scoping. core.observation_type_registry is keyed here.';

COMMENT ON COLUMN core.asset_types.org_id IS
  'Tenant isolation — every asset type belongs to exactly one org. '
  'RLS enforces this at the DB layer.';

COMMENT ON COLUMN core.asset_types.type_key IS
  'Tenant-local identifier string. Examples: transit_stop, restroom, '
  'trailhead, shelter, housing_unit. Must be unique within the org. '
  'The seeder (Change 2) inserts ''transit_stop'' for KCM.';

COMMENT ON COLUMN core.asset_types.description IS
  'Optional human-readable description for the admin config UI.';

ALTER TABLE core.asset_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.asset_types FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON core.asset_types;
CREATE POLICY org_isolation ON core.asset_types
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );

COMMENT ON POLICY org_isolation ON core.asset_types IS
  'Tier 7 tenant isolation pattern. Filters all ops by '
  'app.current_org_id set via withOrgContext(). '
  'Migrations bypass via unset variable.';


-- ============================================================
-- 2.  core.observation_type_registry
-- ============================================================

CREATE TABLE IF NOT EXISTS core.observation_type_registry (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id          bigint NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  asset_type_id   bigint NOT NULL REFERENCES core.asset_types(id) ON DELETE CASCADE,
  observation_key text   NOT NULL,
  display_name    text   NOT NULL,
  value_type      text   NOT NULL
    CHECK (value_type IN ('state', 'numeric', 'boolean')),
  valid_values    jsonb,
  is_required     boolean NOT NULL DEFAULT false,
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, asset_type_id, observation_key)
);

COMMENT ON TABLE core.observation_type_registry IS
  'Per-tenant, per-asset-type observation type configuration. '
  'Replaces hardcoded observation type constants in observationService.ts. '
  'Each org configures what observations are valid for each asset type. '
  'No transit-specific assumptions — fully configurable per tenant. '
  'Change 3 will query this table via getArrivalObservationTypes() '
  'instead of the hardcoded ARRIVAL_OBSERVATION_TYPES constant.';

COMMENT ON COLUMN core.observation_type_registry.observation_key IS
  'Tenant-local identifier string for this observation type. '
  'KCM transit_stop examples: ground_condition, shelter_condition, '
  'pad_condition, washed_can, trash_volume, hazard_present, infra_condition.';

COMMENT ON COLUMN core.observation_type_registry.value_type IS
  'Controls the shape of valid_values and how observations are validated: '
  'state   — valid_values is a JSON string array of allowed values; '
  'numeric — valid_values is a {"min": n, "max": n} range object; '
  'boolean — valid_values is unused (null).';

COMMENT ON COLUMN core.observation_type_registry.valid_values IS
  'Depends on value_type. '
  'State example:   ["clean", "dirty", "needs_attention"]. '
  'Numeric example: {"min": 0, "max": 100}. '
  'Boolean:         null.';

COMMENT ON COLUMN core.observation_type_registry.is_required IS
  'When true, this observation must be captured on every visit '
  'to an asset of this type. Used by getArrivalObservationTypes() '
  'in Change 3 to replace the hardcoded required-type list.';

COMMENT ON COLUMN core.observation_type_registry.sort_order IS
  'Display and validation ordering within a given asset type. '
  'Lower numbers appear first in the field UI.';

ALTER TABLE core.observation_type_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.observation_type_registry FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_isolation ON core.observation_type_registry;
CREATE POLICY org_isolation ON core.observation_type_registry
  USING (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  )
  WITH CHECK (
    COALESCE(current_setting('app.current_org_id', true), '') = ''
    OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
  );

COMMENT ON POLICY org_isolation ON core.observation_type_registry IS
  'Tier 7 tenant isolation pattern. Filters all ops by '
  'app.current_org_id set via withOrgContext(). '
  'Migrations bypass via unset variable.';


-- ============================================================
-- 3.  public.assets — add missing columns
--
-- public.assets is the canonical asset table in this codebase.
-- Columns already present are left unchanged to preserve all
-- existing FKs, indexes, and write paths.
-- ============================================================

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS attributes  jsonb    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS external_id text;

COMMENT ON TABLE public.assets IS
  'Canonical asset table. A visit belongs to an asset; '
  'an asset has a type; asset types are configured per tenant '
  'in core.asset_types. '
  'transit_stops is one seeding source — parks, facilities, and '
  'housing portfolios seed this table from their own inventories. '
  'Any field ops vertical plugs in here without schema changes. '
  'Coordinate columns:  lat / lon (double precision). '
  'Active flag:         active (boolean). '
  'Legacy identity key: seed_key. '
  'Canonical identity:  external_id (added Tier 8).';

COMMENT ON COLUMN public.assets.attributes IS
  'Asset-type-specific metadata. Schema is defined per asset type; '
  'no platform-wide shape is imposed. '
  'transit_stop example: '
  '{"is_hotspot": true, "compactor": false, "has_trash": true, "pool_id": "p1"}. '
  'restroom example: {"stall_count": 4, "ada_compliant": true}.';

COMMENT ON COLUMN public.assets.external_id IS
  'Canonical external identity key — the ID this asset carries in its '
  'source system (stop_id, unit_id, trail_id, parcel_id, etc.). '
  'seed_key is the predecessor column with the same semantic meaning; '
  'both coexist during the Tier 8 transition. '
  'Change 2 (seed_transit_assets.ts) will backfill this from seed_key '
  'for all existing KCM transit stop rows.';

COMMENT ON COLUMN public.assets.seed_key IS
  'Pre-Tier-8 identity key — the external system ID used during initial '
  'seeding. Superseded by external_id (Tier 8). '
  'Retained to avoid breaking existing seeding paths.';

-- Partial unique index: only enforced for rows where external_id is set.
-- Allows existing rows to remain NULL during the backfill window.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_org_external_id
  ON public.assets (org_id, external_id)
  WHERE external_id IS NOT NULL;
