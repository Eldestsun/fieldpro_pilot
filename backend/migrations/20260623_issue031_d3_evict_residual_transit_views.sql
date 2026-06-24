-- ============================================================
-- D3 — Evict the two residual identity-named transit views (ISSUE-031/D3)
-- 2026-06-23 — P1-State Migration / closes the ISSUE-031 view-eviction tail
--
-- WHAT THIS DROPS
--   core.v_clean_logs_transit   (projects public.clean_logs.user_id)
--   core.v_hazards_transit      (projects public.hazards.reported_by)
--
-- WHY NOW (D3 was gated on the P1 Control Center repoint, which is DONE)
-- These two views survived `20260613_p1_drop_dead_transit_views` (which dropped the
-- other four dead core.v_*_transit views) ONLY because the Control Center handlers in
-- adminRoutes.ts still read them. The P1 in-place CC repoint (ISSUE-031/CC-REPOINT,
-- merged) moved /overview and /difficulty off these views onto core.observations /
-- core.visits. With that landed, the views have ZERO readers and can be evicted — the
-- final structural step of the ISSUE-031 work-attribution migration.
--
-- VERIFIED BEFORE WRITING (2026-06-23, dev fieldpro_db + repo grep):
--   • Code readers: 0 in backend/src + frontend/src (whole-repo grep, excl. migrations).
--   • DB dependents: 0 — no view / MV / rule depends on either (pg_depend/pg_rewrite scan).
--     So a plain DROP VIEW (RESTRICT, the default) is safe; no CASCADE.
--
-- LABOR-SAFETY RATIONALE (not just dead-code cleanup)
-- These are a LATENT IDENTITY EXPOSURE: each projects a worker column (user_id /
-- reported_by) and carries a standing SELECT grant to a read role (intelligence_reader
-- holds SELECT on both in a clean build; mcp_readonly was already excluded by ISSUE-039).
-- They leak no real identity TODAY only because the base columns are neutralized to
-- constant-0 — a data coincidence, not a structural guarantee. Dropping the views removes
-- both the columns and the standing grants in one step, so the exposure cannot reopen if
-- those base columns ever repopulate. (See the D3 card's labor-safety note.)
--
-- IDEMPOTENT: DROP VIEW IF EXISTS — safe to re-run, and a no-op on any environment where
-- the views are already gone. On a fresh clean build, 00000000_consolidated CREATEs these
-- two views and this migration (sorting last) drops them; the end-state has neither.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS core.v_clean_logs_transit;
DROP VIEW IF EXISTS core.v_hazards_transit;

-- Assert the eviction: both views (and therefore every grant on them) are gone.
DO $$
DECLARE survived text;
BEGIN
  SELECT string_agg(obj, ', ') INTO survived
  FROM (VALUES ('core.v_clean_logs_transit'), ('core.v_hazards_transit')) AS t(obj)
  WHERE to_regclass(obj) IS NOT NULL;

  IF survived IS NOT NULL THEN
    RAISE EXCEPTION 'ISSUE-031/D3: residual transit view(s) still present after eviction: %', survived;
  END IF;
END $$;

COMMIT;
