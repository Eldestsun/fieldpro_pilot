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
