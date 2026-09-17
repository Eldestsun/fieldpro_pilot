-- ============================================================================
-- ISSUE-065 — normalize skipped-visit reason_code to the canonical 'safety'.
--
-- WHY: the skip-with-hazard handler historically wrote reason_code = the FIRST
-- selected hazard type (e.g. 'encampment'). The canonical design (§8b) defines
-- reason_code='safety' as the ONLY non-service outcome; any consumer that filters
-- skips on outcome='skipped' AND reason_code='safety' (the daily-ops report, etc.)
-- silently missed every real skip. The write path is corrected to 'safety' in the
-- same change (routeRunStopRoutes.ts). The SPECIFIC hazards are not lost — they
-- live as *_present presence observations on each skipped visit (higher resolution
-- than one reason_code slot; §2.1 corollary).
--
-- BACKFILL: re-label any historical skipped visit whose reason_code holds a
-- hazard-type value (i.e. anything that is not already 'safety' and not NULL) to
-- 'safety'. The specific hazard remains recoverable from the visit's presence
-- observations, so no fidelity is lost by collapsing the reason_code slot to the
-- category. Verified live 2026-09-16 (cross-org, as admin): ZERO skipped visits
-- exist, so this is a no-op on the current DB; it is included so any populated
-- staging/prod environment converges to the canonical posture on deploy.
--
-- RLS: core.visits is FORCE ROW LEVEL SECURITY. The runner connects as
-- fieldpro_admin (BYPASSRLS) on the provisioner path, so the UPDATE spans every
-- org — correct, because 'safety' is the semantic non-service category regardless
-- of tenant. SET LOCAL app.current_org_id keeps it effective under a non-bypass
-- fallback runner (all live rows are org 1; matches the seed convention).
--
-- IDEMPOTENT: the WHERE clause matches zero rows on re-run (nothing left to change).
-- ============================================================================
BEGIN;
SET LOCAL app.current_org_id = '1';

UPDATE core.visits
   SET reason_code = 'safety'
 WHERE outcome = 'skipped'
   AND reason_code IS NOT NULL
   AND reason_code <> 'safety';

COMMIT;
