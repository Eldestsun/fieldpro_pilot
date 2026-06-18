-- ============================================================
-- ROLLBACK — CANON-NORM-2 hazard/infra norm_severity backfill
-- 2026-06-17 — feat/canon-norm-2-hazard-infra-severity-carry — CANON-NORM-2
--
-- Reverts the forward migration by setting norm_severity back to NULL on the
-- presence observations whose value was carried from the adapter severity tables.
-- It targets exactly the forward migration's row set (presence rows whose visit
-- has a non-null adapter severity and a matching presence type), so it does not
-- touch measurement/condition/action norm_severity set by other migrations.
--
-- CAVEAT: this also clears norm_severity on any NEW presence row the write path
-- populated after the forward migration ran (write-side and backfill produce the
-- same value). That is acceptable for a local dev rollback — the receiver
-- (CANON-NORM-1 severity_map) remains, so a subsequent re-run of the backfill or
-- the next write restores the value.
--
-- Apply as the postgres superuser (RLS bypass) — same reason as the forward file.
-- ============================================================

BEGIN;

UPDATE core.observations o
   SET norm_severity = NULL
  FROM (
        SELECT visit_id FROM public.hazards WHERE severity IS NOT NULL
        UNION
        SELECT visit_id FROM public.infrastructure_issues WHERE severity IS NOT NULL
       ) v
 WHERE o.visit_id = v.visit_id
   AND o.obs_kind = 'presence'
   AND o.norm_severity IS NOT NULL
   AND o.observation_type IN (
         'encampment_present',
         'fire_present',
         'dangerous_activity_present',
         'drug_use_present',
         'violence_present',
         'biohazard_present',
         'access_blocked',
         'other_safety_concern_present',
         'glass_damage_present',
         'graffiti_present',
         'receptacle_damage_present',
         'shelter_panel_damage_present',
         'lighting_failure_present',
         'access_obstructed_by_landscape',
         'structural_damage_present',
         'other_infrastructure_issue_present',
         'infrastructure_issue_present'
       );

COMMIT;
