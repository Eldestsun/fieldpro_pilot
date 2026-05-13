# 2026-05-13 — Tier 8 Change 3: observation service reads types from registry

## What changed
- Removed hardcoded `ARRIVAL_OBSERVATION_TYPES` constant from `observationService.ts`
- Added `getArrivalObservationTypes(coreAssetTypeId, orgId, client)` — queries `core.observation_type_registry` for required, active observation keys ordered by `sort_order`
- Added `resolveCoreAssetTypeId(assetId, orgId, client)` — bridges `public.assets → public.asset_types → core.asset_types` via `type_key = code` within the org to resolve a canonical asset type ID
- Updated `arrivalObservations` signature to accept `assetId` and `orgId` alongside `stopId` and `client`; uses registry lookup for observation types
- Falls back to `arrivalObservationDefaults()` when registry is empty (seeder not yet run) — preserves KCM behavior until Change 2 seeder executes
- Updated `emitObservationsForStop` call sites to pass `assetId` and `orgId` to `arrivalObservations`
- Changed `arrivalDefault` parameter type from `typeof ARRIVAL_OBSERVATION_TYPES[number]` to `string`

## Why
- Replaces hardcoded transit-specific observation type list with per-tenant, per-asset-type registry configuration
- Enables any org to define their own required observation types for any asset type without code changes
- Parks departments configuring `restroom_cleanliness` and `soap_dispenser_status` will produce correct arrival observations automatically once their registry rows are seeded

## Files touched
- `backend/src/domains/observation/observationService.ts`
- `docs/changelog/2026-05-13-tier8-change3-observation-registry-lookup.md`
