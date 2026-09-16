-- ============================================================================
-- ISSUE-072 — canonical home for field free-text notes: core.visit_notes.
--
-- WHY: the Report Safety and Report Infrastructure modals each carry ONE
-- free-text note box. The note was authored once per submission but stamped
-- (denormalized) onto every observation.payload from that modal — the same
-- string replicated across N presence rows, describing the situation, not any
-- single presence type. Meanwhile core.visits.notes existed but was ORPHANED
-- (no write path ever populated it), and the design doc ratified no notes
-- treatment at all. Option B (founder-approved 2026-09-15): give notes a
-- canonical home at their true grain — one note per (visit, category) — and
-- stop the per-observation replication (write-path change ships with this).
--
-- GRAIN: a visit can carry a safety note AND an infra note independently, so a
-- single core.visits.notes column would collide. This child keys by
-- (visit_id, category) — one note per category per visit, no collision, no
-- replication.
--
-- POSTURE (labor safety): notes are operational/audit free text and are NEVER
-- read by intelligence (design invariant #8 — the same class as payload).
-- Grants therefore mirror the observation posture: the app role (fieldpro)
-- reads/writes; intelligence_reader gets NO grant. This is the default anyway
-- (core default privileges auto-grant only fieldpro; reader roles get nothing),
-- but the GRANT is stated explicitly per ISSUE-039 discipline — grant posture is
-- runner-owned and reproducible on a clean build, not left to implicit defaults.
--
-- RLS: FORCE ROW LEVEL SECURITY + org_isolation (USING + WITH CHECK), matching
-- the core.visit_actor_audit house style. The app writes via withOrgContext, so
-- app.current_org_id is set on every INSERT/SELECT.
--
-- BACKFILL: none required. Verified live 2026-09-15 — zero observations carry
-- payload.notes across all orgs. No populated non-dev environment exists yet
-- (SHADOW-ENV not stood up). If one ever does, its payload.notes → visit_notes
-- copy is a separate one-time idempotent backfill migration; it is intentionally
-- NOT bundled here so this migration stays schema+grant only and idempotent.
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS; policy guarded by existence check;
-- GRANT re-asserts the same state. Safe to re-run.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS core.visit_notes (
    visit_id    bigint      NOT NULL REFERENCES core.visits(id) ON DELETE CASCADE,
    -- organizations lives in public (unqualified, matching core.visit_actor_audit's FK)
    org_id      bigint      NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    -- current vocabulary: the two capture surfaces that carry a free-text box.
    -- Extending the set later is a one-line ALTER migration.
    category    text        NOT NULL CHECK (category IN ('safety', 'infra')),
    note        text        NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    -- one note per category per visit — the true grain; also gives the write
    -- path a natural ON CONFLICT target for offline-replay idempotency.
    PRIMARY KEY (visit_id, category)
);

CREATE INDEX IF NOT EXISTS visit_notes_org_idx ON core.visit_notes (org_id);

ALTER TABLE core.visit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.visit_notes FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polname = 'org_isolation'
      AND polrelid = 'core.visit_notes'::regclass
  ) THEN
    CREATE POLICY org_isolation ON core.visit_notes
      USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::bigint)
      WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::bigint);
  END IF;
END
$$;

-- App role reads/writes. Intelligence_reader is deliberately NOT granted:
-- notes are operational/audit free text, never an intelligence input (§8).
GRANT SELECT, INSERT, UPDATE, DELETE ON core.visit_notes TO fieldpro;

COMMIT;
