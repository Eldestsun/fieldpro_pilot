-- ============================================================
-- ISSUE-053: add org_id → organizations(id) FKs to the public.* org-scoped
-- tables that carry org_id + forced RLS but no referential integrity.
-- 2026-07-01 (amended same day: Stage-3 drop-listed tables excluded)
--
-- WHY THIS EXISTS
-- The core.* layer is fully FK'd to organizations(id) (ON DELETE RESTRICT);
-- the public.* adapter/intelligence layer was not — a row could carry an
-- org_id pointing at no existing organization. RLS scopes the VALUE either
-- way (this is integrity, not isolation), but "every tenant-scoped row
-- provably belongs to a real tenant" needs the FK.
--
-- SET: the 14 tables named on the ISSUE-052/053 recon
-- (docs/audit/2026-06-27-multi-tenant-readiness-recon.md §C), minus:
--   * export_delete_tokens — excluded BY THE ISSUE-052 DECISION: its org_id
--     intentionally holds the Azure tenant UUID, not organizations.id
--     (see 20260701_issue052_document_export_delete_tokens_org_id.sql).
--   * Excluded clean_logs, hazards, infrastructure_issues, stop_photos:
--     Stage-3 permanent-drop (ISSUE-031 clip sequence; Stage-3 card "physically
--     DROP the 5 frozen adapter tables", changelog 2026-06-20-issue-037) — no
--     FK on a table scheduled for physical DROP; empty + frozen, guards no
--     writes, and an FK would only add a drop-ordering dependency. (The fifth
--     frozen table, trash_volume_logs, is already dropped — 20260620_issue037.)
-- public.audit_log also lacks an org FK but is outside the card's named set
-- and is deliberately NOT folded in here (reported as residual on the card).
-- → 9 surviving tables receive the FK.
--
-- CONVENTION: matches the core convention exactly —
--   <table>_org_id_fkey FOREIGN KEY (org_id)
--   REFERENCES public.organizations(id) ON DELETE RESTRICT
-- (per 00000000_consolidated_schema.sql:3256ff and
-- 20260530_sidecar_extraction_a_additive.sql).
--
-- Orphan gate: all target tables verified orphan-free before authoring (live
-- dev, BYPASSRLS census, 0 orphans / all empty). ADD CONSTRAINT itself
-- re-validates on every environment — orphans fail the migration loudly,
-- never silently.
-- Idempotent: each ADD is guarded on pg_constraint (PG14 has no
-- ADD CONSTRAINT IF NOT EXISTS). No RLS policy, grant, role, or identity
-- object is touched.
-- NOTE: environments that ran the pre-trim version of this file (live dev,
-- 2026-07-01) carry FKs on the 4 Stage-3 tables; the paired
-- 20260701_issue053b_drop_stage3_org_fks.sql removes them (no-op elsewhere).
-- ============================================================

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'asset_external_ids',
    'lead_route_overrides',
    'route_run_stops',
    'stop_condition_history',
    'stop_effort_history',
    'stop_pool_memberships',
    'stop_risk_snapshot',
    'stops_legacy',
    'transit_stop_assets'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'ISSUE-053: expected table public.% is missing — set drifted, review before constraining', t;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = ('public.' || t)::regclass
        AND conname  = t || '_org_id_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE RESTRICT',
        t, t || '_org_id_fkey'
      );
    END IF;
  END LOOP;
END $$;

-- Assert all 9 surviving FKs exist and point at organizations(id).
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY[
    'asset_external_ids','lead_route_overrides','route_run_stops',
    'stop_condition_history','stop_effort_history','stop_pool_memberships',
    'stop_risk_snapshot','stops_legacy','transit_stop_assets'
  ]) AS u(t)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = ('public.' || t)::regclass
      AND conname  = t || '_org_id_fkey'
      AND contype  = 'f'
      AND confrelid = 'public.organizations'::regclass
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'ISSUE-053: org FK missing after apply on: %', missing;
  END IF;
END $$;

COMMIT;
