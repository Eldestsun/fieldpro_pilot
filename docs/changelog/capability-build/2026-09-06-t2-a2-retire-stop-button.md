# 2026-09-06 — T2-A2: Retire stop button (Admin) + retirement actually bites on planning

## What changed
- **Backend (`adminStopService.ts`)** — the spec's "no backend changes" premise was
  false against live code, three ways:
  1. `updateStop` did NOT accept `active` (the OpenAPI schema advertised it — doc
     drift; the spec's audit verified the annotation, not the service). Now handled.
  2. `updateStop` also silently dropped `is_hotspot`/`compactor`/`has_trash` —
     AdminStopsPanel's per-row flag toggles have been PATCHing into the
     `fields.length === 0 → null → 404` path (pre-existing bug, bulk toolbar was
     unaffected). Fixed in the same block; regression-tested.
  3. `listStops` returned retired stops. Now defaults to `active = true` with an
     `include_retired` opt-in; `active` added to SELECT/RETURNING and the `Stop` type.
- **`adminRoutes.ts`**: GET `/admin/stops` parses `?include_retired=true`; PATCH
  audit `admin.stop_edit` detail now records `{ active: { from, to } }` when the
  active flag changes (per spec §6), via a prior-value read in the same org context.
- **`routeRunService.getCandidateStopsForPoolWithRisk`**: `WHERE s.active = true` —
  without this, "retired" was cosmetic: the planner would keep scheduling the stop.
  The ad-hoc picker is covered automatically (it searches via `listStops`).
- **Frontend**: `active` on `NormalizedAdminStop` (+ normalizer, default true);
  `include_retired` param on `getAdminStops`/`getStopsScoped`; AdminStopsPanel gets
  an Active column (Retire button → ConfirmDialog with the spec's copy; Reactivate
  direct, no dialog), "Retired" badge, faded rows (new optional
  `DataTable.getRowClassName`), and a "Show retired" checkbox (admin scope only —
  the ops read-only surface shows the badge but no controls and no checkbox).
- **Tests**: 3 backend (`tests/canonical/adminStopRetire.test.ts`: active
  round-trip + default-hide/opt-in-reveal; planner exclusion with membership still
  active; single-flag PATCH no longer 404s) and 7 component
  (`AdminStopsPanel.test.tsx`: default param, show-retired refetch, confirm-gated
  retire, cancel sends nothing, dialog-free reactivate, badge, ops read-only).
  Backend 205/205, frontend 105/105, tsc clean.

## Why
- Admins could not retire a stop from the UI; worse, the underlying PATCH field was
  advertised but unimplemented, and even a DB-flipped `active=false` changed nothing
  operationally. This change makes retirement real end-to-end: hidden from lists,
  excluded from pool planning and the ad-hoc picker, reversible, and audited with
  the transition.

## Files touched
- `backend/src/services/adminStopService.ts`
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/src/domains/routeRun/routeRunService.ts`
- `backend/tests/canonical/adminStopRetire.test.ts` (new) + `backend/tests/run.ts`
- `frontend/src/api/routeRuns.ts`
- `frontend/src/components/admin/AdminStopsPanel.tsx`
- `frontend/src/components/ui/DataTable.tsx` (optional `getRowClassName`)
- `frontend/src/components/admin/__tests__/AdminStopsPanel.test.tsx` (new)
- `docs/changelog/capability-build/2026-09-06-t2-a2-retire-stop-button.md` (this entry)

## Smoke test (dev backend — DB left as found)
Synthetic stop `T2A2X` scaffolded (no memberships, no asset link). Via the org-1
`admin` bypass persona: PATCH `active:false` → default list total 0,
`include_retired=true` total 1 with `active:false`; audit row verified carrying
`{"active": {"from": true, "to": false}, "fields": ["active"]}`; PATCH
`active:true` → back in the default list. Read side verified in the founder's
REAL Entra session on `/ops/stops`: retired stop absent from search, reappeared
after reactivation; no retire controls and no "Show retired" checkbox on the
read-only surface. Scaffold deleted (0 rows left); the two `admin.stop_edit`
audit rows are retained (append-only evidence).

Note: the founder's Entra test account is Dispatch/Lead — `/admin/stops` is
role-bounced for it, so the admin-surface interactions are covered by the 7
component tests + API smoke rather than a live-browser admin click-through. An
Admin-role Entra login would allow a full visual pass later.
