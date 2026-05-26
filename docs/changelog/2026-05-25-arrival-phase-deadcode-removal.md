# 2026-05-25 — Arrival-phase dead-code removal (manufactured-state anti-pattern fully closed)

Follows the same-day investigation
(`planning/intelligence-layer/ARRIVAL_PHASE_DATA_PATH.md`, committed in this
change) and the same-day write-path cleanup
(`docs/changelog/2026-05-25-writepath-manufactured-state-cleanup.md`). The
investigation found the arrival code path:
- structurally manufactured state (canonical state layer §2 invariant #5 —
  hardcoded `state: 'dirty'` / `state: 'has_trash'` rows with no specialist
  input);
- unreachable from any production call site (both production callers of
  `emitObservationsForStop` pass `phase: "submit"`; no UI control feeds an
  arrival assessment; the start-stop handler carried an in-source
  `// [REMOVED]` note from a prior deletion).

This change executes the action the memo justifies: delete the dead chain,
narrow the public surface, and close the manufactured-state anti-pattern in
the codebase (not only in the data flow). Tracker **s4** is now fully closed.

## What changed

### Investigation memo committed
- `planning/intelligence-layer/ARRIVAL_PHASE_DATA_PATH.md` — the read-only
  investigation from the 2026-05-25 task, committed alongside the deletion so
  the history is self-explanatory: memo proves the path is dead, commit
  removes it, future readers see both at the same SHA.

### Dead arrival code removed
Removed from `backend/src/domains/observation/observationService.ts`:
- `arrivalObservations(stopId, assetId, orgId, client)` — async lookup that
  queried prior `*_condition` state via `transit_stop_assets` (Path B) with a
  fallback to hardcoded dirty defaults.
- `arrivalObservationDefaults()` — 4 hardcoded `state: 'dirty'` /
  `state: 'has_trash'` rows.
- `arrivalDefault(type)` — per-type hardcoded dirty / has_trash lookup.
- `getArrivalObservationTypes(coreAssetTypeId, orgId, client)` — registry
  query for `is_required = true` types (the only filter-reader of that flag).
- `resolveCoreAssetTypeId(assetId, orgId, client)` — `public.assets → public.asset_types → core.asset_types`
  bridge. The generic name was flagged in the deletion guard for extra
  scrutiny; the Step 0 call graph showed exactly one caller (the now-deleted
  `arrivalObservations`), so removal was scope-safe.

### `emitObservationsForStop` signature narrowed
- `phase` union narrowed from `"arrival" | "submit"` to `"submit"` only.
- `stopId?: string` parameter removed (it existed only to feed the arrival
  lookup; neither production caller passed it).
- Function body simplified — early-return on missing `uiPayload` or empty
  observations list; no phase branching.
- New header comment points future readers at the investigation memo so the
  removal rationale is discoverable from the source file.

### Stale import + comment cleanup
- `backend/src/domains/routeRun/operations/startRouteRunStop.ts`:
  - Removed dead `import { emitObservationsForStop } from "../../observation/observationService";`
    (unused since the arrival emit was last removed).
  - Rewrote the obsolete `// [REMOVED] Per user requirement, we do NOT emit
    "assumed dirty" observations on start. Observations are only emitted on
    completion (paired dirty->clean) or skip.` comment. The "paired
    dirty->clean" half had already been wrong since commit `1e4ac06` retired
    the paired write; the rewrite states the current invariant (no
    manufactured arrival state, observations only on specialist assertion at
    completion or skip) and points at this changelog + the design doc §2
    invariants #5/#6.

### Dead test removed
- `backend/tests/canonical/observations.test.ts` — deleted `observations:
  arrival phase writes ground_condition (defaults path)`. It was the only
  caller of `phase: "arrival"` in the entire repo; with the branch gone,
  the test no longer compiles meaningfully. The unused `assert` import
  (used only by that test) was removed from the test-setup imports.

### Backend test count
Before: 106 passed. After: 105 passed, 0 failed. The single removal is the
deleted arrival test — exactly the expected delta. No other test changed,
confirming the Step 0 call graph was complete.

## Why

- **Closes the manufactured-state anti-pattern in the codebase, not just the
  data flow.** Commit `1e4ac06` removed the manufactured cleaning pair from
  the submit path but left the arrival manufactured path standing as dead
  code. Carrying dead code that contradicts a ratified design invariant
  invites a future caller to re-activate it by accident. Deleting the chain
  removes the invitation.
- **Shrinks the write-path surface to what the system actually uses.** One
  phase, one branch, one signature. The narrowed `emitObservationsForStop`
  type also makes any future attempt to re-introduce a `phase: "arrival"`
  call a TypeScript error.
- **Honors absence-as-data structurally.** With the arrival emit gone,
  "component met standard at time of service" is entailed exclusively by the
  absence of a not_ok row anchored to a visit / spot-check (§4.4). No
  contradicting write path remains in the file.

## Out of scope (intentionally NOT touched)

- **`is_required: true` on the four `*_condition` rows in the seeder**
  (`backend/scripts/seed_transit_assets.ts`). The Step 0 audit found
  `is_required` is read NOT only by the deleted arrival path: `assetService.ts`
  writes it, `tenantRoutes.ts` exposes it via the admin tenant API
  (`GET /api/admin/tenant/observation-types`), and the value is preserved in
  `core.observation_type_registry`. Flipping the seeder flag would change a
  value visible through the admin API — beyond the scope of a dead-code
  removal. The flag is now inert as a filter (its only filter-reader was
  `getArrivalObservationTypes`, now deleted) but remains live data. A future
  registry-design pass can revisit whether `ground_condition`,
  `shelter_condition`, `pad_condition`, and `trash_can_condition` should
  remain registered as condition types at all, given no capture surface
  invites a specialist to grade them.
- **Pre-existing unused `getVisitContext` import** in `startRouteRunStop.ts`.
  Almost certainly orphaned at the same time as the arrival-emit removal, but
  not caused by this deletion. Project tsconfig does not enable
  `noUnusedLocals` / `noUnusedParameters`, so the import is harmless. Leaving
  alone to keep the diff scoped to the dead-arrival chain.
- **§9 remaining items** (offline write validation, no-grant intelligence
  role, complexity_score recompute, historical row backfill) — separate work.

## Files touched

- `backend/src/domains/observation/observationService.ts` — 5 functions
  removed; `emitObservationsForStop` narrowed to submit phase only.
- `backend/src/domains/routeRun/operations/startRouteRunStop.ts` — dead
  `emitObservationsForStop` import removed; stale `[REMOVED]` comment
  rewritten to match current invariants.
- `backend/tests/canonical/observations.test.ts` — arrival test deleted;
  unused `assert` import dropped.
- `planning/intelligence-layer/ARRIVAL_PHASE_DATA_PATH.md` — investigation
  memo, newly committed.
- `docs/changelog/2026-05-25-arrival-phase-deadcode-removal.md` — this file.

## Tracker status

- **s4 (manufactured-arrival-state anti-pattern)** — FULLY CLOSED. Both the
  write-path instance (cleaning pair, retired in `1e4ac06`) and the dead-code
  instance (arrival phase, retired here) are gone. The codebase no longer
  contains a path that would manufacture an arrival condition.
