# 2026-09-17 — ISSUE-070: a safety/infrastructure report counts as work recorded

## What changed
- **Completion gate widened, both layers in agreement** (founder decision,
  Option 1). Work recorded is now any of: cleaning action (+ trash volume),
  spot check, **or an infrastructure/safety report**:
  - `frontend/src/components/today-route/StopDetail.tsx` — `canComplete` and
    the Finish-render gate accept `hasReport` (`infra.hasIssues` with issues, or
    `safety.hasConcern` with hazard types).
  - `backend/src/modules/work/routeRunStopRoutes.ts` (complete handler) —
    accepts `infraIssues[]` or `safety.hazard_types[]` as work; the 400 message
    now names all three paths.
- Unchanged on purpose: the after-photo requirement (accountability gate),
  trash volume required only when cleaning, the skip path, and observation
  emission — **nothing is manufactured**. A report-only completion writes the
  completed visit + the presence observations and nothing else (no action rows,
  no trash_volume, no spot_check).
- New contract test `reportOnlyCompletion.test.ts` (registered): over the real
  HTTP handler — infra-only → 200 with ONLY the report landed; safety-only →
  200 as a *completed* (serviced-anyway) visit; no work at all → still 400.

## Why
- The gate required cleaning-or-spot-check, so a worker who found ONLY damage
  had no truthful completion: fabricate an action row, spot-check (falsely
  asserting "no work needed" against visible damage — §3.5), or back out. And
  backing out **silently lost the report** — the modals stash client-side and
  the observations only reach canonical through the completion payload. The
  report IS the work on such a visit; blocking it corrupted or discarded
  exactly the condition data the product exists to capture.
- Canonically sound: "assessed, found damage, reported" is a completed
  assessment visit (§3.2), symmetric with the spot check's own definition.
  Component silence on such a visit stays honest — no spot check means silence
  reads "nothing asserted," which is true (the worker assessed the damage, not
  the cleanliness). §4.4 unaffected.
- Trust surface unchanged: a worker could already falsely tick a cleaning box;
  the old gate blocked only the honest path.

## Verification
- BE `tsc` clean; backend **223/223** (220 + 3 new). FE `tsc` clean; frontend
  **119/119** (no FE test pinned the old gate).
- Code-only; no migration; no frozen files.

## Files touched
- `frontend/src/components/today-route/StopDetail.tsx`
- `backend/src/modules/work/routeRunStopRoutes.ts`
- `backend/tests/canonical/reportOnlyCompletion.test.ts` (new)
- `backend/tests/run.ts`
- `docs/changelog/bugfix/2026-09-17-issue-070-report-only-completion.md` (this entry)
