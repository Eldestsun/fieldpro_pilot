-- ============================================================
-- Canonical State Layer — P1 / CANON-NORM-3: grant SELECT on the read seam
-- 2026-06-17 — feat/canon-norm-2-hazard-infra-severity-carry — CANON-NORM-3
--
-- CANON-NORM-3 makes riskMapService the FIRST real reader of the §4.3 read seam
-- core.v_observation_normalized (created in Step 4 with no grants — "the view
-- holds no data and copies no grants" — because nothing read it yet). The
-- intelligence repoint reads norm_severity through this view, so the reading
-- roles need SELECT on it.
--
-- ── WHO READS IT ────────────────────────────────────────────────────────────
--   * fieldpro            — the role the application connects as today, which runs
--                           rebuildStopRiskSnapshot (ISSUE-018: the app has not yet
--                           been repointed to intelligence_reader).
--   * intelligence_reader — the labor-safety read role this work targets once
--                           ISSUE-018 wires the app connection to it. Granting now
--                           means the seam is ready and the repoint needs no further
--                           permission change when the app switches roles.
--
-- Both roles already hold SELECT on the base table core.observations and on
-- core.observation_type_registry (the haz CTE joins type_id -> registry to resolve
-- the safety presence types). The view is the only missing grant.
--
-- ── IDENTITY-SAFE ───────────────────────────────────────────────────────────
-- The seam projects only the normalized axes + join keys (id, org_id, visit_id,
-- asset_id, type_id, observed_at, obs_kind, norm_status, norm_severity,
-- intervention). It carries NO worker-identity column — granting it to
-- intelligence_reader does not widen the identity surface. The actor-audit
-- sidecars remain no-grant for intelligence_reader (unchanged).
--
-- ── RLS UNAFFECTED ──────────────────────────────────────────────────────────
-- A view is not itself an RLS object; reads through it still run under the
-- querying role's org-isolation policy on core.observations. This GRANT only
-- removes the object-level permission denial, not the row-level filter.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
-- GRANT is idempotent — re-running re-asserts the same privilege.
--
-- Apply as the postgres superuser (object owner), same as Step 4.
-- ============================================================

BEGIN;

GRANT SELECT ON core.v_observation_normalized TO fieldpro;
GRANT SELECT ON core.v_observation_normalized TO intelligence_reader;

COMMIT;
