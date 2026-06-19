# 2026-06-18 — ISSUE-031 Stage 2: infrastructure_issues dual-write mirror clipped (LAST living-table clip)

## What changed
- Removed the `public.infrastructure_issues` mirror INSERT from the stop-completion
  write path. `createInfrastructureIssuesForRouteRunStop` (the adapter-mirror writer)
  was deleted from `infrastructureIssueService.ts`; only the `InfraIssueInput` type
  remains (still consumed by `completeStop` and the observation emitter to type their
  infra payload).
- Clipped the call in `cleanLogService.ts` (`completeStop`): dropped the
  `if (infraIssues …) { createInfrastructureIssuesForRouteRunStop(…) }` block and
  narrowed the import to the `InfraIssueInput` type only.
- After this change an infra-issue stop completion writes ONLY canonical: `core.visits`
  (already ensured at `completeStop` start) and the 8 specific infra `*_present`
  observation rows in `core.observations` (emitted by `emitObservationsForStop` from
  `uiPayload.infraIssueDetails` / `infrastructureIssues`, with cause/component/notes
  threaded into the observation payload). `public.infrastructure_issues` stops receiving
  new rows.
- **This is the LAST of the five living-table clips.** hazards, trash_volume_logs,
  clean_logs, and stop_photos are already Stage-2 clipped; level3_logs was already
  dropped. No living adapter table still receives dual-write from a live path.

## Field mapping (clip — ISSUE-034 founder decision, recon-confirmed)
| `public.infrastructure_issues` field | Canonical home |
|---|---|
| `issue_type` | the 8 disjoint infra `*_present` `observation_type` values (already the live type-discriminator for infra in `core.observations`) |
| `cause` / `component` / `notes` | `core.observations.payload` (additive, ISSUE-031 Step 5) |
| `photo_key` | `core.evidence` (existing canonical evidence path) |
| `visit_id` / `org_id` / `stop_id` / `asset_id` | `core.visits` + the visit→stop spine |
| `needs_facilities` | **DROPPED — not carried.** `NOT NULL DEFAULT true`, hardcoded `true` at the one write site (live: 2/2 rows `true`). Always-true-when-row-exists = zero information. Work-group routing derives from infra-type via org config, not from this column. (ISSUE-034 closed Won't-Do.) |
| `reported_by` | **Not carried — constant `0` (`LEGACY_TRANSIT_USER_ID`).** Carried no worker identity (live: 0/2 rows non-zero); identity-clip is a formality. |
| infra severity | **NULL in canonical — INTENTIONAL.** KCM does not grade infra magnitude; the canonical column is numeric-typed but unused for infra. No severity invented. |

The 8 canonical types: `glass_damage_present`, `graffiti_present`,
`receptacle_damage_present`, `shelter_panel_damage_present`, `lighting_failure_present`,
`access_obstructed_by_landscape`, `structural_damage_present`,
`other_infrastructure_issue_present`.

## CORRECTION — `route_run_stops.infra_issue_id` was never written
- `route_run_stops.infra_issue_id` has **always been NULL** — confirmed via `git log -S`
  across all of `backend/src` (only the DDL migration + the `populateEamBridge` READ
  appear; **zero** `SET`/`INSERT`) and via the live DB (0 rows set).
- Therefore `populateEamBridge.ts:58`'s `is_exception = (hazard_id IS NOT NULL OR
  infra_issue_id IS NOT NULL)` has **ALWAYS** evaluated the infra term as `false` — it was
  blind to infra issues before this clip and remains so after. **This clip changes
  `is_exception` by exactly nothing.**
- This corrects an inaccurate claim in the hazards Stage-2 changelog
  (`2026-06-18-issue-031-hazards-stage2-write-clip.md`), which stated "infra-driven
  `is_exception` continues counting until Capability Build repoints." That was **wrong**.
  The ISSUE-035 Capability-Build repoint for `populateEamBridge` must rebuild the **ENTIRE**
  `is_exception` derivation from canonical EXISTS — not restore one half — because **both**
  terms (`hazard_id` and `infra_issue_id`) have always been null/false in the adapter layer.

## Why
- Stage 2 of the ISSUE-031 adapter→core clip. Both losslessness prongs PASS: infra is
  type-distinguishable from `core.observations` alone via the 8 disjoint
  `observation_type` values (already the live discriminator), and the only two
  non-canonical fields (`needs_facilities`, infra severity) are zero-information /
  not-graded-at-source. The mirror is now redundant write amplification.
- The canonical infra observations were already emitted independently in `completeStop`
  (`emitObservationsForStop`, fed by `uiPayload`), and `visitId` is ensured at the top of
  `completeStop` — so removing the mirror (which only re-ensured the visit idempotently
  and wrote the adapter row) loses nothing.

## Scope boundaries (explicitly NOT done)
- `public.infrastructure_issues` table NOT dropped, `needs_facilities` column NOT
  dropped, NOT NULL constraint NOT altered (all Stage 3, post-Capability-Build). Verified
  the table still exists post-clip.
- `rebuildStopRiskSnapshotLegacy` (`riskMapService.ts:386`) — the legacy snapshot rebuild
  that reads `infrastructure_issues` — left untouched. It is the SEPARATE capstone
  dispatched next, not this card.
- Readers NOT repointed (Capability Build) — listed below for the ISSUE-035 punch-list.

## FK-pointer finding (`route_run_stops.infra_issue_id`)
- `route_run_stops.infra_issue_id` (FK → `public.infrastructure_issues`, `ON DELETE SET
  NULL`) **was never written by any code path** — confirmed across all git history of
  `backend/src` (`git log -S` finds only the DDL migration and the
  `populateEamBridge` read; no `SET`/`INSERT` of the column, ever) and confirmed live
  (0/N `route_run_stops` rows have it set). **This clip therefore nulls nothing** — the
  pointer was already always-NULL.
- ⚠️ This corrects an inaccurate assumption in the hazards Stage-2 changelog
  (`…hazards-stage2-write-clip.md`, "hazard_id reader recovery"), which stated the infra
  mirror "still writes `infra_issue_id`" so infra-driven `is_exception` would still
  count. It does **not** and never did: `populateEamBridge.fetchStops` `is_exception =
  (hazard_id IS NOT NULL OR infra_issue_id IS NOT NULL)` has **always** evaluated the
  infra term as `false`. EAM-bridge exception counting has been blind to infra all along;
  this clip changes that behavior by exactly nothing.

## Readers of `public.infrastructure_issues` (scheduled repoints — ISSUE-035 punch-list, NOT done here)
1. `adminRoutes.ts:1307` — **live.** Admin daily-summary `total_infra_issues` count
   (`SELECT COUNT(*) … WHERE reported_at >= CURRENT_DATE`). Post-clip this counts 0 for
   new days (frozen table). Repoint to count distinct visits with an infra `*_present`
   observation today.
2. `populateEamBridge.ts:58` (`fetchStops`) — **dormant FK pointer.** `(hazard_id IS NOT
   NULL OR infra_issue_id IS NOT NULL) AS is_exception`. Infra term already always-false
   (see FK-pointer finding). Repoint `is_exception` to the canonical EXISTS-on-
   `core.observations` infra pattern.
3. `riskMapService.ts:432` (`rebuildStopRiskSnapshotLegacy`) — **legacy verification
   path**, preserved verbatim under Tier 2 additive discipline. Not a repoint target;
   it is deleted by its own done-criteria (the next-dispatched capstone).

Canonical recovery path for all three: `core.visits.client_visit_id =
uuidv5("route-run-stop:" + routeRunStopId)` links stop↔visit deterministically; infra
presence is `core.observations.visit_id` with `observation_type` in the 8 infra
`*_present` types — already the live derivation used for `stop_effort_history.had_infra_issue`
(`cleanLogService.ts:215-228`).

## Verification
- Grep: zero `INSERT/UPDATE … infrastructure_issues` in live `src/` (only readers + the
  legacy capstone remain).
- `tsc --noEmit` clean; full backend suite **119/119** pass (added
  `infraIssuesWriteClip.test.ts`).
- New test drives the live `completeStop` write path with all 8 infra issue types:
  `public.infrastructure_issues` row count delta **0**; `core.visits` written; all 8
  infra `*_present` observations emitted to `core.observations` with cause/component/notes
  in payload; asserted NO `severity` and NO `needs_facilities` in payload.
- `reported_by = 0` and `route_run_stops.infra_issue_id` all-NULL confirmed live before
  the change; `public.infrastructure_issues` table still EXISTS (frozen, not dropped).

## Files touched
- `backend/src/domains/routeRunStop/infrastructureIssueService.ts`
- `backend/src/domains/routeRunStop/cleanLogService.ts`
- `backend/tests/canonical/infraIssuesWriteClip.test.ts` (new)
- `backend/tests/run.ts` (register new test)
