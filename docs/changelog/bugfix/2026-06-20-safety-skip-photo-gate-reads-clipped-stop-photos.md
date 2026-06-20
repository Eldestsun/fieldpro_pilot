# 2026-06-20 — Bugfix: safety-skip silently failed — photo gate read the clipped, empty `public.stop_photos`

## Symptom
Skipping a stop for safety (`POST /api/route-run-stops/:id/skip-with-hazard`) silently
failed. The stop stayed `in_progress` in the route stop list (never flipped to
`skipped`), while the stop-detail view showed optimistic local state (the entered
hazard + severity, labelled "completed") that had never synced to the server.

Ground truth for the affected stop (rrs 266 / stop 80580) confirmed the skip never
persisted server-side: `route_run_stops.status = 'in_progress'`, `completed_at = NULL`,
`core.visits.outcome = NULL` (visit started, never closed), **0** observations — but a
safety photo **was** present in `core.evidence` (`kind='safety'`).

## Root cause
A **missed reader repoint** off a clipped adapter table.

`stopPhotosService.ts` has three sibling functions:
- `createStopPhotos` — writes photos to **`core.evidence`** only (the `public.stop_photos`
  mirror write was clipped in ISSUE-031 Stage 2).
- `listStopPhotosByRouteRunStop` — repointed to read **`core.evidence`** in ISSUE-036.
- `countStopPhotosByRouteRunStop` — **was missed**: it still ran
  `SELECT COUNT(*) FROM stop_photos`.

Because photos now land only in `core.evidence` and `public.stop_photos` is frozen-empty
post-clip, `countStopPhotosByRouteRunStop` returned **0 for every stop**. The
skip-with-hazard endpoint uses that count as its mandatory safety-photo gate
(`count === 0 → 400 "A safety photo is required to skip a stop"`), so it returned 400
before any state was written — the skip never persisted, and the stop stayed
`in_progress`.

The completion endpoint's "after photo" gate uses the same counter but was **masked**:
it also accepts inline `photo_keys`, which the completion flow always sends, so the
broken count never mattered there. The skip path has no such fallback, so it was the
one that visibly broke.

### Second defect found and fixed: RLS context
`countStopPhotosByRouteRunStop` was called with the bare module `pool`, not an
org-scoped connection. `core.evidence` / `core.visits` are `FORCE ROW LEVEL SECURITY`.
Under the current **fail-open** `org_isolation` policy (the fail-open→fail-closed work,
DQ-2/ISSUE-018, has not landed) a missing `app.current_org_id` does not filter — so dev
masked it. Once RLS goes fail-closed in production, a bare-pool query would silently
count 0 and re-break the skip. Per the CLAUDE.md RLS hard rule (PATTERN-001: "App code
that queries RLS tables must use `withOrgContext` — never bare `pool.query()`"), the call
sites now pass an org-scoped connection.

## Changes
| Path | Change |
|---|---|
| `backend/src/domains/routeRunStop/stopPhotosService.ts` | `countStopPhotosByRouteRunStop` repointed from `public.stop_photos` to `core.evidence`, using the same join as `listStopPhotosByRouteRunStop` (`route_run_stop_id → deriveClientVisitId → core.visits.client_visit_id → core.visits.id = core.evidence.visit_id`, filtered by `e.kind`). |
| `backend/src/modules/work/routeRunStopRoutes.ts` | Skip-with-hazard (`:192`): pass the org-scoped `client` (org context already set) instead of bare `pool`. Complete (`:448`): wrap the pre-transaction count in `withOrgContext(orgId, …)` (the transaction's org-scoped client isn't created until later). Added `withOrgContext` to the `db` import. |

## Why this resolves the reported behavior
- The skip endpoint's photo gate now sees the safety photo that is actually in
  `core.evidence` → the skip persists: `route_run_stops.status = 'skipped'`,
  `core.visits.outcome = 'skipped'`, and the hazard observation is emitted to canonical.
- With `status = 'skipped'`, both surfaces already render correctly:
  - `StopListItem` maps `skipped → "Skipped"` badge (the "in progress" / "completed"
    mislabel was a side effect of the failed skip showing un-synced local state).
  - `StopDetail` keys off `status === 'skipped'` to show "This stop was skipped for
    safety."

  No frontend change was required — the frontend was correct; it was starved of the
  `skipped` status because the write never happened.

## Verification
- `tsc --noEmit` clean (backend).
- Backend test suite: 119/119 pass (no test directly covered this counter; evidence
  tests use `createStopPhotos` and are unaffected).
- DB-layer proof (rrs 266 safety photo in `core.evidence`):
  - old query `… FROM stop_photos`: **0**
  - new query `… FROM core.evidence … kind='safety'`: **1**
  - RLS check as `fieldpro`: returns 1 with `app.current_org_id` set (fail-open policy
    also returns 1 when unset today; the `withOrgContext` wrap keeps it correct once
    fail-closed lands).
- End-to-end through the real UI: re-trying the safety-skip on stop 80580 against the
  fixed backend succeeded — `route_run_stops.status='skipped'`, `core.visits.outcome='skipped'`,
  observation `encampment_present` emitted; the route stop list now shows the **"skipped"**
  badge for stop 80580 (other three stops "done").

## Follow-ups (not in this fix)
- Add a regression test asserting `countStopPhotosByRouteRunStop` counts `core.evidence`
  rows (and that skip-with-hazard succeeds when a `core.evidence` safety photo exists).
- Stale comment in `createStopPhotos` still says `listStopPhotosByRouteRunStop` reads the
  frozen `public.stop_photos`; ISSUE-036 already repointed it. Cosmetic; left untouched here.
- This is the same class of "missed reader repoint off a clipped adapter table" tracked by
  the ISSUE-035 punch-list / ISSUE-036; worth a sweep for any other `FROM stop_photos`
  (or other clipped-table) readers still in app code.

## Files touched
- `backend/src/domains/routeRunStop/stopPhotosService.ts`
- `backend/src/modules/work/routeRunStopRoutes.ts`
