-- ============================================================
-- Canonical State Layer — normalized observation shape, STEP 4:
--   create core.v_observation_normalized — the §4.3 read seam
-- 2026-06-14 — feat/issue-031-canon-norm-step4-view — ISSUE-031 / CANON-NORM
--
-- Steps 1–3 added the five normalized columns to core.observations
-- (obs_kind / norm_status / norm_severity / intervention / type_id), extended
-- the registry to the §4.1 contract, and wired the write-time normalizer that
-- populates the normalized columns on new observations.
--
-- This step creates the READ SEAM described in §4.3: the single view that
-- intelligence and dashboards read for asserted facts. Per §4.3 it is a
-- passthrough today (normalization happens at write), but it is the one place
-- the projection lives — if normalization logic ever needs to change, it
-- changes here, once, for every industry and every signal. No consumer reads
-- core.observations.payload; they read this view's two-axis surface
-- (obs_kind + norm_status), existence-of-row (presence), or intervention.
--
-- ── COLUMN SET (matches §4.3 spec exactly) ──────────────────────────────────────
-- id, org_id, visit_id, asset_id, type_id, observed_at,
-- obs_kind, norm_status, norm_severity, intervention.
-- The view is a straight projection of core.observations — no registry join.
-- The §4.3 spec is intentionally narrower than the QAB exploratory template:
-- it exposes only the normalized two-axis surface plus the keys needed to join
-- to anchors (visit_id, asset_id, type_id). Raw observation_type, payload, and
-- registry rule columns are deliberately NOT projected — consumers read the
-- normalized axes, never the raw key or payload.
--
-- ── EXISTING ROWS ───────────────────────────────────────────────────────────────
-- The 18 pre-Step-3 rows are still NULL on the normalized columns; the backfill
-- is Step 6. Those rows therefore show NULL obs_kind / norm_status / etc. through
-- this view until backfill runs. That is correct and expected — additive
-- discipline, no manufactured state.
--
-- ── RLS NOTE ────────────────────────────────────────────────────────────────────
-- core.observations is FORCE ROW LEVEL SECURITY. A view is not itself an RLS
-- object: queries through it run under the QUERYING role's RLS context, so the
-- base-table org-isolation policy still applies to every consumer. Creating the
-- view as the postgres superuser (repo migration convention) does not bypass RLS
-- for later app-role reads. The view holds no data and copies no grants.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────────
-- CREATE OR REPLACE VIEW — re-running re-asserts the same definition.
-- ============================================================

BEGIN;

CREATE OR REPLACE VIEW core.v_observation_normalized AS
SELECT
  id,
  org_id,
  visit_id,
  asset_id,
  type_id,
  observed_at,
  obs_kind,
  norm_status,
  norm_severity,
  intervention
FROM core.observations;

COMMIT;
