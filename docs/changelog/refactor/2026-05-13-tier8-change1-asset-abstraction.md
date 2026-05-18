# 2026-05-13 — Tier 8 Change 1: Asset type abstraction registry tables

## What changed
- Created `core.asset_types` — per-tenant asset type registry with `org_id`, `type_key`, `display_name`, `description`, `is_active`. UNIQUE on `(org_id, type_key)`. RLS applied (Tier 7 pattern).
- Created `core.observation_type_registry` — per-tenant, per-asset-type observation type configuration with `observation_key`, `display_name`, `value_type` (state/numeric/boolean CHECK), `valid_values` (jsonb), `is_required`, `sort_order`, `is_active`. UNIQUE on `(org_id, asset_type_id, observation_key)`. FK to `core.asset_types`. RLS applied.
- Added `attributes jsonb NOT NULL DEFAULT '{}'` to `public.assets` — asset-type-specific metadata bag with no prior equivalent.
- Added `external_id text` to `public.assets` — canonical identity key (supersedes `seed_key`). Partial unique index `(org_id, external_id) WHERE external_id IS NOT NULL` to allow NULL during backfill window.
- Added table and column comments to all three objects documenting the abstraction intent and naming decisions.

## Why
- Tier 8 goal: make `transit_stops` one implementation of an asset, not the center of the platform. Any vertical (parks, housing, airports) can now configure its own asset types and observation types without code changes.
- `core.asset_types` is distinct from `public.asset_types` (global code table, no `org_id`) — the new table is the per-tenant configured registry that `core.observation_type_registry` is keyed to.
- `public.assets` already existed as the canonical asset table with `org_id`, `asset_type_id`, `lat`/`lon`, `active`, `display_name`. Only the two genuinely missing columns (`attributes`, `external_id`) were added. Redundant columns (`geo_lat`/`geo_lon`, `is_active`) were not added to avoid confusing duplicates — existing column names are documented in the table comment.
- RLS on both new tables follows the Tier 7 bypass pattern so migrations run without org context.

## Files touched
- `backend/migrations/20260512_tier8_asset_abstraction.sql` (new)
- `docs/changelog/2026-05-13-tier8-change1-asset-abstraction.md` (this file)
