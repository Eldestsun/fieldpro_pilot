# 2026-06-18 — ISSUE-031 Stage 2: trash_volume_logs dual-write mirror clipped

## What changed
- Removed the `public.trash_volume_logs` mirror INSERT from the stop-completion
  write path (`completeStop` in `cleanLogService.ts`). The surrounding
  `if (trashVolume !== undefined)` block remains for the `route_run_stops.trash_volume`
  denormalized-scalar UPDATE (out of scope — different table, not a pointer to the
  mirror); only the `INSERT INTO trash_volume_logs (…)` was deleted and replaced with
  a clip note.
- After this change a trash volume reading writes ONLY canonical:
  `core.observations` with `observation_type = 'trash_volume'`, `payload.level`
  (emitted by `emitObservationsForStop` via `uiPayload.trash_volume`).
  `public.trash_volume_logs` stops receiving new rows.

## Why
- Stage 2 of the ISSUE-031 adapter→core clip. Losslessness was re-verified
  (`docs/audit/2026-06-18-issue-031-losslessness-reverify.md`): `trash_volume_logs.volume`
  → `core.observations` `payload.level`, exact. The mirror is now redundant write
  amplification.
- The canonical trash-volume observation was already emitted independently
  (`observationService.ts:196-199` writes `{ observation_type: 'trash_volume',
  payload: { level } }` when `ui.trash_volume !== undefined`), so removing the mirror
  does not lose the reading — it only stops the duplicate adapter row.
- Unlike the hazards clip, `trash_volume_logs` carries **no** worker-identity column
  (`reported_by` / `user_id` absent — see Field mapping). Attribution is indirect only,
  via `route_run_stop_id → route_runs`. Nothing identity-bearing is clipped here; this
  is a pure data mirror.

## Field mapping (mirror column → canonical home)
| `trash_volume_logs` column | Canonical home | Status |
|---|---|---|
| `id` (bigint PK) | N/A (adapter-only surrogate) | N/A |
| `route_run_stop_id` | `core.visits.client_visit_id` (uuidv5 of `route-run-stop:<id>`) | ✅ routed (indirect attribution; no identity) |
| `stop_id` (text) | `core.visits.location_id` via stop→location map / `core.observations.asset_id` | ✅ routed |
| `logged_at` | `core.observations.observed_at` | ✅ routed |
| **`volume` (smallint)** | **`core.observations.payload.level`** | **✅ routed (exact — the clip subject)** |
| `notes` (text) | `core.observations.payload.notes` | ✅ home exists; never written by the mirror INSERT (always NULL) → no loss |
| `asset_id` | `core.observations.asset_id` | ✅ routed |
| `visit_id` | `core.observations.visit_id` | ✅ routed |
| `org_id` | `core.observations.org_id` | ✅ routed |
| `created_at` / `updated_at` | adapter bookkeeping | N/A |

## Changes
| Path | Change |
|---|---|
| `backend/src/domains/routeRunStop/cleanLogService.ts` | Removed `INSERT INTO trash_volume_logs (…)`; kept `UPDATE route_run_stops SET trash_volume` (out of scope) and added a clip note |

## Scope boundaries (explicitly NOT done)
- `public.trash_volume_logs` table NOT dropped (Stage 3). Verified it still exists
  post-clip (`to_regclass('public.trash_volume_logs')` non-null).
- No FK pointer to null. Confirmed via `pg_constraint`: all four FKs point **outward**
  from `trash_volume_logs` (→ `route_run_stops`, `transit_stops`, `assets`,
  `core.visits`). There is **no** `route_run_stops`/`route_runs` column pointing at
  `trash_volume_logs` — so unlike hazards (`route_run_stops.hazard_id`), there is no
  denormalized pointer to clip. `route_run_stops.trash_volume` (smallint) is a
  denormalized scalar value, not a pointer, and is untouched by this clip.
- No reader repointed (Capability Build). Readers reported below.
- No other table touched (`clean_logs`, `stop_photos`, `infrastructure_issues`,
  `hazards` all untouched).

## Reader inventory (scheduled-repoint note for Capability Build)
Grepped repo-wide. All readers of `public.trash_volume_logs` are dead or non-production:
1. **`riskMapService.ts:414`** — `rebuildStopRiskSnapshotLegacy` `trash` CTE
   (`FROM trash_volume_logs`). **DEAD:** zero callers repo-wide (only the function
   definition references it). The two live callers — `riskMapJob.ts:14` and
   `adminRoutes.ts:950` — invoke the canonical `rebuildStopRiskSnapshot`, whose `trash`
   CTE already reads `core.observations` `payload.level` (`riskMapService.ts:106-124`).
   The active risk job is therefore unaffected by this clip.
2. **`core.v_trash_volume_logs_transit`** — already DROPPED
   (`20260613_p1_drop_dead_transit_views.sql`); `to_regclass` confirms it is gone.
3. **`tests/canonical/cleanLogsCanonicalPivot.test.ts:174`** — a teardown
   `DELETE FROM trash_volume_logs WHERE route_run_stop_id = $1`. Test cleanup only; no
   assertion reads the table. Post-clip it deletes 0 rows (idempotent, harmless).
- **Follow-up (Capability Build, NOT this card):** delete the dead
  `rebuildStopRiskSnapshotLegacy` function (its `level3_logs` / `hazards` /
  `infrastructure_issues` reads die with it). No live consequence to schedule — no
  active surface reads this mirror.

## Verification
- Grep: zero `INSERT INTO trash_volume_logs` / `UPDATE trash_volume_logs` in live
  `src/`. Remaining `src` references are comments + the dead legacy reader.
- `tsc --noEmit` clean; full backend suite 118/118 pass (incl.
  `cleanLogsCanonicalPivot.test.ts`, which drives `completeStop` with trash volume).
- DB before/after simulation (real local DB, real `completeStop`, rolled back):
  - **PRE-CLIP** (stashed code): `trash_volume_logs` 5→6 (**delta +1**, 1 row for the
    visit), canonical `trash_volume` obs written `payload.level = 3`.
  - **POST-CLIP**: `trash_volume_logs` 5→5 (**delta 0**, 0 rows for the visit),
    canonical `trash_volume` obs written `payload.level = 3` (input was 3).
  - Confirms the mirror is the only thing removed and the canonical write is independent.
- `public.trash_volume_logs` table still exists; readers untouched.

## Files touched
- `backend/src/domains/routeRunStop/cleanLogService.ts`
