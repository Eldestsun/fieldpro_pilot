# 2026-07-09 — SEAM-A: Dispatch live-monitoring polish

**Branch:** `feat/seam-a-dispatch-monitoring` · **Type:** Feature (capability build)
**Gate:** SEAM-C on origin/main (incl. `bc2f7cb`) · **Source:** `docs/audit/2026-07-07-dispatch-surface-live-inventory.md`
**Commits:** ede846e (A1), e6c2caf (A2), 08f09fd (A3), 6736075 (A4)

Four Dispatch route-surface improvements. Exceptions and progress attach to the RUN,
never a worker; no names on badges, no time/pace, no per-worker grouping in any SQL.

## A1 — X-of-Y stop progress (ede846e)

`LeadRoutesPanel` (which reads `/ops/route-runs`) rendered only the total stop count. Now
renders `completed_stops of stop_count` per row in both the active and completed tables,
from fields the endpoint already returns — **no backend change**. Added `completed_stops`
to the `OpsRouteRun` type (`getOpsRouteRuns` already passed it through).

## A2 — per-run exception badges (e6c2caf)

`/ops/route-runs` now returns per-RUN exception counts:
- `hazard_count` — canonical SAFETY presence observations on the run's visits, via the
  SEAM-C spine (`visit → assignment.source_ref = run`), using the shared
  `presenceTaxonomy.SAFETY_PRESENCE_TYPES` (imported, param-passed — never a copied list).
- `skipped_count` — `route_run_stops.status = 'skipped'`.
- `emergency_count` — `route_run_stops.origin_type <> 'planned'` (the historical field name;
  **displayed as "unplanned"** per ruling 3; the `ul_ad_hoc` data value is read-only).

All counts `::int`, org-scoped by the handler's existing `withOrgContext` (PATTERN-001).
Frontend `RunExceptionBadges` renders **only non-zero counts** — silence = clean; a
"0 hazards" badge would be assumed-dirty framing (prohibited). `/lead/todays-runs` (dead
to the frontend) was **not** touched per ruling 1 (its retirement is carded as SEAM-A-R1).

## A3 — 30s polling (08f09fd)

`LeadRoutesPanel` now mirrors `AdminControlCenter`: initial fetch + `setInterval(fetchRuns,
30_000)` with `clearInterval` on unmount, plus a `visibilitychange` handler that pauses when
the tab is hidden and resumes+refreshes when visible. `fetchRuns` memoized via `useCallback`.

## A4 — reassign control + drop dead user_id (6736075)

`LeadRouteDetail` shows the current assignee by **name** (`assigned_user.display_name` — the
R11 exposure kept by SEAM-C; never an OID) and a Reassign control: a dropdown of eligible
workers (`fetchUlUsers`, labels are names, value is the OID), a confirm button,
`PATCH /route-runs/:id/assign { assigned_user_oid }` on submit, refetch the detail on 200,
error surfaced on 4xx. The OID is a write of assignment intent, never displayed.

Dropped the dead `user_id` sentinel (`LEGACY_TRANSIT_USER_ID = 0`) from the `loadRouteRunById`
detail payload and the `RouteRun` frontend type — zero consumers (A4-rider proof; the only
`user_id` reference was the type field). Added `assigned_user`/`created_by` (name/role only)
to the `RouteRun` type.

## Verification

- Backend **169/0** (baseline 168 + 1 A2 test), frontend **37/0** (baseline 27 + 10). tsc
  clean both. Zero regressions.
- Red-demos (clean tree first, per the tightened rule): A2 (revert hazard subquery to clipped
  `public.hazards` → 3 fail) and A4 (restore `user_id` to the detail → 1 fail); both restore
  to green. A1/A3 tests are directly coupled to the rendered output / timer.
- **Labor-safety re-scan:** `/ops/route-runs` counts carry no identity; the detail returns only
  the sanctioned R11 names (no `*_oid`, no `user_id`); new frontend identity is limited to the
  assignee name display + the A4 reassign dropdown (names shown, OID only as the write value).
- **Ordering audit:** `/ops/route-runs` `ORDER BY rr.created_at DESC` (run-level, unchanged);
  `loadRouteRunById` `ORDER BY rrs.sequence` (unchanged). No execution-order sorting entered.

## New tests

- `frontend .../LeadRoutesPanel.test.tsx` — A1 X-of-Y (2), A2 badges non-zero-only + unplanned
  wording + absence (3), A3 fake-timer polling (1).
- `frontend .../LeadRouteDetail.test.tsx` — A4 reassign payload+refetch, assignee-by-name,
  dropdown-labels-are-names, 4xx error (4).
- `backend .../opsRouteRunsExceptions.test.ts` — handler-coupled A2 counts (absence⇒0,
  seeded⇒1, no identity).
- `backend .../loadRouteRunOidTrim.test.ts` — extended: detail payload asserts `user_id` absent.

## Files touched

- Backend: `modules/ops/opsRoutes.ts`, `domains/routeRun/loaders/loadRouteRunById.ts`
- Frontend: `api/routeRuns.ts`, `components/LeadRoutesPanel.tsx`, `components/LeadRouteDetail.tsx`
