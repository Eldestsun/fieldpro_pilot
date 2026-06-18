-- ============================================================
-- ROLLBACK — CANON-NORM-3 grant SELECT on the read seam
-- 2026-06-17 — feat/canon-norm-2-hazard-infra-severity-carry — CANON-NORM-3
--
-- Reverts the forward migration by revoking the SELECT grants it added on
-- core.v_observation_normalized. Restores the Step-4 state (only postgres +
-- mcp_readonly hold SELECT). Note: this will break rebuildStopRiskSnapshot if
-- the app still connects as fieldpro, so only roll back together with reverting
-- the CANON-NORM-3 reader repoint in riskMapService.ts.
--
-- Apply as the postgres superuser (object owner).
-- ============================================================

BEGIN;

REVOKE SELECT ON core.v_observation_normalized FROM fieldpro;
REVOKE SELECT ON core.v_observation_normalized FROM intelligence_reader;

COMMIT;
