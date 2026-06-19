# 2026-06-18 — ISSUE-031 Stage 2: hazards dual-write mirror clipped

## What changed
- Removed the `public.hazards` mirror INSERT from the hazard submission write path.
  `createHazardForRouteRunStop` (the adapter-mirror writer) was deleted from
  `hazardService.ts`; only the shared `toNumericSeverity` severity scale remains
  (still consumed by the canonical path in `observationService.ts`).
- Clipped both live hazard write paths in `routeRunStopRoutes.ts`:
  - **skip-with-hazard** (`POST /route-run-stops/:id/skip-with-hazard`): dropped the
    `createHazardForRouteRunStop` call and the `hazard_id = $1` clause from the
    `route_run_stops` status UPDATE (mirror FK pointer).
  - **complete-with-safety** (`POST /route-run-stops/:id/complete`): dropped the
    `if (safety …) { createHazardForRouteRunStop; UPDATE … SET hazard_id }` block.
  - Removed the now-unused `createHazardForRouteRunStop` import.
- After this change a hazard submission writes ONLY canonical: `core.visits`,
  `core.observations`, `core.evidence`, and the grant-walled
  `core.observation_actor_audit`. `public.hazards` stops receiving new rows.

## Why
- Stage 2 of the ISSUE-031 adapter→core clip. Losslessness was verified
  (`docs/audit/2026-06-18-issue-031-losslessness-reverify.md`): every field
  `public.hazards` captured has a canonical home, and the actor-audit sidecar wall
  was verified intact. The mirror is now redundant write amplification.
- The canonical hazard observation was already emitted independently in both paths
  (skip: `emitObservationsForStop`; complete: `completeStop` → `emitObservationsForStop`
  via `safety`), so removing the mirror does not lose the hazard — it only stops the
  duplicate adapter row and its `route_run_stops.hazard_id` FK pointer.

## Scope boundaries (explicitly NOT done)
- `public.hazards` table NOT dropped (Stage 3, blocked on Capability Build retiring
  readers). Verified the table still exists post-clip.
- Dormant readers of `public.hazards` (admin daily-summary `adminRoutes.ts`,
  EAM-bridge `populateEamBridge.ts`, `riskMapService.ts`) left untouched and still
  point at the now-frozen table by design — Capability Build repoints them.
- `infrastructure_issues` write path untouched (held on ISSUE-034, `needs_facilities`
  canonical home).
- Constant-0 `reported_by` handling and the actor-audit sidecar write untouched —
  actor identity still flows only to the grant-walled `core.observation_actor_audit`.

## hazard_id reader recovery (Capability Build follow-up)
Nulling `route_run_stops.hazard_id` for new rows is a clean clip, not a lost
association. The column is a denormalized convenience pointer that duplicates the
canonical `core.observations ↔ core.visits` link; it was never the sole link.

- **Readers of the `route_run_stops.hazard_id` column** (grepped repo-wide; everything
  else is DDL/FK, and `safety_risk_mv_recent_hazard_idx` is an index on
  `safety_risk_mv`, not on this column):
  1. `adminRoutes.ts:1286` — dormant admin daily-summary (`LEFT JOIN public.hazards h
     ON h.id = rrs.hazard_id` for skip "reason").
  2. `populateEamBridge.ts:58` (`fetchStops`) — `(hazard_id IS NOT NULL OR
     infra_issue_id IS NOT NULL) AS is_exception`.
- **Canonical recovery path:** `core.visits.client_visit_id =
  uuidv5("route-run-stop:" + routeRunStopId)` (`visitService.ts:12`) links stop↔visit
  deterministically; the hazard is `core.observations.visit_id` with
  `observation_type IN (encampment_present, fire_present, dangerous_activity_present,
  drug_use_present, violence_present, biohazard_present, access_blocked,
  other_safety_concern_present)`. This is **already** how `cleanLogService.ts:194-207`
  derives `had_hazard` for `stop_effort_history` — the canonical signal exists and is
  in active use, and is richer (hazard types + `norm_severity` + `payload.notes`).
- **Follow-up (Capability Build, NOT this card):** repoint both readers to the
  canonical EXISTS-on-`core.observations` pattern. Until then, the EAM-bridge
  `is_exception` will compute from `(NULL OR infra_issue_id)` for new completed runs —
  so **hazard-only** exceptions stop being counted there (infra-driven still count,
  since the infra mirror is held on ISSUE-034 and still writes `infra_issue_id`). This
  is the designed consequence of freezing the mirror; no canonical data is lost.

## Verification
- Grep: zero `INSERT/UPDATE … hazards` and zero `SET hazard_id` in live `src/`.
- `tsc --noEmit` clean; full backend suite 118/118 pass (incl. `eamBridge.test.ts`,
  `hazardSeverityCarry.test.ts`).
- Simulated complete-with-safety submission: `public.hazards` count 2→2 (delta 0),
  `core.visits` written, `core.observations` hazard row written
  (`encampment_present`, obs_kind `presence`, `norm_severity = 3`),
  `route_run_stops.hazard_id = NULL`.

## Files touched
- `backend/src/domains/routeRunStop/hazardService.ts`
- `backend/src/modules/work/routeRunStopRoutes.ts`

## CORRECTION (appended 2026-06-18, discovered during infra Stage-2 clip)
- The interim note in this changelog incorrectly stated that the infra half of
  `is_exception` (`infra_issue_id IS NOT NULL`) would continue counting until Capability
  Build.
- Subsequent investigation during the infra Stage-2 clip (2026-06-18) established that
  `route_run_stops.infra_issue_id` was **never written** by any code path in any commit —
  always NULL, always false, independent of any clip.
- See `docs/changelog/refactor/2026-06-18-issue-031-infra-issues-stage2-write-clip.md` for
  the full correction.
- The ISSUE-035 Capability-Build repoint for `populateEamBridge` must rebuild the **full**
  `is_exception` derivation from canonical EXISTS (both hazard safety-presence types and
  infra `*_present` types), not restore one adapter half.
