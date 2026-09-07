# 2026-09-07 — ISSUE-061: De-KCM the transit_stops adapter table (spec Option A)

## What changed
- **Migration `20260907_issue061_transit_stops_dekcm.sql`** (idempotent, runner-
  recorded, provisioner-applied):
  - Added `source_attributes jsonb NOT NULL DEFAULT '{}'` — the generic bag for
    agency-specific export fields; any future agency's dictionary lands here
    with no schema change.
  - Folded the seven KCM Hastus/GIS export fields into `source_attributes`
    (`trf_district_code`, `bay_code`, `num_shelters`, `stop_status`, `gisobjid`,
    `route_list`, `kcm_managed_equipment`; `jsonb_strip_nulls` keeps rows lean),
    then dropped the columns.
  - Renamed `hastus_cross_street_name` → `cross_street` (the API and frontend
    already spoke `cross_street`).
  - Rebuilt the read-only `public.stops` view (DROP + CREATE — column removal;
    view drop ordered BEFORE the column drops since the old view enumerated
    them). Recreated `trg_stops_readonly` and fieldpro's grant set exactly as
    provisioned; no other dependents existed (pg_depend-verified).
- **Readers updated:** `loadRouteRunById.ts` (SELECT + mapper —
  `trf_district_code`/`bay_code`/`num_shelters` now read from
  `source_attributes`, payload keys unchanged for API compatibility),
  `adminStopService.ts` (Stop type + both column lists → `cross_street`),
  `AdminStopsPanel.tsx` buildLocation, frontend `NormalizedAdminStop` +
  normalizer, `backend/scripts/seed_transit_assets.ts` (asset attributes now
  merge `ts.source_attributes` wholesale). `osrmClient`/`routeRunService`/
  `corridorRefine` untouched (use kept columns), confirmed by repo-wide sweep:
  zero remaining references to the dropped/renamed names outside migrations and
  historical docs.
- `pg_state.sql` regenerated (schema-changing migration discipline).
- T2-A2's test fixture updated (it inserted `trf_district_code`).

## Departures from the proposal, recorded
- The 2026-07-11 spec assumed an EMPTY table (pre-reseed; "DML risk is nil").
  The table now carries 1,621 live rows, so the four "drop dead — zero readers"
  columns were folded into `source_attributes` too rather than dropped
  outright: schema equally de-KCM'd, zero data loss.
- Option A (recommended in the spec) dispatched on founder go-ahead of the
  Ready card; the spec's PROPOSAL header predates that ruling.

## Why
- ADR (ISSUE-031): `transit_stops` is the transit vertical's ingestion surface
  and may be transit-shaped — but not KCM-shaped. The table now names zero
  King County concepts; global invariants and the routing-load-bearing
  descriptors (`on_street_name`, `bearing_code`, `intersection_loc`,
  `cross_street`) remain typed columns.

## Files touched
- `backend/migrations/20260907_issue061_transit_stops_dekcm.sql` (new)
- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
- `backend/src/services/adminStopService.ts`
- `backend/scripts/seed_transit_assets.ts`
- `backend/tests/canonical/adminStopRetire.test.ts` (fixture)
- `frontend/src/api/routeRuns.ts`
- `frontend/src/components/admin/AdminStopsPanel.tsx`
- `pg_state.sql` (regenerated)
- `docs/changelog/refactor/2026-09-07-issue-061-transit-stops-dekcm.md` (this entry)

## Verification
- Migration applied via the runner as `fieldpro_admin` and recorded in
  `schema_migrations` (same step). First attempt FAILED correctly on ordering
  (old view blocked the column drops) and rolled back whole-file — fixed by
  moving the view drop ahead of the column drops.
- Dev DB verified: 18-column table, `cross_street` populated, KCM fields
  present in `source_attributes` (spot-checked stop 111).
- Suites: backend 209/209, frontend 115/115, tsc clean both.
- Smoke (real data): `/api/lead/route-runs/4447` stop payload carries
  `cross_street` + `trf_district_code`/`num_shelters` from JSON with unchanged
  keys; `/api/ops/stops` list carries `cross_street`; route-detail UI in the
  founder's live session renders "E Madison St & 22nd Ave" correctly.
- Clean-room gate: CI runs empty-DB → `npm run migrate` → suites on the PR.
