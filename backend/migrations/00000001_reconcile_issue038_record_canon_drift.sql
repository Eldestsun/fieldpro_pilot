-- ============================================================
-- ISSUE-038 — Migration-ledger reconciliation: record the 11 hand-applied
--   ISSUE-031 canonical/clip migrations in schema_migrations WITHOUT re-running
--   them, on any DB where their effect is already present.
-- 2026-06-20 — chore/issue-038-migration-ledger-reconcile
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- The 11 ISSUE-031 canon migrations (06-13 / 06-14 / 06-17) were applied
-- out-of-band via `psql` (several needed postgres/superuser for FORCE-RLS DML)
-- and never inserted into public.schema_migrations. On an already-populated DB,
-- `npm run migrate` therefore tries to RE-RUN them and dies on the first one
-- (`CREATE SCHEMA transit` → "schema transit already exists"). The §4a gate of
-- the ISSUE-038 card is satisfied — all 11 were probed EFFECT-PRESENT (card §6) —
-- so recording them as applied records TRUTH, not a claim.
--
-- ── WHY A CONDITIONAL INSERT, AND WHY IT SORTS FIRST (00000001_) ─────────────
-- This file is named to sort immediately AFTER 00000000_consolidated_schema.sql
-- and BEFORE the 20260613_* canon migrations, so on a populated DB it records the
-- 11 (and the runner then SKIPS them) before the runner can collide on them.
-- Each INSERT is GATED on a catalog probe of that migration's own already-applied
-- effect, and is therefore FRESH-SAFE:
--   * Fresh/empty DB: 00000000_consolidated builds the PRE-canon baseline (it has
--     level3_logs and the v_*_transit views, and NO transit schema / canon
--     columns / normalized view). At this point none of the 11 effects exist, so
--     every gate below is FALSE → nothing is recorded → the runner applies all 11
--     for real. The clean path is untouched.
--   * Already-migrated DB: the effects exist → the gates are TRUE → the 11 are
--     recorded → the runner skips them → no re-run, no collision.
--
-- ── WHY RECORD-AND-SKIP, NOT RE-RUN, MATTERS (the corruption guard) ──────────
-- The runner connects as the app role `fieldpro`, which is NOT bypassrls. Re-
-- running 20260613_p1_2_redefine_stop_status_mv_drop_level3logs.sql through the
-- runner would execute `CREATE MATERIALIZED VIEW ... AS SELECT` over FORCE-RLS
-- source tables with no app.current_org_id set → it would materialize ZERO rows,
-- silently replacing the 14,916-row MV with an empty one. Recording that file
-- here (gated on `to_regclass('public.level3_logs') IS NULL`) makes the runner
-- SKIP it, which is the whole point. Idempotency guards alone (IF NOT EXISTS)
-- would stop the *error* but not the *data loss*; the skip is what protects data.
--
-- ── CATALOG-ONLY PROBES (cannot error, cannot trip RLS) ─────────────────────
-- Every gate below reads only the system catalogs (pg_namespace, to_regclass,
-- information_schema.columns, pg_class) — never the DATA of a FORCE-RLS table.
-- So this migration is safe to run as `fieldpro` with no org context: it can
-- neither error on RLS nor be silently zero-rowed in a way that matters.
--
-- ── THE 4 PURE-DATA BACKFILLS ARE DELIBERATELY NOT RECORDED HERE ────────────
-- step3 (registry rules), step6 (obs backfill), canon_norm_2 (severity backfill)
-- and canon_norm_p1 (presence passthrough) have DATA-only effects on FORCE-RLS
-- tables that fieldpro cannot see without org context, so there is no honest
-- catalog probe for them. They are intentionally left for the runner to re-run:
-- each is an idempotent UPDATE that, under fieldpro with no org context, matches
-- ZERO rows and is a harmless no-op (CLAUDE.md § RLS Context Gotcha — silent
-- zero-row, not an error), after which the runner records them. None of the four
-- is a DROP/CREATE, so re-running them changes no data (unlike the MV above).
-- Net: after one `npm run migrate`, all 11 are recorded and the MV is intact.
--
-- applied_at defaults to now() (the reconciliation moment). The original out-of-
-- band apply times were never recorded and are unrecoverable; now() is the honest
-- timestamp for "when this row was reconciled into the ledger."
--
-- Idempotent: ON CONFLICT (filename) DO NOTHING. Safe to run repeatedly.
-- ============================================================

-- (No explicit BEGIN/COMMIT: the migration runner wraps this file in its own
--  transaction and records this filename on success — matching the other files
--  that omit BEGIN/COMMIT, e.g. 20260613_p1_drop_dead_transit_views.sql.)

-- #1 — 20260613_create_transit_schema.sql  (effect: schema `transit` exists)
INSERT INTO public.schema_migrations (filename)
SELECT '20260613_create_transit_schema.sql'
WHERE EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'transit')
ON CONFLICT (filename) DO NOTHING;

-- #2 — 20260613_p1_2_redefine_stop_status_mv_drop_level3logs.sql
--      (effect: public.level3_logs dropped — the distinctive, catalog-visible
--       marker; this is the MV-corruption guard described in the header)
INSERT INTO public.schema_migrations (filename)
SELECT '20260613_p1_2_redefine_stop_status_mv_drop_level3logs.sql'
WHERE to_regclass('public.level3_logs') IS NULL
ON CONFLICT (filename) DO NOTHING;

-- #3 — 20260613_p1_drop_dead_transit_views.sql  (effect: all 4 v_*_transit gone)
INSERT INTO public.schema_migrations (filename)
SELECT '20260613_p1_drop_dead_transit_views.sql'
WHERE to_regclass('core.v_infra_transit')             IS NULL
  AND to_regclass('core.v_level3_logs_transit')       IS NULL
  AND to_regclass('core.v_stop_photos_transit')       IS NULL
  AND to_regclass('core.v_trash_volume_logs_transit') IS NULL
ON CONFLICT (filename) DO NOTHING;

-- #4 — 20260614_canon_norm_step1_observation_columns.sql
--      (effect: normalized columns on core.observations — probe obs_kind)
INSERT INTO public.schema_migrations (filename)
SELECT '20260614_canon_norm_step1_observation_columns.sql'
WHERE EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'core' AND table_name = 'observations'
       AND column_name = 'obs_kind'
)
ON CONFLICT (filename) DO NOTHING;

-- #5 — 20260614_canon_norm_step2_registry_contract.sql
--      (effect: contract columns on core.observation_type_registry — probe obs_kind)
INSERT INTO public.schema_migrations (filename)
SELECT '20260614_canon_norm_step2_registry_contract.sql'
WHERE EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'core' AND table_name = 'observation_type_registry'
       AND column_name = 'obs_kind'
)
ON CONFLICT (filename) DO NOTHING;

-- #7 — 20260614_canon_norm_step4_normalized_view.sql
--      (effect: core.v_observation_normalized read seam exists)
INSERT INTO public.schema_migrations (filename)
SELECT '20260614_canon_norm_step4_normalized_view.sql'
WHERE to_regclass('core.v_observation_normalized') IS NOT NULL
ON CONFLICT (filename) DO NOTHING;

-- #10 — 20260617_canon_norm_3_grant_normalized_view_select.sql
--       (effect: intelligence_reader holds SELECT on the normalized view; probed
--        via pg_class so a missing view yields no row rather than an error)
INSERT INTO public.schema_migrations (filename)
SELECT '20260617_canon_norm_3_grant_normalized_view_select.sql'
WHERE EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'core' AND c.relname = 'v_observation_normalized'
       AND has_table_privilege('intelligence_reader', c.oid, 'SELECT')
)
ON CONFLICT (filename) DO NOTHING;

-- NOTE — these 4 are intentionally omitted (no catalog probe; harmless re-run as
-- a 0-row UPDATE under fieldpro, then recorded by the runner). See header:
--   #6  20260614_canon_norm_step3_registry_rules.sql
--   #8  20260614_canon_norm_step6_backfill_observations.sql
--   #9  20260617_canon_norm_2_backfill_hazard_infra_severity.sql
--   #11 20260617_canon_norm_p1_presence_severity_passthrough.sql
