# 2026-05-25 — Write-path manufactured-state cleanup

Follows the same-day state-layer ratification sprint
(`2026-05-25-state-layer-ratification-seeding.md`). That sprint closed the
registry side of the umbrella anti-pattern (§2.1). This change closes the
write-path side: the cleaning submit path no longer manufactures
arrival-state rows, and the two remaining write-path duplicates flagged in
the design doc — `infrastructure_issue_present` and `contaminated_waste` —
are retired.

## What changed

### Step 0 — Component capture verified (no code change)
- Confirmed each of the 5 cleaning checkboxes (`picked_up_litter`,
  `emptied_trash`, `washed_shelter`, `washed_pad`, `washed_can`) is a
  distinct, distinguishable boolean on the submission payload, with a
  registered `kind=action` registry type per task already seeded.
- The component target is implicit in the type key
  (`washed_pad`↔pad, `washed_shelter`↔shelter, `picked_up_litter`↔ground,
  `emptied_trash`↔trash_can, `washed_can`↔trash receptacle).
- Offline-queue reconcile impact: NONE. The queue carries one
  `COMPLETE_STOP` action per stop and re-POSTs the same checkbox payload to
  `/complete`; observation row shape changes are server-side only.

### Step 1 — Cleaning submit path stops manufacturing dirty→clean pairs
Before (per cleaning task, the submit path wrote 2 rows):
```
ground_condition  state=dirty   ← synthetic arrival state
ground_condition  state=clean   ← synthetic departure state
```
After (per performed cleaning task, the submit path writes 1 row):
```
picked_up_litter  payload={}    ← single kind=action row
```
The synthetic "dirty" arrival row was a worker-independent guess inverting
what absence-as-signal means (§4.4): a missing not_ok condition row, anchored
by a visit (or §3.5 spot check), is itself the record that the component met
standard at time of service. Storing a manufactured "dirty" row asserted an
arrival state nobody observed and double-counted with the action row.

`washed_can` was aligned to the same shape: previously it wrote one row with
`payload.value=<bool>` regardless of whether the cleaning happened; now it
writes one empty-payload row only when the act happened (and zero rows when
false), matching the no-manufactured-fact principle.

### Step 2 — `contaminated_waste` collapsed into `biohazard_present`
The infra-modal "Contaminated waste (biohazard)" checkbox was a second name
for an existing safety presence type — feces, urine, needles, other
infectious material — surfaced as an "infrastructure" control. Previously
it fell through `mapInfraIssue` to `other_infrastructure_issue_present`
with a `console.warn`, silently losing resolution. The infra-issue map now
points `contaminated_waste` → `biohazard_present`, so the canonical row
written is correct regardless of which capture surface emitted the fact.

The same change makes hazard-presence-vs-skip decoupling explicit in the
design doc (§2.1 new corollary): a biohazard found, cleaned, and serviced
records `biohazard_present` with NO skip. The skip is a separate axis on
`core.visits`. Intelligence reads hazard frequency from ALL safety presence
observations, not only those tied to `outcome='skipped'`.

No `contaminated_waste` registry row exists (was never seeded), so no
registry tombstone was required. Historical orphan observations in
`core.observations` (if any) are preserved.

### Step 3 — `infrastructure_issue_present` retired (umbrella → specifics)
Same anti-pattern as the already-retired `safety_concern_present`:
entailed by the OR over the 8 specific infrastructure `*_present` types,
adds no signal, invites double-counting. Retired in three changes (write,
readers, registry), all in this commit so the umbrella never goes
write-missing while readers still depend on it:

1. **Readers repointed first.** Two SQL readers identified by survey; both
   updated to `observation_type IN (...8 specifics...)`:
   - `backend/src/intelligence/riskMapService.ts` — `infra` CTE used to
     compute `infra_issue_score` for `stop_risk_snapshot`.
   - `backend/src/domains/routeRunStop/cleanLogService.ts` —
     `stop_effort_history.had_infra_issue` `EXISTS` check.
2. **Write retired.** `observationService.submitObservations()` no longer
   emits the umbrella row when `infrastructurePresent=true`; only the
   specific `*_present` rows are written.
3. **Registry tombstoned.** `seed_transit_assets.ts` sets the
   `infrastructure_issue_present` row to `isActive=false` with display
   suffix "(RETIRED — see specific *_present)". Historical observations
   referencing the umbrella are preserved.

Reader survey was exhaustive: no other backend services, MVs, frontend
code, or scripts read the umbrella string. Doc-only references in
`planning/specs/` are descriptive and unaffected.

## Why

- **§2.1 anti-pattern, full enforcement.** The umbrella retirement closes
  the last surviving instance flagged "open candidate" in the design doc.
- **Invariants #5 + #6 in code, not just docs.** The cleaning submit path
  was the largest remaining source of manufactured arrival-state rows; it
  is now compliant.
- **Capture-resolution preserved.** Repointing `contaminated_waste` →
  `biohazard_present` recovers a class of data previously degraded into
  `other_infrastructure_issue_present`.
- **Reader correctness preserved across the umbrella retirement.** Both
  SQL readers were repointed in the same commit; the `EXISTS` semantics
  are preserved, and the `riskMapService` count cap (`LEAST(COUNT(*), 5)`)
  absorbs the small numerator shift from "1-per-visit" to "N-per-visit".

## Out of scope

- The arrival-phase write
  (`emitObservationsForStop({phase: "arrival"})`, called from
  `startRouteRunStop`) is still a manufactured-state surface. It is
  retained for now; its retirement is tracked separately.
- `clean_logs` adapter-table boolean writes are unchanged. Adapter
  retirement is a separate concern.
- §9 remaining items (offline payload validation, backfill of historical
  rows, `complexity_score` recompute, no-grant intelligence role) are
  untouched.

## Files touched

- `backend/src/domains/observation/observationService.ts` — cleaning
  write path rewritten to single action rows; `mapInfraIssue` map gains
  `contaminated_waste → biohazard_present`; umbrella write removed.
- `backend/src/intelligence/riskMapService.ts` — `infra` CTE repointed to
  the 8 specific infra `*_present` types; header comment updated.
- `backend/src/domains/routeRunStop/cleanLogService.ts` —
  `stop_effort_history.had_infra_issue` `EXISTS` check repointed to the
  same 8 specifics.
- `backend/scripts/seed_transit_assets.ts` —
  `infrastructure_issue_present` tombstoned (`isActive=false`, retire
  marker in display name).
- `backend/tests/canonical/observations.test.ts` — `washed_can` tests
  updated to the new shape (empty payload when true; no row when false).
- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` — §2.1 table
  expanded with the two new tombstones and the cleaning-pair retirement
  row; new corollary on hazard-presence-vs-skip decoupling; §9 item 2
  updated with current registry counts and a manufactured-state status
  note.
- `docs/changelog/2026-05-25-writepath-manufactured-state-cleanup.md` —
  this file.
