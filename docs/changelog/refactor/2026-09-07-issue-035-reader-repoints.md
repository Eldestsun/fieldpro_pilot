# 2026-09-07 — ISSUE-035: reader-repoint punch-list (off frozen adapter tables)

## What changed
The three data-staleness repoints owed from the ISSUE-031 Stage-2 clip (item 2
was already done per the July RECON). All move a live reader off a
frozen/clipped adapter table or dead adapter column onto canonical.

**Item 1 — `populateEamBridge.ts` `is_exception`.** Derived from the dead
`route_run_stops.hazard_id`/`infra_issue_id` pointers (both permanently NULL
post-clip → every post-clip stop counted as non-exception). Rebuilt from
canonical: a stop is an exception if its visit carries any safety- or
infra-presence observation, bridged via the deterministic `client_visit_id`
(computed in JS — Postgres has no uuidv5 — same pattern as ISSUE-036).

**Item 3 — Control Center skips-by-reason (`controlCenterRoutes.ts`).** = the
founder-confirmed SEAM-C-R1 defect. The reason was read from `public.hazards`
via `rrs.hazard_id` (dead pointer → every real skip showed **"unspecified"**,
founder-confirmed 2026-09-07). Repointed to `core.visits.reason_code` (the skip
path writes the hazard type there): skipped visits today grouped by
`reason_code` — canonical-native, no bridge. **Smoke-verified live:** CC
skips-by-reason now shows the real reason (`"fire"`) instead of "unspecified".

**Item 4 — `loadRouteRunById.ts` spot-check photoKeys.** Read `sp.s3_key` from
the frozen `public.stop_photos` via a route-detail join. Repointed to
`core.evidence.storage_key`, bridged by `client_visit_id` (JS-derived set, then
mapped back to `route_run_stop_id`). This was the **last** live
`public.stop_photos` reader; with its sibling ISSUE-036 already done,
`public.stop_photos` now has zero live readers → droppable in ISSUE-037.

Post-change repo sweep: zero live reads of any frozen table or dead adapter
column remain (only clip-history comments).

## Tests
- `eamBridge.test.ts` updated: seeds a canonical presence observation (not the
  dead `hazard_id`) to mark the exception; visit cleaned up.
- `loadRouteRunById.test.ts`: new case asserts spot-check photoKeys come from
  `core.evidence` (item 4).
- Item 3 smoke-verified live; existing CC tests unaffected.
- Backend 214/215; the 1 failure is `stopHistory` (stop 31150 "encampment
  exactly once" → 2) = pre-existing dev-DB pollution from the founder's
  ISSUE-063 skip test (stray visit 3632), NOT this change — not healed per
  smoke discipline; CI fresh-DB is green.

## Files touched
- `backend/src/scripts/populateEamBridge.ts` (item 1)
- `backend/src/modules/admin/controlCenterRoutes.ts` (item 3 / SEAM-C-R1)
- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts` (item 4)
- `backend/tests/canonical/eamBridge.test.ts` (canonical seeding)
- `backend/tests/canonical/loadRouteRunById.test.ts` (item-4 test)
- `docs/changelog/refactor/2026-09-07-issue-035-reader-repoints.md` (this entry)

## Downstream
- Closes SEAM-C-R1 (item 3 is the same repoint).
- Unblocks ISSUE-037 Stage-3 DROP for `public.stop_photos` (now zero readers)
  and `public.hazards` (CC skips was its last data-staleness reader; confirm
  against ISSUE-037's per-table reader check before dropping).
