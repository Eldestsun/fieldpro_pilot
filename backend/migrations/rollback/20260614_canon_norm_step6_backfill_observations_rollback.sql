-- ============================================================
-- ROLLBACK — Canonical State Layer STEP 6 backfill of core.observations
-- 2026-06-14 — feat/issue-031-canon-norm-step6-backfill — ISSUE-031 / CANON-NORM
--
-- Reverts the normalized columns on the rows the Step 6 backfill populated, returning
-- them to the pre-backfill NULL state. Scoped to rows that resolve to a registry row
-- (the same JOIN the forward migration used) so it only un-sets what Step 6 set.
--
-- NOTE: this does NOT distinguish backfilled history from rows written by the
-- write-time normalizer (Step 3) after the backfill ran — both carry the same
-- normalized values. Run this only to undo the backfill on a DB where no NEW
-- normalized writes have occurred since, or accept that genuinely-normalized rows
-- will also be cleared and must be re-normalized by re-running the Step 6 forward
-- migration. The forward migration is idempotent, so re-running it restores state.
--
-- RLS: apply as the postgres superuser (bypassrls); core.observations is FORCE RLS.
-- ============================================================

BEGIN;

UPDATE core.observations o
   SET type_id       = NULL,
       obs_kind      = NULL,
       norm_status   = NULL,
       norm_severity = NULL,
       intervention  = NULL
  FROM core.observation_type_registry r
 WHERE r.observation_key = o.observation_type;

COMMIT;
