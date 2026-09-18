-- ============================================================================
-- ISSUE-073 — extend core.visit_notes categories with 'access'.
--
-- WHY: the unable-to-access flow (A1: core outcome 'unable_to_access' with
-- adapter-vocabulary reason_code) carries an optional free-text note. Per the
-- ratified §3.6 grain, that note lands once at (visit_id, category) — the new
-- category is 'access'. §3.6 anticipated this: "Extending the set later is a
-- one-line ALTER migration."
--
-- The outcome itself needs NO schema change: core.visits.outcome/reason_code
-- are unconstrained text (the §3.2 DDL lists unable_to_access in the outcome
-- vocabulary; this migration activates only the notes category).
--
-- IDEMPOTENT: constraint dropped-if-exists and re-created with the widened set;
-- re-run converges to the same state.
-- ============================================================================
BEGIN;

ALTER TABLE core.visit_notes DROP CONSTRAINT IF EXISTS visit_notes_category_check;
ALTER TABLE core.visit_notes
  ADD CONSTRAINT visit_notes_category_check
  CHECK (category IN ('safety', 'infra', 'access'));

COMMIT;
