# 2026-09-04 — T1-D4: Reassign UI on live route runs — close the SEAM-A A4 gaps

## What changed
- `frontend/src/api/routeRuns.ts`: `reassignRouteRun` signature widened to
  `assignedUserOid: string | null` — `null` is the cancel value (backend writes
  `assignment.cancel`); `""` is never sent (API 400s it).
- `frontend/src/components/LeadRouteDetail.tsx`:
  - New "Clear assignment" button (outline variant) beside Reassign — rendered
    only when the run has a current assignee; sends `null` and refetches.
  - The entire reassign block is now hidden when `status === 'completed'`
    (nothing to move on a finished run).
- 3 new component tests in `LeadRouteDetail.test.tsx`: clear sends `null`
  (never `""`) + refetches; Clear absent when unassigned; whole control hidden
  on completed runs. File 8/8, frontend suite 98/98, tsc clean.

## Why
- T1-D4's spec (2026-05-19) predates SEAM-A A4, which already shipped most of
  the card: the inline reassign control, `reassignRouteRun`, `fetchUlUsers`,
  name-only assignee display, refetch-on-success, and error surface — with
  existing tests. This change closes the two done-criteria A4 did not cover
  (clear-assignment and the completed-run guard) rather than rebuilding the
  shipped inline control as the spec's modal. Departure from spec ("modal with
  confirm") noted deliberately: the inline pattern is the live, tested design;
  spec is stale against it, same build-to-live-behavior ruling as T1-A6.
- Spec staleness also verified against ISSUE-062: assignment lives in the
  `route_run_assignment` sidecar (not `route_runs.assigned_user_oid` as the
  spec claims), endpoint roles are `["Dispatch","Admin"]` post-rename, and the
  run payload exposes assignee name/role only (SEAM-C) — all confirmed live.

## Labor safety
- No new identity exposure: the picker shows `displayName (role)` with the OID
  as the write value only (pre-existing A4 pattern). No per-worker metrics, no
  workload badges. The cancel audit row carries an empty detail — worker OIDs
  intentionally absent (verified in smoke).

## Files touched
- `frontend/src/api/routeRuns.ts`
- `frontend/src/components/LeadRouteDetail.tsx`
- `frontend/src/components/__tests__/LeadRouteDetail.test.tsx`
- `docs/changelog/capability-build/2026-09-04-t1-d4-reassign-ui.md` (this entry)

## Smoke test (real-Entra Dispatch session, dev backend — DB left as found)
Scaffold run #4448 created THROUGH THE UI (ad-hoc create, stops 108+111,
assigned to the signed-in Dispatch user — first post-OSRM-fix Save Route,
which also proves route creation E2E). Then on `/routes/4448`:
1. Reassign → "Specialist": UI refetched to the new name; sidecar
   `assigned_user_oid` updated; `assignment.reassign` audit row written.
2. Clear assignment: UI → "Unassigned", Clear button disappeared; sidecar
   nulled; `assignment.cancel` audit row written with empty detail (no worker
   OID — labor-safety contract held).
Cleanup: run #4448 + its stops + assignment row deleted (0 residue). The three
`assignment.*` audit rows for resource 4448 are retained deliberately — the
audit log is append-only evidence and records real API use.
Founder-created run #4447 observed during the session and left untouched.

## Observation (not fixed — board note)
The Create Route dialog requires a Route Pool selection even on the Ad-hoc
Stops tab (Generate Preview stays disabled without one), though the backend
accepts pool-less ad-hoc runs. Minor validation wart; noted for the board.
