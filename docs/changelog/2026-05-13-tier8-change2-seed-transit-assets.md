# 2026-05-13 — Tier 8 Change 2: Transit asset seeder

## What changed
- Added `backend/scripts/seed_transit_assets.ts` — idempotent seeder that populates the three Tier 8 registry tables for KCM.
- Seeds `core.asset_types`: one row, `type_key = 'transit_stop'`, `org_id = 1` (KCM).
- Seeds `core.observation_type_registry`: 25 observation types keyed to the transit_stop asset type — 3 required arrival types (`ground_condition`, `shelter_condition`, `pad_condition`) + 22 additional types covering cleaning, safety, and infrastructure observations. Observation keys match exactly what `observationService.ts` emits, so Change 3 registry lookup will resolve correctly.
- Upserts `public.assets`: backfills `external_id = stop_id` and populates `attributes` jsonb with all transit_stop metadata fields (`is_hotspot`, `compactor`, `has_trash`, `pool_id`, `priority_class`, `num_shelters`, `notes`, `stop_status`, `trf_district_code`, `bay_code`, `bearing_code`, `kcm_managed_equipment`, `route_list`) for all 14,916 KCM transit stops.

## Why
- Tier 8 Change 2 done-criteria: `core.assets` (public.assets) populated from `transit_stops`, `core.asset_types` seeded with `transit_stop` for KCM, `core.observation_type_registry` seeded with transit stop observation types.
- Observation keys sourced from `observationService.ts` (`mapSafetyHazard`, `mapInfraIssue`, and inline type strings) rather than the spec's approximate names, so Change 3 can substitute the registry lookup without any key mismatch.
- Runs in migration-bypass mode (no `withOrgContext`), matching the Tier 7 RLS bypass pattern used by `migrate.ts` and `verify_rls.ts`.

## Verification
- Ran twice: same output both times (idempotent confirmed).
- `public.assets`: 14,916 total, 14,916 with `external_id`, 14,916 with non-empty `attributes`.
- `core.observation_type_registry`: 25 rows, 3 marked `is_required = true`.

## Files touched
- `backend/scripts/seed_transit_assets.ts` (new)
- `docs/changelog/2026-05-13-tier8-change2-seed-transit-assets.md` (this file)
