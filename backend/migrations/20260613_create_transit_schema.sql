-- ============================================================
-- Create the transit.* adapter schema (ISSUE-031 Phase 0 / DQ-1)
-- 2026-06-13 — ISSUE-031 P0, Step 0.1
--
-- Creates the dedicated `transit` schema that is the destination for the
-- transit-vertical translation views evicted out of `core` in later ISSUE-031
-- phases (P1/P4: the v_*_transit views). This migration is PURE SCAFFOLDING —
-- an empty schema with grants. Zero behavior change; no objects are created in
-- it here, and nothing reads it yet.
--
-- ── WHY A DEDICATED SCHEMA (DQ-1) ────────────────────────────────────────────
--   DQ-1 decided the evicted views land in a dedicated `transit.*` schema rather
--   than in `public` tagged as adapter objects. This makes the canonical↔vertical
--   boundary (CANON-1: "canonical learns no vertical's vocabulary") a STRUCTURAL
--   fact enforced by schema grant — visible in \dn, impossible to violate by
--   accident — instead of a naming convention. core is a schema; each vertical is
--   a schema; the separation is grantable. Future verticals follow the same shape
--   (parks.*, etc.).
--
-- ── GRANTS: WHO MAY READ transit.* ───────────────────────────────────────────
--   GRANT USAGE → fieldpro ONLY. fieldpro is the app role; it legitimately reads
--   the transit translation views that will live here.
--
--   DELIBERATELY NOT GRANTED (CANON-1, the transit vertical boundary):
--     • intelligence_reader — the intelligence/reporting role must never resolve
--       a vertical's vocabulary or reach a transit worker column. The evicted
--       v_*_transit views carry worker columns (user_id / reported_by /
--       created_by_oid, per ISSUE-030); withholding USAGE on the schema is what
--       makes "intelligence cannot see the transit adapter" a permission-layer
--       guarantee rather than a code-review rule. A new view created in this
--       schema therefore cannot be read by intelligence_reader even by mistake.
--     • mcp_readonly — the diagnostic LOGIN role was already revoked to
--       canonical-only (ADR Q-G / Calibration D7, merge ca92bf6). It must not
--       regain a worker-identity read path through the transit adapter schema.
--
--   PostgreSQL grants no USAGE on a new schema to PUBLIC or to non-owner roles by
--   default, so the absence of a grant for these two roles is already enforced by
--   default; the explicit non-grant + this comment make the intent auditable.
--
-- Verification (run as superuser after apply):
--   SELECT nspname FROM pg_namespace WHERE nspname = 'transit';                  -- transit
--   SELECT has_schema_privilege('intelligence_reader','transit','USAGE');        -- false
--   SELECT has_schema_privilege('mcp_readonly','transit','USAGE');               -- false
--   SELECT has_schema_privilege('fieldpro','transit','USAGE');                   -- true
--   SELECT count(*) FROM pg_class WHERE relnamespace = 'transit'::regnamespace;  -- 0
--
-- Rollback: rollback/20260613_create_transit_schema_rollback.sql
--   (DROP SCHEMA transit — safe while empty; P4 view-eviction has not run yet).
-- ============================================================

BEGIN;

-- 1. The transit-vertical adapter schema.
--    IF NOT EXISTS (ISSUE-038 idempotency guard): a re-run against an already-
--    migrated DB is a no-op instead of erroring "schema transit already exists".
--    On an empty DB this still creates the schema normally.
CREATE SCHEMA IF NOT EXISTS transit;

COMMENT ON SCHEMA transit IS
  'Transit-vertical adapter layer (ISSUE-031 DQ-1). Destination for the '
  'transit translation views evicted from core in P1/P4 (the v_*_transit '
  'objects). core holds the canonical, vertical-agnostic model; each vertical '
  'gets its own schema so the canonical<->vertical boundary (CANON-1) is '
  'enforced by schema grant, not naming convention. The app role fieldpro has '
  'USAGE; intelligence_reader and mcp_readonly deliberately do NOT, so the '
  'intelligence/diagnostic roles cannot reach a transit worker column through '
  'this adapter.';

-- 2. The app role reads transit translation views — grant USAGE.
GRANT USAGE ON SCHEMA transit TO fieldpro;

-- 3. NO USAGE to intelligence_reader or mcp_readonly — see header (CANON-1).
--    Left as an explicit non-grant: PostgreSQL grants no schema USAGE to
--    non-owner / PUBLIC by default, so this is the default-enforced posture made
--    auditable. Granting either role USAGE here would re-open the exact
--    vertical-boundary / worker-identity exposure this schema exists to close.

COMMIT;
