# 2026-07-12 — Create Route: dispatch-base picker + shift, depot-anchored preview, hide seed crew, fix NaN sequence

## What changed

### Base picker — routes are saveable/executable again
- The district pools (NS/SE/SW/SC/E/CB/NL) carry no `route_pools.base_id`, so
  `POST /route-runs` was dying with *"route pool has no base assigned"* — preview
  worked, save never did. Added a **Dispatch Base** picker to the Create Route
  drawer so a base is chosen at create time instead of being hard-required on the
  pool. Base resolution order: explicit pick → pool's pre-attached base (default) →
  single-base org auto-selects → otherwise require a pick.
- New endpoint `GET /api/bases` (Dispatch/Admin, org-scoped, PATTERN-001) lists the
  org's active bases. `GET /api/pools` now also returns each pool's `base_id` so the
  picker can default to a pool's pre-attached base (preserving the old KCM behavior
  where base was implied by the route).
- Save now sends `base_id`; the create handler already accepted it (body → pool
  fallback), so no create-path change was needed.

### Depot-anchored preview — previewed miles now match the saved route
- `POST /route-runs/preview` now resolves the base (explicit `base_id` → pool's base)
  and, when one resolves, plans the trip FROM it (prepended `__BASE__` waypoint +
  `source=first`), then filters the sentinel out of the returned stop list while
  keeping its distance contribution. Previously preview was stop-to-stop only, so a
  district route previewed at ~19 mi then saved at ~44 mi — a confusing jump. Now
  both read the same depot-anchored number (verified: NS+SOUTH preview = 44.3 mi =
  the saved run). No base resolvable → graceful stop-to-stop fallback
  (`base_anchored:false`).
- Response gained `base_id` (which base anchored the plan, null if none) and
  `base_anchored`. The org resolution was hoisted to the top of the handler and its
  catch now honors a typed `err.status` (OrgResolutionError → 403) instead of masking
  as 500.
- Base is now required to **preview** as well as save, so the previewed distance is
  always the real one, never a stop-to-stop number that jumps on save.

### Two UI fixes surfaced during testing
- **`#` column showed `NaN`.** The stop list rendered `s.sequence + 1`, but the
  planner's `ordered_stops` carry no `sequence` field (optimized order IS array
  order). Now indexed (`i + 1`). The `RoutePreviewStop` type was corrected to the
  shape the planner actually emits (`lon/lat/on_street_name/bearing_code`; no
  `sequence`). Location column now shows `on_street_name` instead of the raw stop id.
- **Seed crew hidden.** `GET /api/users` returns CI seed rows `seed-dispatch-oid` /
  `seed-specialist-oid`; the crew picker now filters out `seed-*` oids. The rows stay
  in the DB for CI — this is a display-layer hide, not a data change.

## Why
- Unblocks the core Dispatch → save → executable-route flow for every org shape
  (single-base, multi-base, base-per-pool, no-base-on-pool) with no hardcoding: an
  org that restructures its depots never needs a code change, and single-base orgs
  never see the picker.
- De-KCMs two hard-coded assumptions (base implied by pool; shift bound to route)
  into optional, defaulted, overridable public fields — the same de-KCM logic as the
  `transit_stops` proposal. base/shift live only on public `route_runs` (operational
  frame), never in core.
- Preview that lies about mileage undermines Dispatch's trust in the tool; anchoring
  it to the base makes the one number they act on correct.

## Files touched
- `backend/src/modules/admin/resourceRoutes.ts` — `base_id` on `/pools`; new `/bases`
- `backend/src/modules/routes/routeRunRoutes.ts` — base-anchored preview
- `frontend/src/api/routeRuns.ts` — `Base` type + `fetchBases`; `baseId` on
  preview/create; `RoutePreviewStop`/`RoutePreviewResponse` shape truthing
- `frontend/src/hooks/useCreateRoute.ts` — base state, fetch, auto-select/default,
  seed filter, base gates preview+save
- `frontend/src/components/RouteCreatePanel.tsx` — base dropdown; `#`/location fixes
- `frontend/src/components/__tests__/RouteCreatePanel.test.tsx` — base-required,
  seed-hidden, base-sent-to-preview assertions
- `docs/changelog/capability-build/2026-07-12-route-create-base-picker.md` (this file)

## Verification
- Frontend suite: **64 passed** (12 files); RouteCreatePanel: **4 passed** (base
  required to preview + save, seed crew filtered, base sent to preview/create).
- Backend org-fail-closed tripwire: **10 passed**; both typecheck clean.
- Live (dev-bypass, real DB + OSRM stub): `/api/bases` → NORTH/SOUTH; `/api/pools`
  carries `base_id`; **saved NS route with 25 persisted `route_run_stops`** (old runs
  had 0); preview NS+SOUTH = **44.3 mi** = saved run; preview without base = 19.1 mi
  (`base_anchored:false`). UI verified: base picker present, `#` = 1,2,3…, street
  names shown, seed crew absent, Save creates the run.

## Scope / relation to ISSUE-062
- **Public-schema + frontend only. No core change, no contamination.** base/shift are
  written to `public.route_runs`.
- ISSUE-062 will extract worker identity off `route_runs` into an app-only assignment
  sidecar and reshape it into the identity-free operational frame. When that lands,
  the base/shift **write target** may move with it — but this picker UI does not
  change, only where it writes. Sequenced as agreed: picker now (unblock testing),
  identity extraction later (the founder decision).
- Known follow-up: no pool in seed data has BOTH a base and pool memberships, so the
  pool-default-base auto-anchor path is proven only by shared code (the explicit-base
  path is verified live), not by an end-to-end seed case.
