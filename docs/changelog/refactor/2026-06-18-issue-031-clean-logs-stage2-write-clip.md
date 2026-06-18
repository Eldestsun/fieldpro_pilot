# 2026-06-18 — ISSUE-031 Stage 2: clean_logs dual-write mirror clipped

> ## ⚠️ PRE-CAPABILITY-BUILD GATE — consolidate the accumulating repoints
>
> This is the **third** Stage-2 clip, and Capability-Build repoint notes are now
> accumulating as scattered changelog entries across **three separate PRs**. Each is
> documented; **none are consolidated**. Known repoints so far:
>
> 1. **hazards EAM-bridge `is_exception` gap** — hazards Stage-2 clip changelog.
> 2. **hazards admin-summary reader** — hazards Stage-2 clip changelog.
> 3. **`loadRouteRunById.ts:81` clean-action booleans** — this changelog (Reader
>    inventory below; one-line swap to `cleanLogsCanonicalQuery`).
>
> **Before Capability Build starts, these repoints MUST be collected into a single
> punch-list.** Consolidation is a **pre-Capability-Build gate, not optional** —
> scattered PR descriptions are exactly how repoints get missed. Whoever kicks off
> Capability Build: sweep every Stage-2 changelog for "scheduled-repoint" /
> "Capability Build" notes and assemble them into one tracked list before any repoint
> work begins. This count grows by one per remaining table clip.

## What changed
- Removed the `public.clean_logs` mirror INSERT from the stop-completion write path
  (`completeStop` in `cleanLogService.ts`, formerly ~`:97-110`). After this change a
  stop completion writes **ONLY** canonical: intervention/action rows in
  `core.observations`, the visit in `core.visits`, and photos in `core.evidence`.
  `public.clean_logs` stops receiving new rows.
- The response field `clean_log_id` is preserved, now sourced from the canonical
  visit id (`const cleanLogId = visitId`) — the same id the canonical clean-logs read
  already projects (`cleanLogsCanonicalQuery.ts`: *"id is the canonical visit id (was
  clean_logs.id)"*). No FK pointer or `clean_log%` column references the old id, and
  there is no frontend consumer of `clean_log_id` — the contract holds with no
  remaining table dependency.

## Why
- Stage 2 of the ISSUE-031 adapter→core clip. Losslessness was re-verified
  (`docs/audit/2026-06-18-issue-031-losslessness-reverify.md`) under the **ABSENCE =
  FALSE** intervention model — proven in BOTH directions (see Field mapping +
  Verification).
- The canonical action rows were already emitted independently of the mirror INSERT.
  `emitObservationsForStop` (`observationService.ts:175-192`) pushes one
  `obs_kind='action'` row per TRUE action, driven by `uiPayload` (built from `data.*`),
  with zero data dependency on the clipped INSERT. Removing the mirror cannot break the
  canonical write.
- `clean_logs.user_id` is a constant `0` transit-adapter field with no FK and no
  canonical significance (`core.visits.captured_by_oid` carries real identity).
  Confirmed via live read: all 7 rows (incl. 1 visit_id-NULL orphan) carry `user_id=0`.
  Clipping it carries **no** worker identity — a labor-safety formality.

## Field mapping (mirror column → canonical home)
The clean_logs → canonical mapping is **not** 1 column → 1 column. The five action
booleans fan out into intervention ROWS under absence-means-false:

| `clean_logs` column | Canonical home | Status |
|---|---|---|
| `id` (bigint PK) | succeeded by `core.visits.id` (the canonical clean-event id) | ✅ routed (response `clean_log_id` = visit id) |
| `visit_id` | `core.visits.id` / `core.observations.visit_id` | ✅ routed |
| `route_run_stop_id` | `core.visits.client_visit_id` (uuidv5 `route-run-stop:<id>`) | ✅ routed (indirect; no identity) |
| `stop_id` (text) | `core.visits.location_id` via `core.location_external_ids` | ✅ routed |
| `asset_id` | `core.observations.asset_id` | ✅ routed |
| **`user_id` (= constant 0)** | **none — intentionally dropped** | ✅ no canonical home by design (worker non-attribution); value was always 0 |
| `duration_minutes` | `core.visits` wall-clock `GREATEST(1, CEIL((ended_at−started_at)/60))` | ✅ routed (±~3ms `now()` jitter — known-acceptable) |
| `cleaned_at` | `core.visits.ended_at` (set by `closeVisitForRouteRunStop`) | ✅ routed (±~3ms — known-acceptable) |
| **`picked_up_litter` = TRUE** | **`core.observations` row, `obs_kind='action'`, `intervention='picked_up_litter'`** | ✅ routed (row exists) |
| **`emptied_trash` = TRUE** | `core.observations` action row `intervention='emptied_trash'` | ✅ routed (row exists) |
| **`washed_shelter` = TRUE** | `core.observations` action row `intervention='washed_shelter'` | ✅ routed (row exists) |
| **`washed_pad` = TRUE** | `core.observations` action row `intervention='washed_pad'` | ✅ routed (row exists) |
| **`washed_can` = TRUE** | `core.observations` action row `intervention='washed_can'` | ✅ routed (row exists) |
| **any action = FALSE** | **NO row** — falseness encoded by ABSENCE | ✅ routed (reconstructed `false` by the fixed-key pivot `COALESCE(bool_or(...), false)`) |
| `photo_keys` | `core.evidence` (via `stop_photos` → `visit_id`) | ✅ routed |
| `org_id` | `core.observations.org_id` / `core.visits.org_id` | ✅ routed |

### The absence=false correctness requirement (both directions)
- **TRUE → row.** Each TRUE action on a clean_logs row corresponds to exactly one
  `core.observations` action row with the matching `intervention` key.
- **FALSE → no row, still recoverable.** A FALSE action writes no row; the canonical
  reader (`cleanLogsCanonicalQuery.ts`) iterates the **fixed** `CLEAN_ACTION_KEYS` set
  and emits `COALESCE(bool_or(o.intervention='<key>'), false)` — so absence yields an
  explicit `false`, never null/missing.
- **FALSE is distinguishable from never-recorded.** The **completed visit**
  (`v.outcome='completed' AND v.ended_at IS NOT NULL`) is the anchor. A recorded stop
  with a false action = completed visit row exists + no action row. A never-recorded
  stop = no completed visit at all (excluded from the pivot). The two states are
  structurally distinct (see Verification).

## Changes
| Path | Change |
|---|---|
| `backend/src/domains/routeRunStop/cleanLogService.ts` | Removed `INSERT INTO clean_logs (…)` + its `photoKeysVal` feeder; replaced with a clip note; `cleanLogId` now sourced from the canonical `visitId` |
| `backend/tests/canonical/cleanLogsCanonicalPivot.test.ts` | Repointed the pivot's reference truth from the (no-longer-written) clean_logs mirror row to the written `ACTIONS` constant; added a positive write-clip assertion (`clean_logs` mirror rowCount = 0 after a live `completeStop`); refreshed header + teardown comments |

## Scope boundaries (explicitly NOT done)
- `public.clean_logs` table NOT dropped (Stage 3). Still exists post-clip.
- **No FK pointer to null.** Confirmed via `pg_constraint`: nothing points **at**
  `clean_logs` (`confrelid = clean_logs` → empty), and no `clean_log%` column exists in
  `public`/`core`. Unlike hazards (`route_run_stops.hazard_id`), there is no
  denormalized pointer to clip.
- No reader repointed (Capability Build). Readers reported below.
- No other table touched (`trash_volume_logs`, `stop_photos`, `hazards`,
  `infrastructure_issues` all untouched).
- No dead code deleted (`rebuildStopRiskSnapshotLegacy` etc. — that is the separate
  capstone deletion). Orphaned locals (`computedDuration`, the destructured action
  booleans, `photo_keys`) are intentionally left for that cleanup; `tsc` stays clean
  (no `noUnusedLocals`).

## Reader inventory (scheduled-repoint note for Capability Build)
Grepped repo-wide (not trusting the audit). The clean-logs **list endpoints**
(`/admin/clean-logs`, `/api/ops/clean-logs`) already read canonical only — verified by
`cleanLogsIdentity.test.ts` (handlers must not `FROM/JOIN clean_logs`). One **live**
reader remains pointed at the now-frozen mirror:

1. **`backend/src/domains/routeRun/loaders/loadRouteRunById.ts:81`** — `LEFT JOIN
   clean_logs cl ON cl.route_run_stop_id = rrs.id`, reading the 5 action booleans
   (`cl.picked_up_litter … cl.washed_can`, lines 63-67) for the route-run detail view.
   **LIVE reader, DATA columns only (no identity column read).**
   - **This is the clip, not a bug.** For stops completed **after** this clip there is
     no clean_logs row, so the LEFT JOIN returns `NULL` for the 5 booleans on the
     route-detail view. That NULL is the intended consequence of stopping the mirror
     write — it is not a regression to debug. If a future investigation finds the
     route-detail clean booleans going NULL for recent stops, **this clip is why.**
   - **Repoint = swap the LEFT JOIN to the existing `cleanLogsCanonicalQuery`**
     (already canonical — the absence⇒false action-row pivot is built and live behind
     the clean-logs list endpoints). It is a **one-line swap**, not new work: point
     the route-detail read at that pivot instead of `clean_logs`. The fix is already
     half-done. **Not repointed here by instruction** (Capability Build).

No other live reader of `public.clean_logs` exists in `src/`.

## Verification
- **Grep proof:** zero `INSERT INTO clean_logs` / `UPDATE clean_logs` in live `src/`.
  The only remaining `src/` reference is the LEFT JOIN read at `loadRouteRunById.ts:81`.
- `tsc --noEmit` clean; full backend suite **118/118** pass (incl.
  `cleanLogsCanonicalPivot.test.ts`, which now drives `completeStop` and asserts the
  mirror clip).
- **ABSENCE=FALSE proof (live DB, real completed visits).** For every existing
  completed visit, the legacy clean_logs booleans equal the canonical reconstruction
  `COALESCE(bool_or(o.intervention='<key>'), false)` **exactly**:
  - Visits with 2 action rows reconstruct 2 TRUE + 3 FALSE-by-absence — exact match.
  - Visits 91 & 94 have **0** action rows yet reconstruct all five as explicit
    `false`, with `visit_recorded = true` — proving FALSE comes from absence, and the
    completed visit is present as the anchor.
  - **Distinguishability:** `count(completed visits) = 6` (states A/B anchor) vs
    `count(route_run_stops with NO completed visit) = 6` (state C, never-recorded) —
    structurally distinct. A false action (visit exists, no action row) is therefore
    distinguishable from a never-recorded stop (no visit). **Losslessness PASS.**
- **DB before/after (write-clip delta):** the pivot test drives a real `completeStop`
  with a mixed action set (3 TRUE / 2 FALSE) and asserts, post-completion,
  `SELECT 1 FROM clean_logs WHERE visit_id = $1` → **rowCount 0** (mirror not written),
  while the canonical pivot reconstructs all 5 booleans exactly (the 2 FALSE via
  absence). Standing `public.clean_logs` row count unchanged across the run
  (7 → 7; the test cleans up its fixture).
- `public.clean_logs` table still exists; the `loadRouteRunById` reader untouched.

## Files touched
- `backend/src/domains/routeRunStop/cleanLogService.ts`
- `backend/tests/canonical/cleanLogsCanonicalPivot.test.ts`
