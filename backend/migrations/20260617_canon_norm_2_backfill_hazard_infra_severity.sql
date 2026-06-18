-- ============================================================
-- Canonical State Layer — P1 / CANON-NORM-2: backfill hazard/infra norm_severity
-- 2026-06-17 — feat/canon-norm-2-hazard-infra-severity-carry — CANON-NORM-2
--
-- CANON-NORM-1 opened the receiver (severity_map={"field":"severity"} on every
-- presence registry row) and CANON-NORM-2's write-side now threads the worker's
-- severity into payload.severity so NEW presence observations carry norm_severity.
-- This migration brings HISTORY into that shape: existing presence observations
-- predate the threading and have norm_severity = NULL even though the worker's
-- severity is recorded in the adapter tables (public.hazards.severity /
-- public.infrastructure_issues.severity). It carries that adapter severity onto
-- the matching canonical observation rows.
--
-- ── MECHANICAL CARRY, NOT AUTHORING (phase guard) ───────────────────────────
-- norm_severity <- the value the adapter already stores. NO scale is invented,
-- NO per-type number is assigned. public.hazards.severity is already the numeric
-- output of the adapter's toNumericSeverity scale (low/medium/high -> 1/2/3); we
-- copy it verbatim. The same scale now feeds the write path (observationService
-- imports toNumericSeverity), so backfill and write-side agree exactly.
--
-- ── GRAIN: severity is PER-VISIT on the hazard side ─────────────────────────
-- The safety flow captures ONE severity for the whole submission and the write
-- path applies it to every hazard presence row of that visit (observationService
-- submitObservations). So joining presence observations to public.hazards on
-- visit_id is the correct grain: all hazard presence rows of a visit share the
-- one severity. The subquery aggregates to one severity per visit (MAX) purely as
-- a guard against a visit ever carrying more than one hazard adapter row; on real
-- data each visit has exactly one.
--
-- ── HAZARD vs INFRA DISCRIMINATION (explicit type list, by necessity) ───────
-- A visit can carry both a hazard adapter row and infra presence observations.
-- The registry does NOT encode hazard-vs-infra (both are obs_kind='presence'), so
-- the distinction cannot be derived — it must be enumerated. The hazard presence
-- type list below is the SAME list cleanLogService uses to compute
-- stop_effort_history.had_hazard (an established codebase precedent), kept in sync
-- with observationService.mapSafetyHazard. This prevents a hazard severity from
-- leaking onto an infra-origin presence row in a mixed visit.
--
-- ── INFRA: structurally NULL today (carry is a verified no-op) ──────────────
-- public.infrastructure_issues.severity is never written by the capture path
-- (createInfrastructureIssuesForRouteRunStop omits it) — every live row is NULL.
-- The infra UPDATE below is therefore a guaranteed no-op on current data; it is
-- included for symmetry and to correctly carry any infra severity that a future
-- capture surface populates. The `severity IS NOT NULL` guard makes it safe.
--
-- ── NO-MANUFACTURED-STATE NOTE (§4.4 / invariant #5) ────────────────────────
-- Only rows whose adapter severity IS NOT NULL receive a norm_severity; a presence
-- row with no adapter severity stays NULL. No default/synthetic magnitude is
-- written. (On current data every hazard adapter row carries a real worker-provided
-- severity of 3 — zero synthetic default-of-1 rows exist to carry.)
--
-- ── RLS NOTE (apply as superuser / bypassrls) ──────────────────────────────
-- core.observations is FORCE ROW LEVEL SECURITY. An UPDATE under a non-superuser
-- role WITHOUT app.current_org_id set would silently affect ZERO rows (CLAUDE.md
-- § RLS Context Gotcha / PATTERN-001). Apply as the postgres superuser (repo
-- migration convention), which bypasses RLS. The carry is a property of the visit's
-- recorded severity, not the org, so an org-agnostic backfill is correct.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
-- Re-running re-derives the same value from the same adapter rows. The
-- `norm_severity IS NULL` guard means an already-backfilled row is skipped (and a
-- re-run would in any case re-assign the identical value). Safe to re-apply.
-- ============================================================

BEGIN;

-- 1. Hazard severity -> norm_severity on hazard presence observations.
UPDATE core.observations o
   SET norm_severity = hv.severity
  FROM (
        SELECT visit_id, MAX(severity) AS severity
          FROM public.hazards
         WHERE severity IS NOT NULL
         GROUP BY visit_id
       ) hv
 WHERE o.visit_id = hv.visit_id
   AND o.obs_kind = 'presence'
   AND o.norm_severity IS NULL
   AND o.observation_type IN (
         'encampment_present',
         'fire_present',
         'dangerous_activity_present',
         'drug_use_present',
         'violence_present',
         'biohazard_present',
         'access_blocked',
         'other_safety_concern_present'
       );

-- 2. Infra severity -> norm_severity on infra presence observations.
--    No-op on current data (all infra severity is NULL); present for symmetry.
UPDATE core.observations o
   SET norm_severity = iiv.severity
  FROM (
        SELECT visit_id, MAX(severity) AS severity
          FROM public.infrastructure_issues
         WHERE severity IS NOT NULL
         GROUP BY visit_id
       ) iiv
 WHERE o.visit_id = iiv.visit_id
   AND o.obs_kind = 'presence'
   AND o.norm_severity IS NULL
   AND o.observation_type IN (
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
