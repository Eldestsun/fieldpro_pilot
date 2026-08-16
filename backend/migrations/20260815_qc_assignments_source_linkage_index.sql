-- ============================================================
-- Q-C — Run↔visit linkage hardening: source-linkage unique index (ISSUE-031/Q-C)
-- 2026-08-15 — P1-State Migration / migration-sequence Phase 3, Step 3.1
--
-- WHAT THIS ADDS
--   One UNIQUE btree index on core.assignments:
--     (source_system, source_ref, COALESCE(location_id, -1))
--
--   It does two jobs at once:
--   1. JOIN PERFORMANCE — every canonical-spine join filters on
--      (source_system, source_ref) (loadRouteRunById lateral, visitService,
--      cleanLogsCanonicalQuery, Control Center rollups). Until now the table
--      had only (id) and (org_id, status) indexes, so each of those joins
--      scanned. A btree on (a, b, expr) serves (a, b) prefix lookups.
--   2. LINKAGE INTEGRITY AT THE TRUE GRAIN — one assignment per
--      (source system, source ref, location). The linkage is deliberately
--      1:N run→assignments (one assignment PER STOP of the run — see the
--      createRouteRun INSERT...SELECT over route_run_stops); the unique unit
--      is the run×location pair. NOTE: the migration-sequence artifact's
--      Step 3.1 wording says "resolves 1:1" — that premise is 1:1 at THIS
--      grain, not run-grain; surfaced (not masked) per the artifact's own
--      pre-condition rule. See the Q-C changelog entry.
--
--   The COALESCE(location_id, -1) leg exists because location_id is nullable
--   (the create path LEFT JOINs the location spine) and this cluster runs
--   PG14, which lacks UNIQUE NULLS NOT DISTINCT (PG15+, ISSUE-029). Without
--   it, duplicate NULL-location assignments would slip the uniqueness net.
--   -1 is impossible as a real core.locations id (bigserial ≥ 1).
--
-- WHY THIS MAKES ON CONFLICT REAL
--   createRouteRun's assignment INSERT has carried `ON CONFLICT DO NOTHING`
--   since Tier 5 — but with no unique constraint on the linkage, that clause
--   was INERT: nothing could conflict, and a double-fire could silently
--   duplicate assignment intent. With this index the clause becomes a real
--   idempotency guarantee (targetless ON CONFLICT arbitrates against any
--   unique index, expression indexes included).
--
-- DELIBERATELY NOT A FOREIGN KEY
--   source_ref stays a string translation (assignments.source_system =
--   'route_runs' + source_ref = run id). Canonical must never FK into a
--   vertical adapter table (Phase 3 scope note; ADAPTER_BOUNDARY). The
--   companion canonical test asserts no such FK exists.
--
-- PRE-CHECK: if any environment already holds duplicates at this grain, the
-- DO block below names them and aborts — a visible failure, never a silent
-- half-index (Migration Recording Discipline / surfaces-never-concludes).
--
-- IDEMPOTENT: IF NOT EXISTS; safe to re-run; lexical sort places it last.
-- ROLLBACK: DROP INDEX core.idx_core_assignments_source_linkage; (reversible,
-- no data change).
-- ============================================================

BEGIN;

DO $$
DECLARE dup_report text;
BEGIN
  SELECT string_agg(format('(%s, %s, loc=%s) ×%s', source_system, source_ref,
                           COALESCE(location_id::text, 'NULL'), n), '; ')
  INTO dup_report
  FROM (
    SELECT source_system, source_ref, location_id, COUNT(*) AS n
    FROM core.assignments
    WHERE source_system IS NOT NULL
    GROUP BY source_system, source_ref, location_id
    HAVING COUNT(*) > 1
    LIMIT 20
  ) d;

  IF dup_report IS NOT NULL THEN
    RAISE EXCEPTION 'Q-C: duplicate assignments at (source_system, source_ref, location) grain — resolve before indexing: %', dup_report;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_assignments_source_linkage
  ON core.assignments (source_system, source_ref, (COALESCE(location_id, -1)));

COMMENT ON INDEX core.idx_core_assignments_source_linkage IS
  'Q-C (ISSUE-031): canonical↔vertical linkage. Unique per (source_system, source_ref, location) — one assignment per run×stop; run→assignments is deliberately 1:N. Prefix serves (source_system, source_ref) spine joins. COALESCE leg = PG14 NULL-distinct workaround (ISSUE-029). Never replace with an FK into a vertical table.';

COMMIT;
