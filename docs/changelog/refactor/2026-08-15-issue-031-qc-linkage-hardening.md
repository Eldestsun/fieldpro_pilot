# 2026-08-15 — ISSUE-031/Q-C: run↔visit linkage hardening (index + write validation + regression tests)

## What changed
- New migration `20260815_qc_assignments_source_linkage_index.sql` (applied via the
  runner, recorded in `schema_migrations`, idempotent, dup-precheck aborts loudly):
  UNIQUE index `idx_core_assignments_source_linkage` on
  `core.assignments (source_system, source_ref, COALESCE(location_id, -1))`.
  One index, two jobs: (a) the canonical-spine joins that filter on
  `(source_system, source_ref)` (loadRouteRunById lateral, visitService,
  cleanLogsCanonicalQuery, Control Center) get a prefix index — the table
  previously had only `(id)` and `(org_id, status)`; (b) linkage uniqueness is
  enforced at its true grain (one assignment per run×location). NULLs are
  DISTINCT under the index (PG14 default) — deliberately: a first-cut
  `COALESCE(location_id, -1)` key collapsed every NULL-location stop of a run
  onto one value, so a run with 2+ spine-unresolved stops lost assignments to
  `ON CONFLICT` and the write-time validation 500'd. **CI caught it** (the
  sparse-seed ad-hoc test: `SEAMD_ADHOC_A/B` carry no `location_external_ids`
  rows; dev's fully-populated spine masked it locally). Reverted to a plain
  column key; NULL-location rows are not dedup-protected (acceptable — NULL
  location is already a warned spine gap; PG15 `NULLS NOT DISTINCT` is the
  clean upgrade, ISSUE-029). A dedicated regression test pins the
  no-collapse semantics.
- `routeRunService.createRouteRun`: write-time linkage validation — throws (full
  rollback) if the assignment INSERT resolves fewer rows than the run has stops;
  warns (never silently) when a stop resolves but its location spine does not
  (NULL `location_id`, §5.1-adjacent).
- New canonical tests (`qcAssignmentLinkage.test.ts`, 5 tests, registered in
  `run.ts`): index present+UNIQUE+prefix-covering+no-COALESCE; NULL-location
  no-collapse regression (2 NULL-loc rows same run both insert; real-loc dup
  conflicts to zero); double-fire inserts zero (idempotency); no dangling and
  no cross-org `source_ref` resolution; **no FK from `core.assignments` into
  `route_runs`** (the string-translation rule made a structural assertion).

## Why
- Board card ISSUE-031/Q-C; migration-sequence Phase 3 Step 3.1.
- The `ON CONFLICT DO NOTHING` on the assignment INSERT had been **inert since
  Tier 5** — no unique constraint existed on the linkage, so nothing could
  conflict and a double-fire could silently duplicate assignment intent. The
  index makes it a real idempotency guarantee.
- **Spec delta, surfaced not masked** (per Step 3.1's own pre-condition rule):
  the artifact's "resolves 1:1" wording does not hold at run grain — the code
  deliberately writes one assignment PER STOP (1:N run→assignments, one per
  run×location). The implemented invariant is 1:1 at the run×location grain,
  which is what the write path's shape has always implied.

## Verification
- Runner applied + recorded on dev (`schema_migrations` row confirmed); re-run
  skips (idempotent). Live dup-precheck passed (table currently empty). After
  the CI-caught COALESCE revert, dev's index was hand-aligned to the edited
  (already-recorded, unmerged) migration in one step — file and DB consistent,
  no ledger drift (ISSUE-038 discipline; PR unmerged so no other environment
  had applied the old form).
- Backend canonical suite: **187 passed / 0 failed** (182 prior + 5 new Q-C).
- Clean-room gate note: a full empty-DB rebuild is not executable on the local
  dev cluster — it has **no superuser role at all** (initdb superuser `fieldpro`
  was permanently downgraded by the ISSUE-041 bootstrap; no `postgres` role), so
  the consolidated baseline's pgcrypto step cannot be satisfied for a fresh DB
  locally. The migration itself needs no elevated privilege; CI's fresh-Postgres
  `test-backend` job is the executing clean-room gate. The no-superuser fact is
  flagged to the founder (touches ISSUE-042's premise).

## Files touched
- backend/migrations/20260815_qc_assignments_source_linkage_index.sql (new)
- backend/src/domains/routeRun/routeRunService.ts
- backend/tests/canonical/qcAssignmentLinkage.test.ts (new)
- backend/tests/run.ts
- docs/changelog/refactor/2026-08-15-issue-031-qc-linkage-hardening.md (this file)
