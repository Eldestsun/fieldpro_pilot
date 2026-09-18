# 2026-09-17 — ISSUE-073 (A1+B1): unable-to-access — the non-safety non-service path

## What changed
- **New endpoint `POST /route-run-stops/:id/unable-to-access`** (Specialist/
  Dispatch/Admin): records a stop the worker could not reach. Atomic
  transaction (ISSUE-051 discipline): `route_run_stops.status='skipped'`
  (adapter scaffolding reuses the terminal workflow status — `route_run_stops`
  is not the system of record), canonical visit closed with
  **`outcome='unable_to_access'`** + `reason_code=<specific reason>`, optional
  note upserted to `core.visit_notes (category='access')`, route-run completion
  check — all in one commit. Requires an **obstruction photo** (DB-verified
  `core.evidence kind='access'`, same posture as the safety-skip gate).
- **CONTAMINATION GUARD (the point of the card): zero observations emitted.**
  An access failure asserts nothing about the asset — the worker never reached
  it. Folding it into `safety` would pollute the hazard signal the labor-safety
  story depends on. `reason_code` carries the SPECIFIC reason here (unlike the
  safety-skip's category `'safety'`) because there are no presence observations
  to hold the specifics — the worker never assessed the asset.
- **Reason vocabulary** (`construction`, `vehicle_blocking`, `road_closed`,
  `other`) is transit-adapter capture language; the outcome is core grammar
  (§3.2 lists `unable_to_access`) — the same core/adapter split as the registry
  types and §3.6 note categories.
- **Offline durability (B1 — offline freeze LIFTED BY FOUNDER for this scoped
  change):** new durable `UNABLE_TO_ACCESS` action in `offlineQueue.ts` —
  replay tier 3 alongside skip (after the kind='access' photo at tier 2, never
  after a COMPLETE), skip-style per-stop dedup, `ALREADY_SKIPPED` treated as
  success. Executor in `OfflineSyncManager` retries on missing-photo (photo
  replays first); `useTodayRoute.handleUnableToAccess` enqueues + optimistic
  terminal state.
- **UI (`StopDetail.tsx`):** "CAN'T ACCESS STOP" control **outside** the Report
  Safety modal (deliberately — an unreachable stop must never route through
  hazard capture), opening a modal with the 4-reason picker, required
  obstruction photo (uploads/queues as kind='access'), optional notes, and a
  cannot-be-undone confirm.
- **Control Center "Skips by Reason"** widened to
  `outcome IN ('skipped','unable_to_access')` — non-serviced stops surface
  under their specific access reason instead of silently vanishing ("surfaces,
  never silently concludes").
- **Migration `20260917_issue073_visit_notes_access_category.sql`:** widens the
  `core.visit_notes` category CHECK to `('safety','infra','access')` — the
  §3.6-anticipated one-line extension. Idempotent, runner-recorded.
- **Design doc ratified:** §3.5 and §8b now name `unable_to_access` as the
  second non-service outcome (with the no-observations rule); §3.6 category
  vocabulary gains `'access'`. OpenAPI regenerated (51 paths).

## Why
- There was NO field path for "couldn't service, not a safety hazard" (locked
  gate, construction, blocked pad). The worker's options were fabricating a
  safety hazard — contaminating the hazard signal — or recording nothing.
  Founder decision (2026-09-17): A1 (design-correct outcome) + B1 (freeze lift
  for a first-class durable offline action). The founder's stated rationale:
  contamination prevention, not frequency.

## Verification
- Backend **226/226** (223 + 3 new in `unableToAccess.test.ts` over the real
  HTTP handler: success case asserts outcome/reason_code/note AND **zero
  observations**; photo-less → 400; unknown reason → 400). Frontend
  **119/119**; `tsc` clean both workspaces.
- Migration applied + recorded on dev (ISSUE-038 same-step); **clean-room gate
  exit 0** with the widened CHECK present on a fresh build.
- `pg_state.sql` regenerated locally (gitignored).

## Files touched
- `backend/migrations/20260917_issue073_visit_notes_access_category.sql` (new)
- `backend/src/modules/work/routeRunStopRoutes.ts` (new endpoint)
- `backend/src/modules/admin/controlCenterRoutes.ts` (skips query widened)
- `backend/tests/canonical/unableToAccess.test.ts` (new), `backend/tests/run.ts`
- `backend/openapi/openapi.json` / `openapi.yaml` (regenerated)
- `frontend/src/offline/offlineQueue.ts` (FROZEN — founder-lifted, 3 minimal blocks)
- `frontend/src/offline/OfflineSyncManager.tsx` (executor)
- `frontend/src/hooks/useTodayRoute.ts` (handler)
- `frontend/src/api/routeRuns.ts` (client fn)
- `frontend/src/components/TodayRouteView.tsx` (wiring)
- `frontend/src/components/today-route/StopDetail.tsx` (button + modal)
- `planning/architecture/CANONICAL_STATE_LAYER_DESIGN.md` (§3.5, §8b, §3.6)
- `docs/changelog/capability-build/2026-09-17-issue-073-unable-to-access.md` (this entry)
