# 2026-07-08 — SEAM-C: Dispatch canonical-correctness repoints

**Branch:** `fix/seam-c-canonical-repoints` · **Type:** Bug (canonical-correctness)
**Source:** `docs/audit/2026-07-07-dispatch-surface-live-inventory.md` (Seam C)
**Commits:** aa741cf (item 1), 67b535f (item 2), 80dc6e1 (item 3), fb8be43 (item 4)

Four repoints that make Dispatch/Admin surfaces read canonical truth (`core.*`) instead
of clipped adapters or dead columns. No schema/migration; write paths untouched.

## Item 1 — CC `/exceptions` hazard + infra tiles → canonical (aa741cf)

The Control Center exceptions handler counted `public.hazards` +
`public.infrastructure_issues` — Stage-2 clipped adapters (writes stopped), so post-clip
counts read stale/zero. Repointed both tiles to `core.observations` presence rows,
classified by the `SAFETY_PRESENCE_TYPES` / `INFRA_PRESENCE_TYPES` sets in the new shared
`domains/observation/presenceTaxonomy.ts` (pinned to the write-path `mapSafetyHazard` /
`mapInfraIssue` outputs, same discipline as `CLEAN_ACTION_KEYS`). Each presence row is one
report; count = today's reports (`observed_at >= CURRENT_DATE`), matching legacy
`reported_at >= CURRENT_DATE` semantics. Org-scoped by the handler's existing
`set_config` (PATTERN-001). `skips` + `emergency` tiles untouched.

- **Tile-attribution delta (visible on the Admin CC surface):** contaminated-waste reports
  now count under **hazards, not infrastructure**, per the canonical taxonomy. The
  infra-capture "contaminated waste" checkbox writes `biohazard_present` — a SAFETY
  presence (`observationService.ts` `mapInfraIssue`) — so it lands in the hazards tile.
  This is correct (a biohazard is a safety fact regardless of capture surface); it is a
  deliberate semantic shift from the old adapter tables, flagged so a reviewer never
  mistakes the count change for a bug.

## Item 2 — `loadRouteRunById` cleaning booleans → canonical (67b535f)

The Dispatch route-detail loader read the 5 cleaning booleans from a `LEFT JOIN` on clipped
`public.clean_logs` — post-clip visits rendered all-false (and NULL, not explicit false).
Repointed to a `LEFT JOIN LATERAL` per stop that resolves the visit via the canonical spine
(`visit → assignment.source_ref = route_run`, `visit.location → stop_id` through
`core.location_external_ids`) and `BOOL_OR`s `obs_kind='action'` rows, keying on
`o.intervention` to match `buildCleanLogsCanonicalQueries`. `COALESCE`'d to `false` —
absence ⇒ clean, no manufactured state. Not filtered on `v.outcome`, so an in-progress stop
reflects actions as recorded. `ORDER BY rrs.sequence` and response shape preserved.

## Item 3 — drop dead `rr.user_id` from the two Dispatch route lists (80dc6e1)

`route_runs.user_id` is `LEGACY_TRANSIT_USER_ID = 0` — a constant carrying no worker
identity. Removed from the `GET /lead/todays-runs` and `GET /ops/route-runs` SELECTs +
responses, and from the two endpoint-specific frontend types (`LeadRouteRunSummary`,
`OpsRouteRun`) + the `fetchLeadTodaysRuns` mapper. (Phase 0 found the "zero-consumer"
precondition unmet — the frontend had type fields + one mapper; per the recommended
resolution they are removed for consistency since nothing renders the field. The shared
`RouteRun` interface, fed by the worker `/ul/todays-run` endpoint, is left untouched.)

## Item 4 — R11 OID trim + comment fix (fb8be43, founder-ruled 2026-07-08)

`GET /lead/route-runs/:id` (the R11 controlled reassignment exposure) now keeps the assigned
worker's and assigning Lead's **name + role** (operational reassignment need) but drops the
raw OID: `loadRouteRunById` omits `assigned_user.oid` and `created_by.oid`. The
`identity_directory` JOIN stays — it sources the names. The two false
"identity fields Admin-gated by loadRouteRunById" comments in `routeRunRoutes.ts` were
corrected: the loader applies no role gate and the route allows Dispatch; the payload
exposes name/role (never OID) as the R11 exception. The `runtimeIdentityLeak` detector was
updated — its "worker identity always travels next to an OID" premise is what item 4
deliberately broke, so `assigned_user`/`created_by` are now recognized as person objects by
parent key (the gate still sees `display_name` as identity; the sanctioned-endpoint proof
stays non-vacuous).

## Verification

- Backend **164/0**, frontend **27/0** (baseline was 159/0; +5 new SEAM-C regression tests).
- Each item's fix committed **before** its red-demo; all four red-demos confirmed (reverting
  each fix flips its test red, restore → green).
- New tests: `ccExceptionsCanonical` (handler-coupled, before/after deltas),
  `loadRouteRunCanonicalBooleans` (done⇒true / absent⇒false / no-visit⇒all-false),
  `seamCUserIdDropped` (no `user_id` key on either list), `loadRouteRunOidTrim`
  (name/role present, no `*_oid`).
- Labor-safety re-scan of the four touched surfaces: CC `/exceptions` returns only counts;
  the two lists carry no `user_id`/identity; the route detail returns only the sanctioned
  R11 names (`display_name`/`role`), no `*_oid`.

## Honest residual

- CC `/exceptions` **skips-reason** tile still `LEFT JOIN public.hazards` for the reason
  label (clipped). Scoped out per the dispatch (the two count tiles were the target);
  canonicalizing the reason means sourcing from `core.visits.reason_code` — a larger
  reshaping, tracked separately.
- The route-detail payload still carries the dead `user_id = 0` sentinel (not in item 3/4
  scope; the identity gate pins it to the sentinel).

## Files touched

- `backend/src/domains/observation/presenceTaxonomy.ts` (new)
- `backend/src/modules/admin/adminRoutes.ts`
- `backend/src/domains/routeRun/loaders/loadRouteRunById.ts`
- `backend/src/modules/ops/opsRoutes.ts`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `frontend/src/api/routeRuns.ts`
- `backend/tests/canonical/{ccExceptionsCanonical,loadRouteRunCanonicalBooleans,seamCUserIdDropped,loadRouteRunOidTrim}.test.ts` (new)
- `backend/tests/canonical/runtimeIdentityLeak.test.ts`, `backend/tests/run.ts`
