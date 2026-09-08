# 2026-09-07 — ISSUE-051: canonical-completeness reconciliation + atomic skip-path observation emission

## Reconciliation finding
ISSUE-051 was filed 2026-06-24 with three canonical-completeness gaps. Verified
against live code today: four of the five underlying §5 items had already been
closed by later work; **one genuine defect remained** and is fixed here.

| Gap | Status found | Closed by |
|-----|--------------|-----------|
| §5.1 `assignment_id` never written | **already closed** | `ensureVisitForRouteRunStop` resolves `core.assignments` (source_ref=route_run_id) and writes it |
| §5.2 `outcome`/`reason_code` null | **already closed** | `closeVisitForRouteRunStop` writes outcome (+reason_code on skip) in-txn |
| §5.3 `washed_can` not emitted | **already closed** | ISSUE-031 Stage-2 clip — all 5 cleaning booleans → `core.observations` |
| §5.6 evidence → `core.evidence` | **already closed** | PATTERN-001/PHOTOS (PR #107) + ISSUE-063 (ensure-visit before evidence) |
| §5.7 post-commit emission | **complete path closed; SKIP path still broken** | **fixed here** |

## The fix (§5.7 on the skip path)
`routeRunStopRoutes.ts` skip-with-hazard was the last live instance of the
post-commit-emission anti-pattern: it `COMMIT`ted the skipped visit (with
`reason_code`), then called `emitObservationsForStop()` **without a client** —
i.e. on a fresh pool connection, post-commit, with no retry. A failure after
COMMIT left a visit marked `skipped` whose hazard *observations* silently never
landed — canonical diverging from the operator's recorded skip. (The
complete-stop path was already atomic; only skip lagged.)

Moved `getVisitContext` + `emitObservationsForStop({…, client})` + the
`checkAndCompleteRouteRun` call **inside the transaction, before COMMIT**,
mirroring the complete path exactly. Only the read-only route reload stays
post-commit. Now a skip's status change, visit close, reason_code, and hazard
observations are all-or-nothing.

## Tests
- New `tests/canonical/skipHazardAtomic.test.ts` — the **first** skip-path test:
  drives the real skip endpoint in-process and asserts one call produces the
  skipped visit AND its `encampment_present` hazard observation together (the
  atomic contract). Suite 214 total.
- `current_state.md` §5.1/5.2/5.3/5.6/5.7 marked RESOLVED with references (it
  was a required-read actively misleading future sessions); §5.9 annotated so
  the ISSUE-063 ensure-visit isn't mistakenly reverted.

## Files touched
- `backend/src/modules/work/routeRunStopRoutes.ts` (skip handler: emission in-txn)
- `backend/tests/canonical/skipHazardAtomic.test.ts` (new) + `backend/tests/run.ts`
- `planning/architecture/current_state.md` (§5 reconciliation)
- `docs/changelog/refactor/2026-09-07-issue-051-atomic-observation-emission.md` (this entry)

## Verification / honest note
- Backend 213/214 locally. The **one** local failure is `stopHistory.test`
  ("encampment appears exactly once for stop 31150" → got 2) caused by a stray
  visit (`core.visits` id 3632) left on stop 31150 by the founder's ISSUE-063
  skip-validation earlier today — pre-existing **dev-DB pollution**, not this
  change. Per smoke discipline it was NOT healed mid-test. CI runs test-backend
  against a freshly seeded DB, where stop 31150 carries only the seed + each
  test's own (cleaned-up) rows — so stopHistory passes there. My skipHazardAtomic
  test cleans up its own 31150 visit via `releaseFixture`.
- **Founder follow-up:** the dev DB has accumulated test-skip visits on stop
  31150 from ISSUE-063 validation (visit 3632, on run 4447). Recommend a
  deliberate reset of run 4447's test skips when convenient — left untouched
  here since it is founder-created data, not this session's scaffold.
