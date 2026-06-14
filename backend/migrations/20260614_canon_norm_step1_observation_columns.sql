-- ============================================================
-- Canonical State Layer — normalized observation shape, STEP 1: columns
-- 2026-06-14 — feat/issue-031-canon-norm-step1-columns — ISSUE-031 / CANON-NORM
--
-- Adds the five normalized columns to core.observations per
-- CANONICAL_STATE_LAYER_DESIGN.md §3.3. These are the columns intelligence and
-- dashboards will read INSTEAD of the raw `payload` jsonb / `observation_type`
-- text (design §4.3, §8). Today the risk job string-matches `observation_type`
-- and synthesizes severity=1.0; once the normalizer (Step 3) populates these
-- columns and the read seam (Step 4) lands, that synthesis goes away.
--
-- ── IN-PLACE vs SHADOW-COLUMN DECISION: IN-PLACE (resolved) ──────────────────
-- §9 item 4 left the migration shape open (in-place ALTER vs. a shadow table
-- promoted after verification). RESOLVED here: IN-PLACE. The live table holds
-- 18 rows on a dev DB; shadow-column overhead (a parallel table, a promote step,
-- dual-write plumbing) is not warranted at that scale. We ALTER core.observations
-- directly. The columns land NULLABLE and unpopulated — no backfill, no NOT NULL —
-- so existing rows stay valid and nothing reads these columns until later steps.
--
-- ── SCOPE OF THIS STEP (intentionally narrow) ───────────────────────────────
--   * Columns only. No registry migration, no normalizer, no read-seam view,
--     no application-code change.
--   * NO backfill — all 18 existing rows get NULL in every new column. Backfill
--     through the normalizer is Step 6 (§9 item 4 backfill / item 5 complexity).
--   * NO NOT NULL constraints — the normalizer has not run; existing rows must
--     remain valid. NULL is the correct present-but-unwired state.
--   * Raw `observation_type` (text) and `payload` (jsonb) STAY. These columns
--     extend alongside them; the payload is never lost (invariant #8).
--   * Every ADD COLUMN uses IF NOT EXISTS and the CHECK constraints are guarded
--     by existence checks, so the whole migration is idempotent / re-runnable.
--
-- ── LIVE-SCHEMA RECONCILIATION (verified 2026-06-14, postgres superuser) ─────
--   * None of the five columns exist on core.observations yet (confirmed absent).
--   * core.observations.id is `bigint`; core.observation_type_registry PK is
--     `id bigint`. So `type_id bigint REFERENCES ...registry(id)` is type-correct.
--     (The §3.3 illustrative DDL shows uuid PKs; the LIVE schema is bigint — the
--     FK below matches the live shape, per the §9 reconciliation notes.)
--
-- CHECK-constraint note: a CHECK is satisfied when its expression is not FALSE,
-- so `obs_kind IN (...)` PASSES on the NULL rows this migration leaves behind.
-- The constraints below therefore bound the value domain for future writes
-- without rejecting any existing NULL row.
-- ============================================================

BEGIN;

-- 1. obs_kind — the four-kind taxonomy (§1, §3.3). NULL until the normalizer
--    classifies each row. Valid: condition | action | measurement | presence.
ALTER TABLE core.observations
    ADD COLUMN IF NOT EXISTS obs_kind text NULL;

-- 2. norm_status — kind-conditional (§3.3):
--    condition/measurement -> ok | not_ok | unknown ; presence/action -> NULL.
ALTER TABLE core.observations
    ADD COLUMN IF NOT EXISTS norm_status text NULL;

-- 3. norm_severity — 0..N common scale per the registry severity_map.
--    NULL until the normalizer writes it (and NULL where no map applies).
ALTER TABLE core.observations
    ADD COLUMN IF NOT EXISTS norm_severity smallint NULL;

-- 4. intervention — the act performed; populated ONLY for obs_kind='action'
--    (e.g. 'picked_up_litter', 'washed_pad'). NULL on every other kind (§3.3).
ALTER TABLE core.observations
    ADD COLUMN IF NOT EXISTS intervention text NULL;

-- 5. type_id — FK to the registry rule that classified this row (§3.3). NULL
--    until the normalizer resolves the registry row and writes it. bigint to
--    match core.observation_type_registry(id). Inline REFERENCES is created
--    only when the column is first added (IF NOT EXISTS guards the whole add),
--    keeping the migration idempotent.
ALTER TABLE core.observations
    ADD COLUMN IF NOT EXISTS type_id bigint NULL
        REFERENCES core.observation_type_registry(id);

-- Value-domain CHECK constraints (optional per the brief; added for safety).
-- Guarded so re-running the migration does not error on an already-present
-- constraint (ADD CONSTRAINT has no IF NOT EXISTS form).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'core.observations'::regclass
          AND conname  = 'observations_obs_kind_chk'
    ) THEN
        ALTER TABLE core.observations
            ADD CONSTRAINT observations_obs_kind_chk
            CHECK (obs_kind IN ('condition','action','measurement','presence'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'core.observations'::regclass
          AND conname  = 'observations_norm_status_chk'
    ) THEN
        ALTER TABLE core.observations
            ADD CONSTRAINT observations_norm_status_chk
            CHECK (norm_status IN ('ok','not_ok','unknown'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'core.observations'::regclass
          AND conname  = 'observations_norm_severity_chk'
    ) THEN
        ALTER TABLE core.observations
            ADD CONSTRAINT observations_norm_severity_chk
            CHECK (norm_severity >= 0);
    END IF;
END $$;

COMMIT;
