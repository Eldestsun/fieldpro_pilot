# Spec — De-KCM the `transit_stops` adapter table

> Status: **PROPOSAL, awaiting founder decision.** No code/schema touched.
> Author-dispatch: founder-directed, inline, before the pending stop re-seed.
> Trigger: `transit_stops` is shaped by King County's Hastus/GIS export dictionary,
> not by the transit vertical generically. We want to keep every global invariant
> the app needs and shed the agency-specific artifacts — while the table is empty
> and cheap to reshape (pre-reseed).

## Governing constraints
- ADR (ISSUE-031): `transit_stops` is the **transit vertical's ingestion surface** and is
  *allowed* to be transit-shaped — future verticals get their own surface, all feeding
  generic `core.locations` / `public.assets`. The goal here is not "make it universal";
  it is "make it *transit-generic*, not *KCM-specific*."
- ADR §6: `is_hotspot` / `compactor` / `has_trash` stay vertical (operational flags). Keep them.
- Migration Recording Discipline (ISSUE-038): the migration must be idempotent and recorded in
  `public.schema_migrations` in the same step. Clean-room `npm run migrate` gate before "done."
- RLS: `transit_stops` is FORCE RLS; the migration runs as owner/superuser (bypass) or sets
  `app.current_org_id`. Table is being re-seeded, so DML risk is nil.

## Column disposition (verified against live readers 2026-07-11)

### Keep — global invariants / load-bearing (typed columns, unchanged)
`stop_id`, `lon`, `lat`, `asset_id`, `org_id`, `pool_id`, `priority_class`,
`last_level3_at`, `notes`, `is_hotspot`, `compactor`, `has_trash`.

### Keep — generic descriptors, load-bearing for routing
- `on_street_name` — OSRM routing + `corridorRefine.ts` + display. **Do not drop.**
- `bearing_code` — OSRM routing + `corridorRefine.ts` + `AdminStopsPanel` column. **Do not drop.**
- `intersection_loc` — generic name, displayed in several views. Keep.

### Rename — generic descriptor with a KCM name
- `hastus_cross_street_name` → **`cross_street`**. The API (`routeRuns.ts`) and the entire
  frontend already speak `cross_street`; only the DB column and one direct read
  (`AdminStopsPanel.tsx:26 getStopField(stop,"hastus_cross_street_name")`) still use the KCM name.
  Rename column + update `loadRouteRunById.ts` (`cross_street: r.hastus_cross_street_name`),
  the API mapper, and that one `getStopField` arg.

### Drop — dead KCM export artifacts (zero readers anywhere)
- `kcm_managed_equipment`
- `route_list`
- `gisobjid` (KCM GIS object id)
- `stop_status` (the `transit_stops` column; the frontend `stop_status` it renders is
  `route_run_stops.stop_status`, a different column — confirmed)

### Decide — display-only KCM columns (rendered in one route-detail view)
`trf_district_code`, `bay_code`, `num_shelters`. One reader each, via
`loadRouteRunById.ts` → API → detail view. Three options:

- **Option A (recommended): `source_attributes jsonb`.** Add a generic `source_attributes jsonb
  NOT NULL DEFAULT '{}'`; ingestion writes agency-specific fields there; the detail view reads
  `trf_district`/`bay`/`num_shelters` from JSON. Table schema names zero KCM concepts; nothing is
  lost; any future agency's export fields land in the same bag with no schema change. Most faithful
  to "transit adapter, not KCM adapter."
- **Option B: drop all three too.** Leanest schema; trim the detail view. Loses district/bay/shelter
  display.
- **Option C: keep the three as typed columns.** Least churn; table still carries 3 KCM-dictionary names.

## Work if approved (Option A shape)
1. Migration `NNNN_transit_stops_deKCM.sql` (idempotent, recorded):
   `DROP COLUMN IF EXISTS` the 4 dead; `ADD COLUMN IF NOT EXISTS source_attributes jsonb NOT NULL
   DEFAULT '{}'`; `ALTER … RENAME COLUMN hastus_cross_street_name TO cross_street` (guard: only if the
   old column exists); drop `trf_district_code`/`bay_code`/`num_shelters` after folding into JSON.
   Update the `public.stops` view (it enumerates all columns).
2. Seed script: write the invariants as columns, KCM export fields into `source_attributes`.
3. Readers: `loadRouteRunById.ts` (SELECT + mapper), `routeRuns.ts` API mapper, `AdminStopsPanel.tsx`
   (`cross_street`; read the 3 from source_attributes if displayed), `formatStopLocation.ts` (already
   `cross_street`). Confirm `osrmClient.ts` / `routeRunService.ts` / `corridorRefine.ts` untouched
   (they use `on_street_name`/`bearing_code`, both kept).
4. Regenerate `pg_state.sql`; changelog entry under `docs/changelog/refactor/`.
5. Clean-room migrate gate → exit 0 → schema matches dump.

## Blast radius
Small and concentrated: 1 migration, 1 view redefine, ~4 backend/frontend read sites, the seed
script. No routing, no canonical (`core.*`), no RLS-policy, no labor-safety surface touched.
