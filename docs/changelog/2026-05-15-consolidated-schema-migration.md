# 2026-05-15 — Consolidated schema migration for clean deployments

## What changed

- Added `backend/migrations/00000000_consolidated_schema.sql` — a single file that
  creates the full schema (all tables, views, functions, triggers, indexes, RLS
  policies) from scratch on a completely empty database.
- Renamed all 55 existing migration files with a `legacy_` prefix
  (e.g. `20251130_base_schema.sql` → `legacy_20251130_base_schema.sql`).
- Updated `backend/src/scripts/migrate.ts`:
  - Added logic to skip all `legacy_*` files once the consolidated schema
    has been applied, preventing double-apply on fresh deployments.
  - `consolidatedApplied` flag is updated in-loop immediately after the
    consolidated schema is applied, so legacy files are skipped in the same run.
  - All tracking-table references updated to `public.schema_migrations`
    (fully qualified) to be robust against migrations that alter `search_path`.
- Removed the `SELECT pg_catalog.set_config('search_path', '', false)` line
  from the consolidated schema (pg_dump artifact that breaks the migration
  runner's tracking INSERT when executed inside a transaction).
- Replaced it with a comment noting that all identifiers are fully qualified.
- Inserted `00000000_consolidated_schema.sql` into `schema_migrations` on the
  local dev database so the existing incremental history is preserved.

## Why

- Render and any other fresh deployment environment start with an empty database.
  The incremental migration sequence had 11+ ordering and dependency failures on
  a clean DB because the files were written against a schema that was built up
  locally over months.
- Fixing individual migration files one at a time would not have resolved the
  root problem: the ordering issues were structural across the full sequence.
- The consolidated approach is the standard pattern for this: capture the known-good
  state as a single atomic schema, rename history files to legacy, and let the
  runner gate on what is already applied.

## Files touched

- `backend/migrations/00000000_consolidated_schema.sql` (new)
- `backend/migrations/legacy_schema_dump.sql` (renamed from schema_dump.sql)
- `backend/migrations/legacy_20251130_base_schema.sql` (renamed)
- `backend/migrations/legacy_20251201_add_stop_photos.sql` (renamed)
- `backend/migrations/legacy_20251202_intelligence_foundation.sql` (renamed)
- `backend/migrations/legacy_20251203_add_details_to_hazards.sql` (renamed)
- `backend/migrations/legacy_20251203_add_infrastructure_issue_fields.sql` (renamed)
- `backend/migrations/legacy_20251206_add_lead_route_overrides.sql` (renamed)
- `backend/migrations/legacy_20251207_mv_v1.sql` (renamed)
- `backend/migrations/legacy_20251208_mv_migration_patch_uniqueIndexForConcurrentRefresh.sql` (renamed)
- `backend/migrations/legacy_20251212_add_routr_run_stops.origin_type.sql` (renamed)
- `backend/migrations/legacy_20251212_add_stops.priorityclass.sql` (renamed)
- `backend/migrations/legacy_20251212_day7_intelligence_enforcement.sql` (renamed)
- `backend/migrations/legacy_20251212_day7_mv_hardening_and_exports.sql` (renamed)
- `backend/migrations/legacy_20251214_add_photo_keys.sql` (renamed)
- `backend/migrations/legacy_20251216_add_washed_can.sql` (renamed)
- `backend/migrations/legacy_20251221_phase5c_DB_asset_flip.sql` (renamed)
- `backend/migrations/legacy_20251222_phase5c_convert_stops_RO_compat_view.sql` (renamed)
- `backend/migrations/legacy_20251222_phase5c_create_transit_stops.sql` (renamed)
- `backend/migrations/legacy_20251222_phase5c_escape_hatch.sql` (renamed)
- `backend/migrations/legacy_20251223_001_route_run_identity.sql` (renamed)
- `backend/migrations/legacy_20251223_002_identity_directory.sql` (renamed)
- `backend/migrations/legacy_20251223_assign_user_oid_route_runs.sql` (renamed)
- `backend/migrations/legacy_20251223_DevOnly_oid_backfill.sql` (renamed)
- `backend/migrations/legacy_20251226_01_core_state_layer_spine.sql` (renamed)
- `backend/migrations/legacy_20251226_add_passthrough_clean_logs.sql` (renamed)
- `backend/migrations/legacy_20251226_add_passthrough_hazards.sql` (renamed)
- `backend/migrations/legacy_20251226_add_passthrough_infrastructure.sql` (renamed)
- `backend/migrations/legacy_20251226_add_passthrough_l3_logs.sql` (renamed)
- `backend/migrations/legacy_20251226_add_passthrough_stop_photos.sql` (renamed)
- `backend/migrations/legacy_20251226_add_passthrough_trash_volume_logs.sql` (renamed)
- `backend/migrations/legacy_20251226_assignment_mapping_v1.sql` (renamed)
- `backend/migrations/legacy_20251226_core_backfill_coreAsset_locations_from_transit_stop_assets.sql` (renamed)
- `backend/migrations/legacy_20251226_core_canonical_mapping_views_v1.sql` (renamed)
- `backend/migrations/legacy_20251226_core_enforc_org_id_consistency_trigger.sql` (renamed)
- `backend/migrations/legacy_20251226_core_invariants.sql` (renamed)
- `backend/migrations/legacy_20251226_core_mapping_views.sql` (renamed)
- `backend/migrations/legacy_20251226_core_stop_2_location_view.sql` (renamed)
- `backend/migrations/legacy_20251227_add_visitID_hazards.sql` (renamed)
- `backend/migrations/legacy_20251227_add_visitID_infrastructure_issues.sql` (renamed)
- `backend/migrations/legacy_20251227_add_visitID_l3_logs.sql` (renamed)
- `backend/migrations/legacy_20251227_add_visitID_public_clean_logs.sql` (renamed)
- `backend/migrations/legacy_20251227_add_visitID_stop_photos.sql` (renamed)
- `backend/migrations/legacy_20251227_add_visitID_trash_volume_logs.sql` (renamed)
- `backend/migrations/legacy_20260508_replace_surveillance_tables.sql` (renamed)
- `backend/migrations/legacy_20260508_stops_view_lowercase_columns.sql` (renamed)
- `backend/migrations/legacy_20260512_row_level_security.sql` (renamed)
- `backend/migrations/legacy_20260512_tier8_asset_abstraction.sql` (renamed)
- `backend/migrations/legacy_20260513_audit_log.sql` (renamed)
- `backend/migrations/legacy_20260513_eam_bridge_route_log.sql` (renamed)
- `backend/migrations/legacy_20260513_r11_core_location_tables_rls.sql` (renamed)
- `backend/migrations/legacy_20260513_r11_identity_directory_org.sql` (renamed)
- `backend/migrations/legacy_20260513_r11_route_runs_org_notnull.sql` (renamed)
- `backend/migrations/legacy_20260513_s1_13_oid_encryption.sql` (renamed)
- `backend/migrations/legacy_20260513_s1_4_export_delete_tokens.sql` (renamed)
- `backend/migrations/legacy_20260514_seed_core_location_external_ids.sql` (renamed)
- `backend/migrations/legacy_20261226_core_backfill_coreLocations_+_coreLocation_external_ids_v1.sql` (renamed)
- `backend/migrations/legacy_migrations_manifest.sql` (renamed)
- `backend/src/scripts/migrate.ts` (updated)
- `docs/changelog/2026-05-15-consolidated-schema-migration.md` (this file)
