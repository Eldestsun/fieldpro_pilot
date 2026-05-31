# 2026-05-30 — Start-stop 500 / no canonical writes: RLS org-context on the visit-ensure path

## What changed
- `startRouteRunStopInternal` now runs inside `withOrgContext(orgId, …)` instead of
  a bare `pool.connect()`. Both callers (`modules/routes/routeRunRoutes.ts` and
  `modules/work/routeRunStopRoutes.ts`) resolve the tenant via
  `resolveNumericOrgId(req)` and pass `orgId` into the helper.
- New migration `migrations/20260530_rls_harden_core_location_org_isolation.sql`
  rewrites the `org_isolation` policies on `core.location_external_ids` and
  `core.asset_locations` from the unguarded `current_setting(...)::bigint` form to
  the guarded `COALESCE/NULLIF` form (USING + WITH CHECK) used by every other
  `org_isolation` policy. Includes an assertion that zero unguarded policies remain.
- Reconciled `planning/architecture/ADAPTER_BOUNDARY.md` §2b to the live
  `core.v_locations_transit` definition (joins `core.location_external_ids`,
  `source_system='metro_stop'`), documented the FORCE-RLS trap on the bridge
  tables, and corrected the stale `core.assignments` / `core.visits.assignment_id`
  "empty / not-yet-written" claims.

## Why
- Starting a stop (`POST /route-run-stops/:id/start`) returned **500
  `invalid input syntax for type bigint: ""`** and never wrote `core.visits`,
  so the entire canonical layer (`core.visits` / `core.observations` /
  `core.evidence`) stayed empty — "no data being written."
- Root cause (PATTERN-001): the start path opened a bare pooled connection with no
  `app.current_org_id`. The visit-ensure path reads `core.v_locations_transit`, a
  security-definer view whose base tables FORCE RLS. On a pooled connection left at
  `app.current_org_id = ''` by a prior request's `withOrgContext`/handler reset, the
  unguarded `core.location_external_ids` policy evaluated `''::bigint` and raised.
  On a fresh (NULL) connection it instead returned zero rows → "missing location_id".
- Provenance of the unguarded policies: created unguarded in
  `legacy_20260513_r11_core_location_tables_rls.sql`, then re-created (to add
  WITH CHECK) still unguarded in `20260518_rls_phase3_structural_fixes.sql` Part B —
  while Parts A and D of that same migration used the guarded form. These two were
  the only unguarded `org_isolation` policies in the database.
- The app fix enforces correct tenant context (the real fix); the policy hardening
  is defense-in-depth so a future missing-context bug fails closed (empty) instead
  of 500-ing, matching every other table.

## Verification
- `POST /route-run-stops/27/start` → **200**; `route_run_stops.id=27` → `in_progress`,
  `core.visits` row created (id 89, `location_id=98` resolved through the view,
  `assignment_id` populated, actor OID set).
- Full stop completion → **200**: `core.observations` wrote 3 rows
  (`picked_up_litter`, `emptied_trash` actions + `trash_volume` measurement
  `{"level":2}`), `core.evidence` 2 rows, visit closed `outcome='completed'`,
  plus `clean_logs` / `stop_photos` / `trash_volume_logs`.
- Migration assertion passed (0 unguarded `org_isolation` policies remain); view
  resolves under empty context without raising.
- `tsc --noEmit` clean.

## Files touched
- `backend/src/domains/routeRun/operations/startRouteRunStop.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/modules/work/routeRunStopRoutes.ts`
- `backend/migrations/20260530_rls_harden_core_location_org_isolation.sql` (new)
- `planning/architecture/ADAPTER_BOUNDARY.md`

## Follow-ups (not in this change)
- The uncommitted `frontend/src/components/today-route/StopDetail.tsx` workaround
  (optimistic thumbnails when the server "returned no DB-backed photos yet (visit
  not yet created)") was compensating for this backend bug. With the visit now
  created reliably, re-evaluate whether that optimistic path is still wanted.
- `withOrgContext` (and the `/complete` + `/skip-with-hazard` handlers) reset
  `app.current_org_id` to `''` rather than unsetting it. After this hardening that
  is harmless, but resetting via `RESET`/unset would be cleaner; tracked as a
  systemic follow-up, not done here.
- `current_state.md` §5.6 ("photos not written to `core.evidence`") is stale —
  evidence is now written (2 rows observed). Reconcile separately.
- A full `ADAPTER_BOUNDARY.md` pass against the 2026-05-25 state-layer ratification
  (registry, normalized `obs_kind`/`norm_status` columns) is still outstanding.
