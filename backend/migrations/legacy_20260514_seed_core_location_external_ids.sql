-- ============================================================
-- ISSUE-009 fix: backfill core.location_external_ids
--
-- Migration 20261226_core_backfill_coreLocations_+_coreLocation_external_ids_v1.sql
-- created one core.locations row per transit stop but the second INSERT step
-- (into core.location_external_ids) did not complete, leaving the table empty.
-- core.v_locations_transit is built from this join, so getVisitContext() threw
-- "missing location_id" for every route_run_stop — causing 16 canonical tests
-- to fail.
--
-- This migration completes that backfill: one row per transit_stop location,
-- with source_system='metro_stop' and external_id = core.locations.label
-- (which holds the original transit_stops.stop_id value).
--
-- Idempotent: ON CONFLICT DO NOTHING.
-- Safe: INSERT-only; no UPDATE or DELETE.
-- Labor safety: no worker identity columns involved.
-- ============================================================

INSERT INTO core.location_external_ids (org_id, location_id, source_system, external_id)
SELECT l.org_id, l.id, 'metro_stop', l.label
FROM core.locations l
WHERE l.location_type = 'transit_stop'
ON CONFLICT (org_id, source_system, external_id) DO NOTHING;
