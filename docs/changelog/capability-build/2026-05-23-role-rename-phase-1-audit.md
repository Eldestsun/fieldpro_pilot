# 2026-05-23 — Role rename Phase 1 audit: widen missed guards + /users SQL filter

## What changed

- Widened 16 backend role guards that were skipped by the Phase 1 sweep (commit `4b2530a`) so they dual-accept the new role names alongside the old ones:
  - `backend/src/modules/work/ulRoutes.ts`: 4 guards — `["UL"]` → `["UL","Specialist"]`; three `["UL","Lead","Admin"]` → `["UL","Specialist","Lead","Dispatch","Admin"]`
  - `backend/src/modules/routes/routeRunRoutes.ts`: 9 guards — `["Lead"]` → `["Lead","Dispatch"]`; five `["Lead","Admin"]` → `["Lead","Dispatch","Admin"]`; three `["UL","Lead","Admin"]` → `["UL","Specialist","Lead","Dispatch","Admin"]`
  - `backend/src/modules/work/routeRunStopRoutes.ts`: 3 guards — `["UL","Lead","Admin"]` → `["UL","Specialist","Lead","Dispatch","Admin"]`
- Widened the SQL filter in `GET /api/users` (`backend/src/modules/admin/resourceRoutes.ts:163`) from `WHERE last_seen_role IN ('UL', 'Lead')` to `IN ('UL', 'Specialist', 'Lead', 'Dispatch')`. Post-backfill this was silently returning zero rows because the directory holds only the new role names.
- Added two regression tests at the HTTP boundary (`backend/tests/canonical/roleRenamePhase1Audit.test.ts`):
  1. A Dispatch-only dev-bypass token can `GET /api/lead/route-runs/:id` and receives 200, not 403.
  2. `GET /api/users` returns the backfilled `Specialist` and `Dispatch` rows from `identity_directory`.

## Why

- A Dispatch user opening a route from `/routes` hit a 403 on `GET /lead/route-runs/1167`. The backend `[AUTHZ] forbidden` log showed `required: ['Lead','Admin'], got: ['Dispatch']` — the guard was missed in Phase 1's dual-accept sweep.
- A full re-audit of `grep -rn "requireAnyRole\|requireRole" backend/src/` revealed Phase 1's coverage claim ("25 backend guards, the /api/users SQL filter") was materially wrong: three route files (`routeRunRoutes.ts`, `ulRoutes.ts`, `routeRunStopRoutes.ts`) and the `/users` SQL filter were untouched.
- The `/api/users` filter miss is the more severe of the two: post-backfill it returns zero users, breaking the admin user-listing UI silently. Field surface was the Dispatch 403 because nobody had loaded the user picker yet against backfilled data.
- The Phase 1 changelog promised this would be locked in by tests; it wasn't. The two regression tests added here make a future re-narrowing (intentional Phase 3 cleanup, accidental revert) fail in CI rather than as a field 403.

## Verification

Backend grep proof of completeness (run after the widening):

```
$ grep -rn "requireAnyRole\|requireRole" backend/src/ --include="*.ts" \
    | grep -E "'Lead'|'UL'" | grep -vE "Dispatch|Specialist"
(empty output — no remaining old-only guards)
```

The five intentional `Admin`-only governance guards (`adminRoutes.ts:14`, `exportDeleteRoutes.ts:16`, `tenantRoutes.ts:23`, `healthRoutes.ts:157,196`) do not contain `'Lead'`/`'UL'` and so are not matched by this grep — empty output is the correct "all clean" signal.

Test counts:
- Backend: 106/0 (was 104/0; +2 new HTTP-boundary regression tests)
- Frontend: unchanged (frontend already dual-accepted in Phase 1; re-audit confirmed no misses)

## Files touched

- `backend/src/modules/admin/resourceRoutes.ts` (SQL filter)
- `backend/src/modules/routes/routeRunRoutes.ts` (9 guards)
- `backend/src/modules/work/routeRunStopRoutes.ts` (3 guards)
- `backend/src/modules/work/ulRoutes.ts` (4 guards)
- `backend/tests/canonical/roleRenamePhase1Audit.test.ts` (new — 2 HTTP regression tests)
- `backend/tests/run.ts` (wire new test file into runner)
- `docs/changelog/capability-build/2026-05-23-role-rename-phase-1-audit.md` (this file)
- `docs/KNOWN_ISSUES.md` (`ISSUE-015` — see below)

## Related — logged in the same commit

`ISSUE-015` (`docs/KNOWN_ISSUES.md`) — open product question that surfaced during live verification of this fix, unrelated to the role rename itself. `GET /api/lead/route-runs/1167` (org 1, Dispatch token) returns 404, not the 200 we expected, because the `route_run` exists with zero `route_run_stops` and the loader's `INNER JOIN route_run_stops` returns no rows. Logged as a question (legitimate intermediate state vs orphan data) for the Dispatch-surface UX pass with the Lead, not a fix. The guard fix itself is verified: a route_run *with* stops (e.g. id 712 in org 1) returns a full 200 payload to the same Dispatch token.
