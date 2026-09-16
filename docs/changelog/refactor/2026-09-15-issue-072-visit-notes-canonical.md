# 2026-09-15 — ISSUE-072: canonical home for field free-text notes (core.visit_notes)

## What changed
- **New table `core.visit_notes(visit_id, org_id, category, note, recorded_at)`**
  (migration `20260915_issue072_visit_notes.sql`). Composite PK `(visit_id,
  category)` enforces the true grain — one note per category per visit. FORCE
  ROW LEVEL SECURITY + `org_isolation` policy (matches `core.visit_actor_audit`
  house style). `category` CHECK ∈ {`safety`,`infra`} (current capture-surface
  vocabulary).
- **Write path repointed** (`observationService.ts`): the Report Safety
  (`hazard_notes`) and Report Infrastructure free-text notes no longer land in
  each observation's `payload`. `emitObservationsForStop` now also writes one
  `core.visit_notes` row per category via `insertVisitNotes`, on the **same
  client** so it commits atomically inside the existing complete/skip transaction
  (ISSUE-051). The infra note — which the capture UI replicates across every
  selected issue — is collapsed to a single row (first non-empty). `ON CONFLICT
  (visit_id, category) DO UPDATE` keeps it idempotent under offline replay.
- **Per-observation `payload.notes` removed** from both the safety and infra
  emit paths. Per-observation structured attributes stay in payload: infra
  `cause`/`component` (per-issue-type), numeric hazard `severity` (normalizer
  input). Only the replicated free text moved.
- **Design doc ratified**: `CANONICAL_STATE_LAYER_DESIGN.md` §3.6 now defines
  visit notes as an operational/audit adjunct to the visit (not a noun, no
  registry type), documents the per-(visit,category) grain, and the no-grant
  intelligence posture.

## Why
- The note was authored once per modal submission but stamped onto every
  observation from that modal — the same string replicated across N presence
  rows, describing none in particular. Meanwhile `core.visits.notes` existed but
  was orphaned (never written) and the design doc ratified no notes treatment.
  This closed the orphaned-column drift and the denormalization before pilot —
  a clean canonical layer at foundation (founder decision, Option B, 2026-09-15).

## Posture / labor safety
- Notes are operational/audit free text, **never an intelligence input**
  (invariant #8). `intelligence_reader`/`audit_reader`/`mcp_readonly` hold **no
  grant** on `core.visit_notes` (verified on both dev and a fresh clean-room
  build); the app role `fieldpro` reads/writes. Free text is the surface most
  likely to carry incidental identifying content, so exclusion from the
  intelligence role is a deliberate labor-safety default.

## Verification
- `tsc --noEmit` clean; full backend suite **217/217** (new
  `visitNotesGrain.test.ts` — grain, no-payload-replication, cause/component
  retained, offline-replay idempotency; `infraIssuesWriteClip.test.ts` updated
  to assert notes moved out of payload into one `visit_notes` row).
- Applied + recorded on dev via the provisioner runner (ISSUE-038 same-step).
- **Clean-room gate** (ephemeral postgres:14 + `db/init` bootstrap → full chain
  as `fieldpro_admin`): exit 0; `core.visit_notes` present with FORCE RLS,
  `fieldpro` DML grant, and **zero** grants to reader roles. Container destroyed.
- `pg_state.sql` regenerated locally (gitignored; not committed).

## Backfill
- **None required.** Verified live (cross-org, as admin): zero observations
  carried `payload.notes`. No populated non-dev environment exists yet
  (SHADOW-ENV not stood up). A `payload.notes → visit_notes` copy for any future
  populated environment is a separate one-time idempotent migration, intentionally
  not bundled so this migration stays schema+grant only.

## Files touched
- `backend/migrations/20260915_issue072_visit_notes.sql` (new)
- `backend/src/domains/observation/observationService.ts`
- `backend/tests/canonical/visitNotesGrain.test.ts` (new)
- `backend/tests/canonical/infraIssuesWriteClip.test.ts` (assertion updated)
- `backend/tests/run.ts`
- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` (§3.6 added)
- `docs/changelog/refactor/2026-09-15-issue-072-visit-notes-canonical.md` (this entry)
- (`pg_state.sql` regenerated locally — gitignored, not committed)
