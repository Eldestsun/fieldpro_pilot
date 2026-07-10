# 2026-07-10 — SEAM-D: per-stop history surface (D-5) + ad-hoc route creation (D-3)

**Branch:** `feat/seam-d-history-adhoc` off origin/main @ `2409e64` · **Card:** SEAM-D
**Source:** `docs/audit/2026-07-07-dispatch-surface-live-inventory.md` (Seam D + D-5b), read from commit `3927ee9` (doc lives only on the unmerged discovery branch — carded as DOCS-6)

## What changed

### D5a — `GET /api/stops/:stop_id/history` (backend)
- New endpoint in `stopRoutes.ts`, guarded `requireAuth + requireAnyRole(["Dispatch","Admin"])`
  (the SEAM-B /ops pattern). Paginated over visits (default 20, max 100), newest first.
- Sources: `core.visits` anchors + `core.observations` **normalized columns only**
  (`obs_kind`/`norm_status`/`norm_severity`/`intervention` — never `payload`) +
  `stop_effort_history` + `stop_condition_history`. **Never** clipped adapters
  (`public.hazards`, `infrastructure_issues`, `clean_logs`) — per operator ruling.
- Stop→canonical translation is the one-hop `core.location_external_ids`
  (`source_system='metro_stop'`) lookup **before** the canonical query
  (ADAPTER_BOUNDARY §5), with `core.asset_locations` active-primary as the
  asset-side fallback for older visits with NULL `location_id`.
- Dedup rule (operator-ruled): all three sources FK the same `core.visits` row →
  **one entry per visit**; observations/effort/condition are facets.
  `had_hazard`/`had_infra_issue` are NOT echoed — §2.1 umbrella duplication of the
  full-resolution presence observations.
- Org scoping: the entire handler runs inside
  `withOrgContext(await resolveNumericOrgId(req))` (PATTERN-001); org resolution
  fails closed (403). Absence is a valid signal: a stop with no visits returns
  empty `entries`, never synthesized rows.
- Endpoint classified `kind: "clean"` in the runtime identity-leak registry with
  `underPriv: "Specialist"` (audience-widening floor probe).

### D5b — StopHistoryDrawer (frontend)
- New shared read-only drawer (`StopHistoryDrawer.tsx`): visit-grouped chronology,
  loading/error states, empty state "No observations recorded for this stop."
- Placements: a History column in `LeadRouteDetail` stop rows and in
  `AdminStopsPanel` (both `/ops/stops` read-only and `/admin/stops` edit scopes —
  it is a read control). No new App route; no worker identity fetched or rendered.
- `OpsButton` gains `aria-label` passthrough (additive).

### D3a — `route_runs.is_adhoc` (migration + write path)
- Migration `20260710_seam_d_route_runs_is_adhoc.sql`: `ADD COLUMN IF NOT EXISTS
  is_adhoc boolean NOT NULL DEFAULT false` — additive, backfill-free fast-default,
  no drops/RLS/grant changes, self-asserting. Applied through the runner and
  recorded in `schema_migrations` (verified: second runner pass skips it). The
  migration file is the ONLY DDL source for this column (repo-wide grep).
- `POST /route-runs`: `is_adhoc` is an **explicit** body flag — never inferred.
  Server validation: `true` requires `stop_ids[]` (min 2 — the existing OSRM
  floor); non-boolean rejected (400). `stop_ids[]` without the flag remains the
  legal, untagged legacy primitive (operator ruling). `createRouteRun` persists
  the flag. Run-level only; `route_run_stops.origin_type` untouched.

### D3b — ad-hoc picker + run-level tag (frontend + list surfacing)
- `RouteCreatePanel`: two-tab mode — From Pool (existing flow untouched) |
  Ad-hoc Stops (search via existing `/ops/stops`, multi-select chips, min-2
  floor, preview via the existing `stop_ids` preview path, save posts
  `stop_ids + is_adhoc: true`). Pool stays required in ad-hoc v1 (base/org
  anchor — operator ruling; pool-less is a v2 card).
- `rr.is_adhoc` added to `/lead/todays-runs`, `/ops/route-runs`, and
  `loadRouteRunById`; neutral "ad-hoc" badge beside the pool label on
  `LeadRoutesPanel` rows (active + completed) and the `LeadRouteDetail` header.

## Why
- D-5: per-stop condition/effort over time IS the intelligence product
  (time-as-intelligence on the asset, worker-anonymous by construction).
- D-3: dispatchers need hand-picked runs (storm response, complaint follow-ups)
  distinguishable from pool-generated runs at the run level.

## Verification
- Backend **179 passed, 0 failed** · Frontend **54 passed** (baselines 171/45;
  +8 backend: 4 stopHistory + 3 adhocRouteRuns + 1 identity-leak registry probe;
  +9 frontend: 4 drawer + 1 detail placement + 3 picker + 1 tag).
- Labor-safety re-scan (recorded): grep of
  `user_id|_oid|reported_by|captured_by|display_name|email` over the history
  handler, drawer, picker, and run-list tag surfaces — zero identity references
  (only substring hits of "oid" inside `void`). D5a includes a RECURSIVE
  nested-response deep-scan test; D5b poisons the API response and proves the
  drawer renders no identity keys.
- Org isolation: cross-org history read returns 404 with no entries (RLS
  fail-closed, PATTERN-001 test).
- Live dev DB data reality (Phase 0): both history tables and the canonical
  visit layer are empty post-rebuild — D5 renders absence until new completions
  land; demo staging is a separate founder task (PM-carded).

## CI fix (2026-07-10, post-push)
- The D3a persist test's fixture stops (SEAMD_ADHOC_A/B) were relocated from a
  runtime admin connection into `tests/fixtures/seed.sql` §11 (greppable
  markers). WHY: CI lacks the runtime provisioner credential **by design**
  (`PGADMIN_DATABASE_URL` is step-scoped to migrations; the test step exports
  only the suite-role `DATABASE_URL`), so the in-test admin client died with
  `SASL: client password must be a string`. seed.sql is the sanctioned
  elevated-fixture path in both CI (dedicated seed step) and local
  (`run.ts ensureFixtureSeed`, probe extended to self-heal stale DBs). The test
  now uses the suite pool only and creates/cleans up runs only.
- This is the WORKAROUND; the root cause stays carded as **RLS-TSA** (the
  `sync_transit_stop_primary_asset` trigger inserts into `transit_stop_assets`
  without its NOT NULL `org_id`). When RLS-TSA lands, the asset_id write works
  under normal roles and the two seed stops can be reconsidered.

## Files touched
- `backend/migrations/20260710_seam_d_route_runs_is_adhoc.sql` (new)
- `backend/src/modules/work/stopRoutes.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/modules/ops/opsRoutes.ts`
- `backend/src/domains/routeRun/routeRunService.ts`
- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
- `backend/tests/canonical/stopHistory.test.ts` (new)
- `backend/tests/canonical/adhocRouteRuns.test.ts` (new)
- `backend/tests/canonical/runtimeIdentityLeak.test.ts`
- `backend/tests/run.ts`
- `frontend/src/api/routeRuns.ts`
- `frontend/src/components/StopHistoryDrawer.tsx` (new)
- `frontend/src/components/LeadRouteDetail.tsx`
- `frontend/src/components/LeadRoutesPanel.tsx`
- `frontend/src/components/RouteCreatePanel.tsx`
- `frontend/src/components/admin/AdminStopsPanel.tsx`
- `frontend/src/components/ui/OpsButton.tsx`
- `frontend/src/hooks/useCreateRoute.ts`
- `frontend/src/components/__tests__/StopHistoryDrawer.test.tsx` (new)
- `frontend/src/components/__tests__/RouteCreatePanel.test.tsx` (new)
- `frontend/src/components/__tests__/LeadRouteDetail.test.tsx`
- `frontend/src/components/__tests__/LeadRoutesPanel.test.tsx`
