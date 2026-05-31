# 2026-05-25 — Canonical state layer ratification + seeding: retire two umbrella safety types, seed four action types + stop-level spot_check anchor

## NOT in this commit — next dispatch

**Read this commit as a checkpoint, not a closure of the manufactured-state work.**

`backend/src/domains/observation/observationService.ts:248-266` (and the
companion paths in `cleanLogService.ts`) still manufacture a paired
`state='dirty'` → `state='clean'` row pair on **every completed cleaning** —
one `*_condition` row with `state='dirty'` immediately followed by a second
`*_condition` row with `state='clean'`, for each of `picked_up_litter`,
`emptied_trash`, `washed_shelter`, `washed_pad`. The arrival half of every
pair is a worker-independent guess: it asserts "was dirty" without the worker
having graded it.

This is the **last live instance** of the manufactured-arrival-state
anti-pattern (the design-doc §2.1 principle, "never manufacture a fact that is
already entailed"). The umbrella-generic instance of the same anti-pattern is
closed by this commit (safety umbrellas retired in the registry and in
intelligence readers), but the dirty→clean cleaning-pair instance is not
touched. Every completed visit continues to write the pairs.

**The fix is the next state-layer dispatch** and is NOT in this commit. Shape
of that fix: replace each manufactured pair with a single standalone
`kind=action` row (`picked_up_litter`, `emptied_trash`, `washed_shelter`,
`washed_pad` — registry rows already seeded by this commit), and let
intelligence derive the dirty→clean transition from the action observation
composed with any explicitly-asserted condition observation, per §4.4
absence-as-counted-signal. Tracker item **s4** remains **OPEN**.

What this commit does prepare: the registry rows the refined write path will
need (the four kind=action types + the stop-level `spot_check` anchor), the
design authority for the change (CANONICAL_STATE_LAYER_DESIGN.md §2.1, §3.5,
§4.4 — ratified), and the safety-umbrella retirement that proves the
anti-pattern-removal pattern end-to-end (write path + reader repoint +
historical-row preservation) before applying it to the larger cleaning-pair
case.

---

## What changed

### Registry (`core.observation_type_registry`, via the Tier 8 seeder)
- **Retired (`is_active=false`; historical rows preserved):**
  - `safety_concern_present`
  - `stop_not_serviced_due_to_safety`
- **Seeded (new active rows, all under `asset_type_id=transit_stop`, org `kcm`):**
  - `picked_up_litter` — `value_type=boolean` (kind=action in the refined doc)
  - `emptied_trash` — `value_type=boolean` (kind=action)
  - `washed_shelter` — `value_type=boolean` (kind=action)
  - `washed_pad` — `value_type=boolean` (kind=action)
  - `spot_check` — `value_type=state`, `valid_values=["no_work_needed"]` (kind=condition, scope=stop — the stop-level positive anchor required by §4.4 absence-as-counted-signal)
- Registry row count: 25 → 30 (28 active, 2 retired).

### Seeder script (`backend/scripts/seed_transit_assets.ts`)
- Added optional `isActive` field to `ObsTypeRow`; defaults to true.
- Changed the `ON CONFLICT DO UPDATE` clause to honor `EXCLUDED.is_active` rather than force `true` on every re-run, so the seeder can both seed and retire rows idempotently.
- Inserted the four action types and `spot_check` into `TRANSIT_STOP_OBSERVATION_TYPES`.
- Marked the two retired generics with `isActive: false` (kept in the list so the next seeder run reasserts retirement; do not hard-delete).

### Write path repointing — additive verification first, then minimal removals
- **Verified before changing:** observed (in `observationService.ts` `submitObservations`) that on a Save-Hazards or Skip-for-Safety capture, the system wrote (a) one row per specific selected hazard (`encampment_present` / `fire_present` / etc.), (b) the umbrella `safety_concern_present`, and on skip (c) `stop_not_serviced_due_to_safety`. The skip path additionally sets `core.visits.outcome = 'skipped'` with `reason_code = 'safety'` in `visitService.ts`. Confirmed all three writes happen on the same flow.
- **Repointed (`backend/src/domains/observation/observationService.ts`):** removed the `safety_concern_present` umbrella emit and the `stop_not_serviced_due_to_safety` emit. Specific hazard emits are preserved and continue to fire whenever the worker selects any specific hazard, **regardless of whether the visit is skipped** (serviced-anyway hazards still count). The visit-outcome write on the skip path is unchanged.
- **Repointed two downstream readers (intelligence and aggregation):**
  - `backend/src/domains/routeRunStop/cleanLogService.ts:189` — `stop_effort_history.had_hazard` was computed from `EXISTS (… observation_type = 'safety_concern_present')`. Repointed to OR over the 8 specific safety presence types so the boolean continues to fire on any specific hazard, with no silent regression.
  - `backend/src/intelligence/riskMapService.ts:114` — the `haz` CTE that populates `stop_risk_snapshot` was filtered by `observation_type = 'safety_concern_present'`. Repointed to the same 8-key `IN (…)` list. Header comment in the same file updated to record the umbrella retirement and to flag `infrastructure_issue_present` as a candidate for the same treatment.
- **Not changed:** the capture UI, the offline queue action schema, and the spot_check write path (`emitSpotCheckObservation`) — all three are explicitly frozen for this task. The current spot_check write emits `payload: '{}'::jsonb`; reconciling that with the refined target shape `{"scope":"stop","result":"no_work_needed"}` is a follow-up tracked in §9 Q4.

### Design doc (`planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md`)
- **§2.1 added — "Anti-pattern: never manufacture a fact that is already entailed."** A general principle that unifies four retired-row patterns (default arrival condition, paired before/after, `safety_concern_present`, `stop_not_serviced_due_to_safety`) as instances of the same defect: writing a row whose meaning is fully determined by other rows already in the schema. Includes a "specific is the enrichment; umbrella is duplication" corollary and explicitly notes danger is captured regardless of skip.
- **`infrastructure_issue_present` flagged** in §2.1 as the surviving generic umbrella — a candidate for the same retirement under the same principle, deferred to keep the 2026-05-25 sprint scoped.
- **§3.5 (spot check) extended with a gating note:** until the `spot_check` registry row is seeded AND the write path emits it on visits where the worker asserts "no work needed," component silence cannot be safely interpreted as benign. Both are in place as of 2026-05-25 (the registry row was seeded by this sprint; the write path emit already existed). §4.4 absence-as-counted-signal is unblocked for transit.
- **§9 Q2 marked RESOLVED** — the four-kind taxonomy covers all 25 originally-seeded types cleanly once `stop_not_serviced_due_to_safety` is reclassified as a visit-outcome duplicate and retired. Status banner preserved: doc remains **TARGET DESIGN, PENDING §9 VERIFICATION** for the remaining open questions (offline write validation, backfill of heterogeneous payloads, no-grant intelligence role feasibility).

## Why

- **Umbrella generics are duplicates of higher-resolution facts.** `safety_concern_present` is true iff at least one of the 8 specific safety `*_present` rows is written; `stop_not_serviced_due_to_safety` is true iff `core.visits.outcome='skipped'` with `reason_code='safety'`. Writing both the umbrella and the specific(s) invites double-counting in any consumer that doesn't know which is canonical. Writing only the umbrella loses resolution. Writing only the specific carries the same information at higher resolution. The principle that retires both: never manufacture a row whose meaning is already entailed.
- **Danger is captured as a specific fact regardless of skip.** A worker can — and frequently does — report a hazard and still service the stop. The generic umbrella made it tempting to treat "hazard present" and "skipped" as the same signal; they are not. The 8 specific presence types stand alone, written whether or not the visit was skipped.
- **The spot_check anchor was load-bearing, not housekeeping.** §4.4 (absence-as-counted-signal) only works against a visit anchor. The 4 component-level condition types existed; the stop-scope anchor did not. Without it, the intelligence layer could not safely interpret component silence as benign — silence had to be read as "nothing was asserted," not as "nothing was wrong." Seeding `spot_check` closes that gap.
- **The four cleaning actions had to be registry-resident** for the canonical layer's "capture-UI-is-the-contract" invariant to hold (§2 invariant #7). The capture UI has shown 5 cleaning checkboxes for some time, but only `washed_can` had a registry row — the other 4 (`picked_up_litter`, `emptied_trash`, `washed_shelter`, `washed_pad`) were being written canonically (`observationService.ts` emits them as paired condition-state transitions today) but without registry entries. Seeding the four kind=action types makes the schema match what the UI produces, in preparation for the refined write path that will store them as standalone action rows (no manufactured arrival pair).

## UI-to-registry reconciliation table

### Report Safety modal (8 checkboxes → 8 active specific presence types after retirement)

| UI label | UI value (`opt.val`) | normalized | registry `observation_key` | status |
|---|---|---|---|---|
| Encampment | `encampment` | encampment | `encampment_present` | ✅ 1:1 |
| Fire | `fire` | fire | `fire_present` | ✅ 1:1 |
| Dangerous Activity | `dangerous_activity` | dangerous_activity | `dangerous_activity_present` | ✅ 1:1 |
| Active Drug Use | `active_drug_use` | drug_use | `drug_use_present` | ⚠️ value→key rename (UI "active_drug_use" → registry "drug_use") — handled in `normalizeSafetyKey()` |
| Violence | `violence` | violence | `violence_present` | ✅ 1:1 |
| Biohazard | `biohazard` | biohazard | `biohazard_present` | ✅ 1:1 |
| Traffic / Access | `traffic` | access_blocked | `access_blocked` | ⚠️ UI label "Traffic / Access" maps to registry key `access_blocked` via `normalizeSafetyKey()`. Reported, not silently renamed — the UI surfaces traffic obstruction as one user-facing instance of "access blocked," and the registry key is the broader concept. **Decision to defer:** consider renaming the UI label to "Access Blocked" for symmetry, or splitting `access_blocked` into `traffic_blocking` + a broader `access_blocked` if the analyst surface needs the distinction. |
| Other | `other` | other | `other_safety_concern_present` | ✅ 1:1 |
| ~~(none)~~ | ~~(none)~~ | — | ~~`safety_concern_present`~~ | 🔻 **retired** — entailed by any specific |
| ~~(skip path)~~ | ~~(skip path)~~ | — | ~~`stop_not_serviced_due_to_safety`~~ | 🔻 **retired** — entailed by `core.visits.outcome` |

Verdict: clean 8:8 mapping with two name-translation cases (`active_drug_use → drug_use`, `traffic → access_blocked`) already handled in the existing `normalizeSafetyKey()` helper. No orphan UI controls. No orphan registry types.

### Report Infrastructure modal (9 checkboxes → 8 active specific presence types + 1 unmapped UI control)

| UI label | UI key | `issueType` | registry `observation_key` | status |
|---|---|---|---|---|
| Broken glass | `broken_glass` | `glass_broken` | `glass_damage_present` | ✅ via `normalizeInfraKey()` |
| Graffiti | `graffiti` | `graffiti_excessive` | `graffiti_present` | ✅ via `normalizeInfraKey()` |
| Trash can damaged | `receptacle_damaged` | `receptacle_damaged` | `receptacle_damage_present` | ✅ via `normalizeInfraKey()` |
| Panel damaged/missing | `panel_damaged` | `panel_damaged` | `shelter_panel_damage_present` | ✅ via `normalizeInfraKey()` |
| Lighting not working | `lighting_out` | `lighting_out` | `lighting_failure_present` | ✅ via `normalizeInfraKey()` |
| Landscaping blocking access | `landscaping_blocking` | `landscaping_blocking` | `access_obstructed_by_landscape` | ✅ via `normalizeInfraKey()` |
| Structure damaged | `structure_damaged` | `structure_damaged` | `structural_damage_present` | ✅ via `normalizeInfraKey()` |
| Other | `other_infra` | `other_infra_issue` | `other_infrastructure_issue_present` | ✅ via `normalizeInfraKey()` |
| **Contaminated waste (biohazard)** | **`contaminated_waste`** | `contaminated_waste` | **(none — orphan UI control)** | 🟥 **ORPHAN.** No active registry type matches `contaminated_waste`. `mapInfraIssue()` will hit its default branch and write `other_infrastructure_issue_present` (with a `console.warn`). This is silent loss of resolution: a biohazard-flavored infrastructure report ends up bucketed as "other." |
| `infrastructure_issue_present` | (umbrella) | — | `infrastructure_issue_present` | ⚠️ still active; flagged in §2.1 as a candidate for the next retirement pass under the umbrella anti-pattern |

**Orphan flagged, not auto-fixed.** Two reasonable resolutions exist and the choice carries a product decision:
1. **Route to safety.** "Contaminated waste (biohazard)" is conceptually a safety hazard, not an infrastructure issue. Move the control to the Report Safety modal and map it to `biohazard_present`. The infrastructure modal then has 8 controls cleanly mapping 1:1 to 8 infrastructure presence types (matching the safety modal's structure).
2. **Add a registry type.** Seed `contaminated_waste_present` (kind=presence, infrastructure-side) and add the mapping. Keeps the infrastructure modal at 9 controls.

I have not made this change — it requires product input on whether "contaminated waste" belongs in the safety vocabulary or the infrastructure vocabulary.

## Verification

- Seeder ran successfully: 30 types upserted, 28 active, 2 retired (verified via `SELECT observation_key, is_active FROM core.observation_type_registry ORDER BY sort_order`).
- Backend `tsc --noEmit` passed cleanly after edits.
- The skip-for-safety / Save Hazards flows continue to write the specific hazard rows; the umbrella + non-service-flag rows are no longer emitted. The visit-outcome write (`core.visits.outcome='skipped'`, `reason_code='safety'`) is preserved.
- Two readers (`stop_effort_history.had_hazard`, `riskMapService.haz` CTE) were repointed to OR over the 8 specific safety presence types so the retirement does not create a silent intelligence regression.

## Files touched

- `backend/scripts/seed_transit_assets.ts` (extended seeder + ran)
- `backend/src/domains/observation/observationService.ts` (removed two umbrella emits)
- `backend/src/domains/routeRunStop/cleanLogService.ts` (repointed `had_hazard` to 8 specific keys)
- `backend/src/intelligence/riskMapService.ts` (repointed `haz` CTE to 8 specific keys + comment refresh)
- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` (§2.1 anti-pattern, §3.5 gating note, §9 Q2 resolved)
- `docs/changelog/2026-05-25-state-layer-ratification-seeding.md` (this entry)
