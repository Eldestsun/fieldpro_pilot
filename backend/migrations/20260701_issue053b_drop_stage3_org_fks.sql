-- ============================================================
-- ISSUE-053 amendment: remove org FKs from the 4 Stage-3 drop-listed tables
-- 2026-07-01
--
-- WHY THIS EXISTS
-- The pre-trim version of 20260701_issue053_org_fk_public_tables.sql was
-- applied to live dev on 2026-07-01 and added org_id FKs to 13 tables — four
-- of which are on the Stage-3 permanent-drop list (ISSUE-031 clip sequence;
-- Stage-3 card: "physically DROP the 5 frozen adapter tables"): clean_logs,
-- hazards, infrastructure_issues, stop_photos. These tables are empty and
-- FROZEN (written by nothing since the 2026-06-18 Stage-2 write clips), so an
-- FK guards no writes and only adds a drop-ordering dependency for the
-- upcoming physical DROP. The 053 file was trimmed to the 9 survivors BEFORE
-- it was ever committed; this paired migration reconciles the one environment
-- that ran the pre-trim version (live dev — 053 is recorded there, so editing
-- that file cannot re-run it).
--
-- On a fresh build the trimmed 053 never creates these FKs and every DROP
-- below is a no-op. Either path ends in the same state: org FKs on the 9
-- surviving tables only.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS. No RLS policy, grant, role, or
-- identity object is touched. Table DDL itself is NOT touched — the physical
-- DROPs remain ISSUE-037/Stage-3's job, gated on ISSUE-035/036.
-- ============================================================

BEGIN;

ALTER TABLE public.clean_logs            DROP CONSTRAINT IF EXISTS clean_logs_org_id_fkey;
ALTER TABLE public.hazards               DROP CONSTRAINT IF EXISTS hazards_org_id_fkey;
ALTER TABLE public.infrastructure_issues DROP CONSTRAINT IF EXISTS infrastructure_issues_org_id_fkey;
ALTER TABLE public.stop_photos           DROP CONSTRAINT IF EXISTS stop_photos_org_id_fkey;

-- Assert the end state: no org FK on any Stage-3 drop-listed table.
DO $$
DECLARE leaked text;
BEGIN
  SELECT string_agg(t, ', ') INTO leaked
  FROM unnest(ARRAY['clean_logs','hazards','infrastructure_issues','stop_photos']) AS u(t)
  WHERE to_regclass('public.' || t) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = ('public.' || t)::regclass
        AND conname  = t || '_org_id_fkey'
    );

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'ISSUE-053b: Stage-3 drop-listed table still carries an org FK: %', leaked;
  END IF;
END $$;

COMMIT;
