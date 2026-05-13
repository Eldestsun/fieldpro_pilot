# Tier 8 — Asset Type Abstraction

> **Goal**: Promote `core.assets` from a referenced-but-peripheral table to the canonical source of truth for all field-condition assets. Make `transit_stops` one implementation of an asset, not the center of the platform. This is what makes BASELINE deployable to parks departments, public housing authorities, airports, and any other public-facing asset portfolio without code changes.
>
> **Status**: 🔴 Not started
> **Depends on**: Tier 7 done (RLS must be enforced before the asset abstraction layer gets traffic), Tier 4A done (stops columns lowercase — the transit adapter must be clean before it becomes one implementation among many)
> **Blocks**: Nothing — but is the prerequisite for onboarding any non-transit agency

---

## Context

Right now `transit_stops` is load-bearing center. The entire visit and observation write path assumes a stop. `route_run_stops` joins to stops. Intelligence reads from stops. The UI is built around the stop concept.

This is correct for the first vertical slice. It is wrong for the platform.

The canonical model already has `core.assets` — referenced in `stop_condition_history` via `asset_id` and in `core.assignments` via `primary_asset_id`. But nothing writes to it meaningfully and nothing reads from it for field operations.

After this tier: a visit belongs to an asset. An asset has a type. Asset types are configured per tenant. `transit_stops` becomes one source of assets — a seeder that populates `core.assets` for transit agencies. A parks department seeds `core.assets` from their GIS layer. A public housing authority seeds from their unit inventory. The field UI, the intelligence layer, and the canonical write paths work identically regardless of asset type.

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/migrations/YYYYMMDD_asset_abstraction.sql` (new) | Promote `core.assets`, add `asset_type_id`, create `asset_types` registry, create `observation_type_registry` |
| `backend/src/domains/asset/assetService.ts` (new) | CRUD for assets and asset types |
| `backend/src/domains/observation/observationService.ts` | Read valid observation types from registry, not hardcoded constants |
| `backend/src/domains/visit/visitService.ts` | Visit belongs to asset via `core.assets`, not directly to `route_run_stop` only |
| `backend/scripts/seed_transit_assets.ts` (new) | One-time seeder that populates `core.assets` from `transit_stops` for KCM |
| `backend/src/modules/admin/tenantRoutes.ts` (new) | Admin API for tenant configuration — asset types, observation types |

---

## Files to Leave Alone

| File | Reason |
|------|--------|
| `transit_stops` table | Becomes a seeding source, not dropped — transit agencies still need it |
| `route_run_stops` | Transit adapter — stays intact through Tier 2 verification |
| All frontend files | UI abstraction follows backend abstraction in R5 follow-on |
| All auth files | Frozen |

---

## Change 1 — Asset Type Registry and Observation Type Registry

### Migration

```sql
-- ============================================================
-- Asset Type Abstraction
-- Promotes core.assets to canonical source of truth.
-- Adds per-tenant asset type and observation type configuration.
-- transit_stops becomes one seeding source among many.
-- ============================================================

-- Asset type registry — per org, per asset class
CREATE TABLE IF NOT EXISTS core.asset_types (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id           bigint NOT NULL REFERENCES organizations(id),
  type_key         text NOT NULL,     -- 'transit_stop', 'restroom', 'trailhead', 'shelter'
  display_name     text NOT NULL,
  description      text,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, type_key)
);

COMMENT ON TABLE core.asset_types IS
  'Per-tenant asset type registry. Defines what kinds of assets exist '
  'for this organization. transit_stop is one type among many. '
  'No transit-specific assumptions — type_key is free text per tenant.';

-- Observation type registry — per org, per asset type
CREATE TABLE IF NOT EXISTS core.observation_type_registry (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id              bigint NOT NULL REFERENCES organizations(id),
  asset_type_id       bigint NOT NULL REFERENCES core.asset_types(id),
  observation_key     text NOT NULL,   -- 'ground_condition', 'restroom_cleanliness', etc.
  display_name        text NOT NULL,
  value_type          text NOT NULL    -- 'state', 'numeric', 'boolean'
    CHECK (value_type IN ('state', 'numeric', 'boolean')),
  valid_values        jsonb,           -- for state type: ['clean','dirty','needs_attention']
  is_required         boolean NOT NULL DEFAULT false,
  sort_order          integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, asset_type_id, observation_key)
);

COMMENT ON TABLE core.observation_type_registry IS
  'Per-tenant, per-asset-type observation type configuration. '
  'Replaces hardcoded observation type constants in observationService.ts. '
  'Each tenant defines what observations are valid for each asset type. '
  'No transit assumptions — fully configurable per org.';

-- Add asset_type_id to core.assets
ALTER TABLE core.assets
  ADD COLUMN IF NOT EXISTS asset_type_id bigint REFERENCES core.asset_types(id),
  ADD COLUMN IF NOT EXISTS org_id bigint REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS external_id text,     -- stop_id, unit_id, trail_id etc
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS geo_lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS geo_lon numeric(9,6),
  ADD COLUMN IF NOT EXISTS attributes jsonb DEFAULT '{}',  -- asset-type-specific metadata
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_assets_org_type
  ON core.assets (org_id, asset_type_id);

CREATE INDEX IF NOT EXISTS idx_assets_external_id
  ON core.assets (org_id, external_id);
```

---

## Change 2 — Transit Asset Seeder

### `backend/scripts/seed_transit_assets.ts`

Populates `core.assets` from `transit_stops` for KCM. Run once after migration. Idempotent.

```typescript
// For each row in transit_stops:
// INSERT INTO core.assets (org_id, asset_type_id, external_id, display_name, geo_lat, geo_lon, attributes)
// VALUES ($orgId, $transitStopTypeId, stop.stop_id, stop.on_street_name, stop.lat, stop.lon,
//   jsonb with is_hotspot, compactor, has_trash, pool_id etc.)
// ON CONFLICT (org_id, external_id) DO UPDATE SET attributes = EXCLUDED.attributes

// Also seeds core.asset_types with 'transit_stop' for KCM org
// And seeds core.observation_type_registry with the transit stop observation types:
// ground_condition, shelter_condition, pad_condition, washed_can,
// trash_volume, hazard_present, infra_condition
```

---

## Change 3 — Observation Service Reads From Registry

### `backend/src/domains/observation/observationService.ts`

Replace hardcoded `ARRIVAL_OBSERVATION_TYPES` constant and observation type strings with a registry lookup:

```typescript
// Before:
const ARRIVAL_OBSERVATION_TYPES = [
  'ground_condition',
  'shelter_condition', 
  'pad_condition'
] as const

// After:
async function getArrivalObservationTypes(
  assetTypeId: number,
  orgId: number,
  client: PoolClient
): Promise<string[]> {
  const result = await client.query(`
    SELECT observation_key
    FROM core.observation_type_registry
    WHERE org_id = $1
      AND asset_type_id = $2
      AND is_required = true
      AND is_active = true
    ORDER BY sort_order
  `, [orgId, assetTypeId])
  
  return result.rows.map(r => r.observation_key)
}
```

This means when a parks department configures `restroom_cleanliness` and `soap_dispenser_status` as their required observation types, the arrival observations, submission validation, and intelligence derivation all work without any code change.

---

## Change 4 — Tenant Configuration API

### `backend/src/modules/admin/tenantRoutes.ts` (new)

Minimal admin API for tenant setup:

```
GET  /api/admin/tenant/asset-types          — list asset types for org
POST /api/admin/tenant/asset-types          — create new asset type
GET  /api/admin/tenant/observation-types    — list observation types for asset type
POST /api/admin/tenant/observation-types    — configure observation types for asset type
POST /api/admin/tenant/seed-assets          — trigger asset seeding from uploaded CSV
```

The CSV seed endpoint accepts: `external_id, display_name, lat, lon, [asset-type-specific columns as JSON]`

This is the onboarding flow for agency two. No developer required. Admin uploads their asset inventory, maps columns, observation types are configured through the UI, and the canonical layer is ready for field operations.

---

## Tier 8 Overall Done Definition

Tier 8 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] `core.asset_types` and `core.observation_type_registry` tables exist and are seeded for KCM
- [ ] `core.assets` is populated from `transit_stops` via seed script
- [ ] `observationService.ts` reads valid observation types from registry — no hardcoded type lists
- [ ] A second test org with a different asset type (`restroom`) can be configured and produces correct observation validation without code changes
- [ ] Tenant configuration API accepts a CSV asset upload and seeds `core.assets`
- [ ] KCM operation is unaffected — all existing transit stop observations still work
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-tier-8-asset-abstraction.md`

---

## Agent Launch Blocks

### Step 1 — Migration and registry tables
```
Refactor task. Read CLAUDE.md, then planning/TIER_8_ASSET_ABSTRACTION.md, Change 1.
Write the migration creating core.asset_types and core.observation_type_registry.
Add asset_type_id, org_id, external_id, display_name, geo_lat, geo_lon,
attributes, is_active columns to core.assets.
Add table comments explaining the abstraction intent.
Do not touch any service files.
```

### Step 2 — Transit asset seeder
```
Ops task. Read CLAUDE.md, then planning/TIER_8_ASSET_ABSTRACTION.md, Change 2.
Write backend/scripts/seed_transit_assets.ts that populates core.assets,
core.asset_types (transit_stop type for KCM org), and
core.observation_type_registry (all transit stop observation types)
from transit_stops. Idempotent — ON CONFLICT DO UPDATE.
Do not touch any production service files.
```

### Step 3 — Observation service registry lookup
```
Refactor task. Read CLAUDE.md, then planning/TIER_8_ASSET_ABSTRACTION.md, Change 3.
In backend/src/domains/observation/observationService.ts, replace hardcoded
observation type constants with getArrivalObservationTypes() registry lookup.
The function queries core.observation_type_registry by org_id and asset_type_id.
KCM behavior must be identical after this change — verify against seeded registry.
Do not touch any other file.
```

### Step 4 — Tenant configuration API
```
Feature task. Read CLAUDE.md, then planning/TIER_8_ASSET_ABSTRACTION.md, Change 4.
Create backend/src/modules/admin/tenantRoutes.ts with the five endpoints defined
in the file. The CSV seed endpoint accepts asset inventory upload and populates
core.assets. Mount routes in the main router under /api/admin/tenant.
Do not touch any canonical service files directly — use assetService.ts.
```

---