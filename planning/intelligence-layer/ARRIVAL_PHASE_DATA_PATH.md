# Arrival Phase Data Path — Findings Memo

> **Type**: Investigation only. No code, schema, or migration changes.
> **Date**: 2026-05-25
> **Scope**: Determine whether `emitObservationsForStop({phase: "arrival"})` and
> its helpers (`arrivalObservations`, `arrivalObservationDefaults`,
> `arrivalDefault`) represent a second live instance of the
> no-manufactured-arrival-state anti-pattern that the 2026-05-25 cleaning
> write-path cleanup (commit `1e4ac06`) explicitly left untouched.
> **Source of truth used**: live code at `backend/src/domains/{observation,routeRun,routeRunStop}/`,
> `backend/src/modules/work/routeRunStopRoutes.ts`, `frontend/src/components/today-route/`,
> `frontend/src/api/routeRuns.ts`. No live-DB queries needed — the conclusion
> rests on call-site evidence.

---

## TL;DR

**The arrival phase is dead code.** It would manufacture state if invoked, but
no production caller invokes it. The only `phase: "arrival"` call site in the
entire repo is one test fixture (`backend/tests/canonical/observations.test.ts:127`).
The HTTP `/route-run-stops/:id/start` handler calls `startRouteRunStopInternal`,
which explicitly removed the arrival emission with the in-source rationale
`// [REMOVED] Per user requirement, we do NOT emit "assumed dirty" observations on start.`
(`backend/src/domains/routeRun/operations/startRouteRunStop.ts:55-58`).

The arrival branch IS structurally manufactured state — `arrivalObservationDefaults`
returns four hardcoded `state: 'dirty' / 'has_trash'` rows with zero specialist
input — but the branch is unreachable from live code paths. Verdict (A): same
anti-pattern as the cleaning pairs, recommended for removal. The "removal" here
is dead-code deletion, not a behavior change. Nothing observable changes for
the live system.

---

## Q1 — TRIGGER: when are these functions called?

**In production: never.**

Exhaustive grep for `phase: "arrival"` across the entire repo (excluding
`node_modules` and `.claude/worktrees/`) returns exactly two hits:

```
backend/src/domains/observation/observationService.ts:67  // type signature
backend/tests/canonical/observations.test.ts:127          // test fixture
```

The type signature is the definition. The test is the only invocation.

Exhaustive grep for `arrivalObservations`, `arrivalObservationDefaults`, and
`arrivalDefault` returns only:
- the function definitions in `observationService.ts`,
- internal dispatch within `emitObservationsForStop` (line 84/87/91/212),
- one comment line in the test file (line 125).

No service, route handler, job, scheduled task, or any non-test code path
passes `phase: "arrival"` to `emitObservationsForStop`. Both production callers
of `emitObservationsForStop` pass `phase: "submit"`:

- `cleanLogService.ts:159-168` — `phase: "submit"` (the complete-stop path)
- `routeRunStopRoutes.ts:270-278` — `phase: "submit"` (the skip-with-hazard path)

The HTTP start-stop endpoint (`routeRunStopRoutes.ts:25-55`) delegates to
`startRouteRunStopInternal`, which DOES import `emitObservationsForStop`
(unused import, line 3) but no longer calls it. The removed call is documented
in source:

```ts
// startRouteRunStop.ts:55-58
// 3. Emit Observations (post-commit)
// [REMOVED] Per user requirement, we do NOT emit "assumed dirty" observations on start.
// Observations are only emitted on completion (paired dirty->clean) or skip.
```

The comment's "paired dirty→clean on completion" claim is now stale — the
cleaning-pair writes were retired in commit `1e4ac06`. But the structural
fact remains: the arrival emission was deliberately removed from the start
path some time ago, and nothing else picked it up.

---

## Q2 — INPUT: does the value come from a specialist assertion, or is it fabricated?

**Fabricated. Zero specialist input.**

`arrivalObservationDefaults` (`observationService.ts:153-160`) returns four
hardcoded rows with no parameters:

```ts
function arrivalObservationDefaults(): ObservationInsert[] {
    return [
        { observation_type: "ground_condition",    payload: { state: "dirty" } },
        { observation_type: "trash_can_condition", payload: { state: "has_trash" } },
        { observation_type: "shelter_condition",   payload: { state: "dirty" } },
        { observation_type: "pad_condition",       payload: { state: "dirty" } },
    ];
}
```

`arrivalDefault(type)` (`observationService.ts:216-219`) is similarly a pure
lookup table, no payload argument, no specialist input:

```ts
function arrivalDefault(type: string): Record<string, any> {
    if (type === "trash_can_condition") return { state: "has_trash" };
    return { state: "dirty" };
}
```

`arrivalObservations(stopId, assetId, orgId, client)` (`observationService.ts:176-214`)
takes only routing identifiers — no payload from the specialist. It queries
`core.observation_type_registry` for required types, then looks up the most
recent prior observation per type at this stop, falling back to
`arrivalDefault(type)` (i.e., a hardcoded `dirty`/`has_trash`) for any type
with no prior row. The "value" is therefore either:
- the *previous* visit's stored arrival state (which was itself manufactured if
  it came from this same function), or
- the hardcoded pessimistic default.

In neither sub-case does the currently-arriving specialist assert anything.

`emitObservationsForStop`'s dispatch (`observationService.ts:81-92`) confirms
no payload is consulted on the arrival branch — the `uiPayload` parameter is
read only on the `submit` branch:

```ts
if (phase === "arrival") {
    if (stopId) {
        observations = await arrivalObservations(stopId, assetId, orgId, client);
    } else {
        observations = arrivalObservationDefaults();
    }
} else if (phase === "submit" && uiPayload) {
    observations = submitObservations(uiPayload);
}
```

The arrival path is the manufactured-state defect by structure: it produces a
value the field never produced.

---

## Q3 — WHAT WOULD BE WRITTEN if it were invoked?

If a production caller ever passed `phase: "arrival"` for a transit stop visit
(it currently does not), the writes per call would be:

**With `stopId` absent or no registry / no prior history — 4 rows:**

| observation_type | payload | source |
|---|---|---|
| `ground_condition` | `{ "state": "dirty" }` | hardcoded |
| `trash_can_condition` | `{ "state": "has_trash" }` | hardcoded |
| `shelter_condition` | `{ "state": "dirty" }` | hardcoded |
| `pad_condition` | `{ "state": "dirty" }` | hardcoded |

**With `stopId` present and a seeded registry — up to N rows** (one per registry
type with `is_required = true AND is_active = true` for the asset_type — per
the current seeder that is 3: `ground_condition`, `shelter_condition`,
`pad_condition`; `trash_can_condition` is `is_required: false`). Each row's
payload is either the most recent prior observation of that type at this stop
(potentially clean if the prior visit had one), or `arrivalDefault(type)`
(again, hardcoded `dirty`).

Either way, every row asserts an arrival condition the currently-arriving
specialist did not state.

---

## Q4 — UI CONFIRMATION: is there an arrival-condition control in the capture surface?

**No.** Exhaustive grep across `frontend/src/` for any of:
`arrival`, `on_arrival`, `arrived_at`, `arrival_condition` — zero matches in
production code.

The start-stop UI is a single `onStartStop` button (`StopDetail.tsx:532-539`)
that POSTs to `/api/route-run-stops/:id/start`. No checkbox, no condition
rating, no rating slider, no "what did you find when you arrived" prompt.
The `ChecklistState` type (`api/routeRuns.ts:35-43`) carries only the five
cleaning task booleans plus `trashVolume` and `spotCheck` — no arrival fields.
The `CompleteStopPayload` (`api/routeRuns.ts:154-166`) is the same shape plus
photos, infra issues, and safety.

The specialist is never asked to rate or assess condition on arrival.
Therefore any `*_condition` row labeled "arrival" is, by Q4's logic, necessarily
manufactured — there is no input to derive it from.

---

## Q5 — CONSUMERS: who would read these arrival rows?

For the four `*_condition` types the arrival path would emit, no production
SQL reads them as a condition signal. Exhaustive grep across `backend/src/`
for `ground_condition`, `shelter_condition`, `pad_condition`, and
`trash_can_condition` returns zero matches outside `observationService.ts`
itself.

References to those type strings exist only in planning docs
(`planning/specs/domain-model/observation_write_flow.md`,
`planning/intelligence-layer/SPOT_CHECK_DATA_PATH.md`,
`planning/refinement/REFINEMENT_R2_ARRIVAL_OBSERVATIONS.md`, and the design
doc itself) — descriptive, not normative SQL.

No materialized view, the daily-operations report, `riskMapService`, or
intelligence consumer queries these types for condition state. The risk-map
service reads `trash_volume` (measurement), the 8 specific safety `*_present`
types, and the 8 specific infra `*_present` types — none of the
`*_condition` types.

There is, however, a SECONDARY consumer of one of these types that matters:
`arrivalObservations` itself, on the NEXT visit, queries
`core.observations.observation_type IN (...the registry's required arrival types...)`
to pull "prior state" (`observationService.ts:191-206`). If the arrival
emission were ever activated, it would self-perpetuate: every arrival's
manufactured rows become the next arrival's "prior state," potentially
overriding what a future genuine condition assertion (if one existed) would
otherwise indicate. With the path inactive in production, this loop is dormant
— historical rows from when the path was last live will eventually age out of
any window query.

---

## Q6 — RELATIONSHIP TO THE ABSENCE MODEL

The design doc states (§4.4 plus the cleaning-cleanup §2.1 row added in commit
`1e4ac06`): "Absence of a not_ok condition row, anchored by a visit/spot-check,
IS the record that the component met standard at time of service."

The arrival path's hardcoded `state: 'dirty'` writes are the structural
negation of that principle: they pre-fill the absence with a manufactured
`not_ok` (or in trash_can's case, a manufactured `has_trash`). If active,
they would write *exactly* the rows the design says must NOT exist.

**Both cannot be true at once.** The absence-is-data model and the arrival
defaults are formally contradictory. Either the model is wrong, or the arrival
defaults are wrong. The design doc has been ratified through three sprints
(observation model, type registry, write-path cleanup) and the contradicting
code path is unreachable; the resolution is settled by what the system
*actually does*, which is: not emit those rows.

---

## VERDICT — (A) MANUFACTURED STATE

The arrival phase is **manufactured state by every structural test the design
doc applies**:
- the value is fabricated, not asserted (Q2);
- the rows assert facts the schema says should be absent (Q6);
- no UI control supplies any input the code could honor (Q4).

It is also **dead code**: no production path invokes it (Q1), so the live
system is already absence-is-data-compliant on the arrival axis. The defect
exists in the file, not in the database.

### Recommendation — REMOVE, with one preserved invariant

1. Delete `arrivalObservations`, `arrivalObservationDefaults`, `arrivalDefault`,
   `getArrivalObservationTypes`, and `resolveCoreAssetTypeId` (the last two
   exist only to serve the arrival path; verify no other callers grep-clean
   before removal).
2. Narrow the `emitObservationsForStop` signature to drop the `arrival` arm of
   the `phase` union (or replace with a `submitObservationsForStop` named
   helper). Drop the now-unused import in `startRouteRunStop.ts:3`.
3. Update the matching test in `backend/tests/canonical/observations.test.ts`
   (the `arrival phase writes ground_condition (defaults path)` test) — delete
   it, since the behavior it covers will be gone.
4. Optionally flip `is_required = true` to `false` on the four
   `*_condition` rows in the registry seeder. Their `is_required` flag is read
   only by the arrival-types lookup, so once that's gone the flag is inert. A
   follow-up sprint may want to revisit whether `ground_condition`,
   `shelter_condition`, and `pad_condition` should remain `kind=condition`
   registry rows at all, given the system never invites a specialist to grade
   them — but that is a registry-design call, not part of removing the
   manufactured-state path.

### What is lost by removal

Nothing observable. The arrival rows are not emitted today, not read today,
and not written by any active code path. Removing the dead branch:
- frees a permanent contradiction with the absence-is-data invariant;
- closes the second (and now last) "manufactured arrival state" instance the
  design doc names;
- shrinks the `emitObservationsForStop` surface from two phases to one,
  matching the one phase actually used.

The arrival-state HISTORY currently in `core.observations` (rows written
before the start-path emission was removed) is preserved by the design's
no-hard-delete rule; backfill/reclassification of those legacy rows is §9
Q4 work, not part of this removal.

### What is NOT proposed here

This memo does not propose touching:
- `submitObservations` (already cleaned up in `1e4ac06`),
- `emitSpotCheckObservation` (the legitimate positive anchor, see §3.5 and
  the spot-check memo),
- the cleaning-action registry rows,
- the registry seeder beyond the optional `is_required` flag flip noted above.
