-- ============================================================
-- ROLLBACK: drop the transit.* adapter schema
-- 2026-06-13 — reverses 20260613_create_transit_schema.sql (ISSUE-031 P0)
--
-- Safe to run as long as the schema is still empty — at P0 it is pure
-- scaffolding (no objects, no readers). The view-eviction phases (P1/P4) that
-- populate transit.* have NOT run yet, so a plain DROP SCHEMA removes only the
-- empty schema and its grants. RESTRICT (the default) is used deliberately: if
-- any object has since been created in transit.*, the drop FAILS rather than
-- silently cascading — that is the signal that a later phase has landed and this
-- rollback is no longer the right reversal.
-- ============================================================

BEGIN;

DROP SCHEMA transit RESTRICT;

COMMIT;
