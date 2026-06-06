# Known Issues

Issues deferred for future sessions. Each entry stays until fixed and a changelog entry is written.

---

## ISSUE-001 — Offline queue pending count miscounts after spot check
**Status:** Deferred  
**Discovered:** 2026-05-10  
**Area:** frontend — OfflineStatusBar / queue state derivation  
**Severity:** low  

**Symptom:**  
After a spot check stop completes, the offline queue UI shows a pending action count instead of clearing to zero. Data writes correctly to the DB — display/counting issue only.

**Root cause (if known):**  
Spot check action type may not be handled in the queue state derivation logic that drives `OfflineSyncContext`. The pending count filter may not recognise the spot check action type as terminal/done.

**Deferred because:**  
Data integrity confirmed correct. UI cosmetic issue only. `OfflineSyncContext` doesn't exist yet — it's being built in R4 Sub-task D.

**Fix hint:**  
Investigate spot check action type handling in queue state derivation inside `OfflineSyncManager.tsx` once Sub-task D is implemented. Ensure all terminal action types are covered in the pending count filter.

**Target:** R4 Sub-task D or post-R4 triage

---

## ISSUE-002 — Control Center progress bar counts completed-only, should count visited
**Status:** Fixed 2026-05-12  
**Discovered:** 2026-05-10  
**Area:** frontend — Control Center progress bar component  

**Resolution:**  
The backend `/routes` endpoint already computed `resolved_stops` as
`COUNT(*) FILTER (WHERE rrs.status IN ('done', 'skipped'))` — both completed and
skipped stops were already counted at the data layer. Frontend: the "Progress" column
header was renamed to "Visited", the progress percentage label now reads `{N}% visited`,
and the local variable was renamed from `resolved` to `visited` for clarity.  
No backend change required.  
Changelog: `2026-05-12-r6-control-center-live.md`

---

## ISSUE-003 — Control Center surfaces raw database identifiers instead of stop names
**Status:** Fixed 2026-05-12 (fully closed)  
**Discovered:** 2026-05-10  
**Area:** frontend + backend — Control Center stop display  

**Resolution:**  
Phase 1 (R6): Added `sanitizeStopLabel()` helper in `AdminControlCenter.tsx` — maps
`null`, empty string, or the `"(route_stop)"` DB placeholder to `"Transit Stop"`.  
Phase 2 (this entry): `/api/admin/control-center/difficulty` `heavyStops` query now
`LEFT JOIN`s `public.stops` via `core.v_locations_transit.stop_id` and returns `stop_id`,
`on_street_name`, and `intersection_loc` per entry. Frontend renders the full
`"#{stop_id} · {on_street_name} — {intersection_loc}"` format when all three fields are
present; falls back to `sanitizeStopLabel(label)` for any null/empty values. The `TODO(ISSUE-003)` comment has been removed from the render site.  
Changelogs: `2026-05-12-r6-control-center-live.md`, `2026-05-12-issue-003-stop-names-backend.md`

---

## ISSUE-004 — Skip stop: "No hazard selected" fires on first attempt despite hazard being selected
**Status:** Fixed 2026-05-11  
**Discovered:** 2026-05-10  
**Area:** frontend — Specialist skip stop workflow / `handleSkipStop`  

**Resolution:**  
Hazard selection is now passed directly as an argument to `handleSkipStop` from the
confirm dialog `onConfirm` callback, eliminating the async state read entirely.
`localSafety.hazardTypes` is read at the time the worker taps "Skip Stop" in the
safety modal, not deferred to the confirm step where stale state could be read.  
Changelog: `2026-05-11-fix-004-skip-hazard-double-tap.md`

---

## ISSUE-005 — baseline:after-replay fires on empty replays, causing fetchRoute loop
**Status:** Fixed 2026-05-11  
**Discovered:** 2026-05-10  
**Area:** frontend — `OfflineSyncManager.tsx` / `useTodayRoute.ts`  

**Resolution:**  
`runReplay` now returns `Promise<boolean>` — `true` when at least one terminal stop action (`COMPLETE_STOP` or `SKIP_STOP_WITH_HAZARD`) succeeded. `OfflineSyncManager.attemptReplay` is now `async` and gates `window.dispatchEvent(new Event('baseline:after-replay'))` on that return value. Empty-queue and upload-only replay runs no longer fire the event.  
Changelog: `2026-05-11-fix-005-after-replay-guard.md`

---

## ISSUE-006 — Offline queue memoryCache may not flush to localStorage before tab crash
**Status:** Deferred  
**Discovered:** 2026-05-10  
**Area:** frontend — `offlineQueue.ts` — `persistState` / `enqueueAction`  
**Severity:** medium  

**Symptom:**  
Queue actions are held in `memoryCache` (a module-level object) and written to `localStorage` synchronously on every `enqueueAction` call. If a worker queues actions while offline and the browser tab is killed (crash, battery loss, force-quit) between the enqueue and the `localStorage.setItem` completing, queued stop data is lost permanently — the canonical visit and observation rows are never written.

**Root cause (if known):**  
`localStorage.setItem` is synchronous in the spec but browsers may defer writes under memory pressure. Module-level `memoryCache` is authoritative during a session but not durable across tab death. There is no `beforeunload` flush or write confirmation.

**Fix hint:**  
Audit write-through timing in `persistState()`. Add a `beforeunload` / `visibilitychange: hidden` handler that iterates `memoryCache` and force-flushes any entries not yet confirmed in `localStorage`. Confirm `localStorage.setItem` is truly synchronous in the target browser environments (Chrome on Android). Consider using IndexedDB for the queue store (same as `photoStore` and `todayRouteCache`) for stronger durability guarantees.

**Deferred because:**  
Edge case for pilot (requires simultaneous offline session + tab crash). Existing `persistState` call is synchronous and covers the majority of real-world scenarios. Must harden before scale.

**Target:** Pre-scale hardening (before multi-agency rollout)

---

## ISSUE-007 — Hazard severity not captured in canonical observations
**Status:** Fixed 2026-05-12  
**Discovered:** 2026-05-10  
**Area:** backend — `observationService.ts` / frontend — `StopDetail.tsx`, `useTodayRoute.ts`  

**Resolution:**  
Backend: `observationService.ts` now writes `core.observations.severity` (text) from
`StopUiPayload.hazard_severity`. `cleanLogService.ts` passes `safety.severity` through
as `hazard_severity` in the `uiPayload`. `hazardService.ts` converts string labels
(`"low"/"medium"/"high"`) to smallint (1/2/3) via `toNumericSeverity()` for the
`hazards.severity` column. Skip path `uiPayload` now includes `hazard_severity`.  
Frontend: severity pill selector (Low/Medium/High) added to safety modal in
`StopDetail.tsx`; value wired through `SafetyState.severity` → queue action payload →
route handler → `cleanLogService` → `observationService` → `core.observations.severity`.  
Changelogs: `2026-05-11-fix-007-hazard-severity-write.md`,
`2026-05-11-issue-007-severity-frontend.md`,
`2026-05-12-fix-hazard-severity-backend-bugs.md`.

---

## ISSUE-010 — S1-2: two trigger points have no hookable code yet
**Status:** Deferred  
**Discovered:** 2026-05-13  
**Area:** backend — S1-2 audit wiring  
**Severity:** low (compliance gap, no runtime breakage)

`export.data_export` and `admin.user_role_change` audit writes are not wired because neither trigger point exists in the codebase — the data-export endpoint is S1-4 and no user-role-change endpoint has been built. Both will be wired when their respective endpoints land.

---

## ISSUE-009 — Four canonical test files are red: stop_id → location_id mapping broken in fixture
**Status:** Fixed 2026-06-05  
**Discovered:** 2026-05-13  
**Area:** backend — `tests/canonical/` — visits, observations, evidence, assignments  
**Severity:** medium  

`visits.test.ts` (4/6 red), `observations.test.ts` (5/5 red), `evidence.test.ts` (3/4 red), `assignments.test.ts` (3/5 red) — all fail with `getVisitContext: missing location_id for route_run_stop N (stop_id mapping failed)`; root cause is the fixture stop (`FIXTURE_STOP_ID = "31150"`) no longer resolving through `core.v_locations_transit` after the R11 schema changes.

**Resolution:**  
Investigated as part of the cleanup Phase 1 dispatch. On the current schema the mapping resolves correctly *given seed data* — `core.v_locations_transit` reads `core.locations` (`location_type='transit_stop'`) joined to `core.location_external_ids` (`source_system='metro_stop'`, `external_id='31150'`). The failure was the same root cause as ISSUE-022: the CI test DB has schema but no seed data, so the location rows the mapping needs were absent. Fixed by the same `backend/tests/fixtures/seed.sql` (rows 7–8: `core.locations` + `core.location_external_ids`). No fixture or view code change was required — `tests/setup.ts` already targets the view correctly. Verified by a faithful CI replication (fresh DB → migrate → seed → run suite): visits/observations/evidence all pass.  
Changelog: `2026-06-05-cleanup-phase-1-ci-test-infra.md`

---

## ISSUE-008 — complexity_score not computed in stop_effort_history
stop_effort_history.complexity_score is always NULL. The spec intended 
a count of non-clean observations but payload key varies by observation 
type with no consistent 'value'/'clean' field across types.
Fix: define a canonical "condition" observation type with a consistent 
payload shape, then rewrite the complexity subquery against it.
Priority: post-pilot — complexity_score is not consumed by any 
current surface.

---

## ISSUE-011 — Dev bypass Bearer token enhancement (deferred)
**Status:** Deferred
**Discovered:** 2026-05-15
**Area:** backend — `backend/src/middleware/devAuthBypass.ts`
**Severity:** low

A partially-implemented enhancement to the dev auth bypass middleware added Bearer sentinel support and env-var fallback identity (`DEV_BYPASS_OID`, `DEV_BYPASS_ROLES`, `DEV_BYPASS_ORG_ID`). This work was reverted on 2026-05-15 because the audit detail payload was renamed (`x-dev-user-oid` → `resolved-oid`) without a corresponding update to the test assertion at `devAuthBypass.test.ts` ~line 192–196.

**When re-implementing:**
- Update the audit detail assertion in `devAuthBypass.test.ts` (~line 192–196) to expect `resolved-oid`
- Implement Bearer token + env-var fallback together as one commit
- Verify 99/99 test baseline holds

**Deferred because:** The current header-based bypass (`X-Dev-User-*`) works for all agent terminal sessions. Bearer token support is only needed if remote agent tooling changes to Bearer token auth.

---

## PATTERN-001 — RLS silent empty-result when org context missing

**Type:** Recurring gotcha — not a single bug, a systemic trap  
**Instances:** ISSUE-005 (fetchRoute loop), ISSUE-012 (/api/users empty list), ISSUE-013 (`resolveNumericOrgId` lowest-id fallback — same pattern, different surface), ISSUE-014 (`schema_migrations` manifest drift — discovered chasing this pattern), role-rename backfill migration (2026-05-21)

Any query or write against a `FORCE ROW LEVEL SECURITY` table silently returns zero rows / affects zero rows if `app.current_org_id` is not set on the connection before the query runs. The failure is invisible in logs — no error, no warning, just an empty result set or a no-op write.

**Local vs Render asymmetry:** This bug manifests locally (where the `fieldpro` role has neither `rolsuper` nor `rolbypassrls`) but is hidden on Render (managed Postgres connections may have elevated privileges). Always test RLS-sensitive paths locally.

**Checklist for any new endpoint or migration touching RLS tables:**
- App code: wrap in `withOrgContext(pool, orgId, ...)`
- Migrations/scripts: set `SET app.current_org_id = '...'` before DML or run as `fieldpro_admin` (bypassrls)
- Confirm table has RLS: `\d+ <table>` → `Row Security: enabled (forced)`

See `CLAUDE.md § RLS Context Gotcha` for the authoritative rule.

---

## ISSUE-012 — GET /api/users returns empty list in local dev; assignment dropdown blank
**Status:** Fixed 2026-05-18
**Discovered:** 2026-05-18
**Area:** backend — `backend/src/modules/admin/resourceRoutes.ts`
**Severity:** medium

**Symptom:**
The Dispatch route-creation flow and any Admin surface listing assignable users showed an empty dropdown. No error — just no users to assign to.

**Root cause:**
`identity_directory` has `FORCE ROW LEVEL SECURITY` with an `org_isolation` policy that requires `app.current_org_id` to be set on the connection before any query runs. The `GET /api/users` handler used a bare `pool.query()` with no org context, so RLS filtered out every row silently. The bug was invisible on Render because Render's managed Postgres connection has elevated privileges that bypass RLS; locally the `fieldpro` role has neither `rolsuper` nor `rolbypassrls`, so RLS was correctly enforced.

**Resolution:**
`GET /api/users` now wraps the `identity_directory` query in `withOrgContext`. Numeric org ID resolves from `req.user.org_id` for dev bypass requests, falls back to a tenant UUID lookup against `organizations` for real Entra auth.

**Changelog:** `docs/changelog/bugfix/2026-05-18-fix-users-rls-org-context.md`

---

## ISSUE-013 — `resolveNumericOrgId` fails open to lowest-id org when caller org is indeterminate
**Status:** Deferred — safe in single-org, must fail closed before any multi-org deployment
**Discovered:** 2026-05-21
**Area:** backend — `backend/src/middleware/resolveOrgId.ts`
**Severity:** medium (latent; benign in current single-org deployment, becomes a cross-tenant data leak the moment a second org is added)

**Symptom (latent):**
`resolveNumericOrgId(req)` is the canonical helper for sourcing the numeric `org_id` that downstream `withOrgContext(...)` calls scope reads and writes to. When `req.user.org_id` is unset (no authenticated user) AND no Entra `tid` claim matches an `organizations.tenant_uuid` row, the helper executes:

```sql
SELECT id FROM organizations WHERE tenant_uuid = $1
UNION ALL
SELECT id FROM organizations ORDER BY id LIMIT 1
```

and returns whichever row arrives first — in practice the lowest-id organization (currently KCM, id 1). The helper never throws and never returns `undefined`. Any caller that reaches the fallback silently scopes its `withOrgContext` to org 1.

**Why this is safe today:**
- The dev and pilot deployments are both single-org KCM. The "lowest-id org" and "the correct org" are the same row, so the fallback returns the right answer by coincidence of cardinality.
- Real Entra-authenticated requests populate `req.user.org_id` directly (from the dev-bypass headers) or supply a `tid` that resolves a unique `tenant_uuid` row, so the fallback branch is never hit on the request path.
- The known caller that does hit the fallback today is `POST /api/dev/generate-route-run` (no `requireAuth`), which is dev-only and gated by `DEV_AUTH_BYPASS === 'true'`.

**Why it must be fixed before multi-org deployment:**
Once a second organization is added, any code path that reaches the fallback (forgotten `requireAuth`, a token with a `tid` not yet registered in `organizations.tenant_uuid`, a background job, a misconfigured cron, a new dev endpoint) will silently default the caller into org 1's data. RLS will faithfully scope reads and writes to org 1 — fail-open with respect to tenant identity, not a leak across orgs, but a structural defect that puts the wrong org's data on the wire to the wrong caller. The helper is the trust boundary; it should fail closed by raising when it cannot determine an authoritative org.

**Fix hint:**
- Tighten `resolveNumericOrgId` to throw (or return `null` and force callers to handle it explicitly) when `req.user?.org_id` is unset AND no `tid` resolves a unique `organizations.tenant_uuid` row.
- Audit all call sites for either explicit `null` handling or a fail-closed 401/403 response.
- Special-case the dev route(s) that legitimately have no `req.user`: have them pass an explicit `org_id` (from request body or `DEV_BYPASS_ORG_ID`) rather than depending on the lowest-id fallback.

**Related — the RLS-context trap pattern:**
This issue is one member of a recurring class of bugs in this codebase where the trust boundary between "I know which org this caller belongs to" and "RLS will silently scope to whatever org context is on the connection" is fragile. Other instances:

- **ISSUE-005** — `baseline:after-replay` fires on empty replays. Different mechanism, listed here per the dispatch's cross-reference.
- **ISSUE-012** — `GET /api/users` returned empty list because the handler queried `identity_directory` on a bare pool connection with `app.current_org_id` unset; the strict R11 RLS policy filtered every row out silently. Same RLS-context-not-set trap, manifested as fail-closed rather than fail-open.
- **Role-rename Phase 1 backfill (2026-05-21)** — `UPDATE identity_directory SET last_seen_role = ...` reported `UPDATE 0` against a table that had 4 rows. Same RLS-context-not-set trap, manifested as a silent no-op.
- **`loadRouteRunById` (2026-05-21 — fixed)** — ran two `pool.query` calls with `app.current_org_id` unset. Before the strict identity_directory RLS hid the JOIN. After the planned Phase 2 policy flip on identity_directory, the bare connection would have started returning cross-tenant rows. Fixed by threading `orgId` through and wrapping in `withOrgContext`.

The unifying pattern: every code path that touches an RLS-protected table must arrive there via `withOrgContext(orgId, ...)`, and the `orgId` must come from an authoritative source — not a silent fallback. `resolveNumericOrgId` is the choke point where this discipline either holds or breaks; ISSUE-013 is the open hole in that choke point. See **PATTERN-001** above for the systemic trap; this issue is one instance of it.

**Target:** Pre-multi-org hardening (must close before the second tenant is provisioned). Will be re-evaluated as part of the multi-tenant readiness audit alongside any other `pool.query` reads of RLS tables on bare connections.

---

## ISSUE-014 — `schema_migrations` drifted from disk state; phase 2/3 reconciled, full set not re-runnable
**Status:** Reconciled (phase 2/3 stamped 2026-05-21); follow-up deferred
**Discovered:** 2026-05-21
**Area:** ops — `backend/scripts/migrate.ts` + `backend/migrations/*.sql`
**Severity:** medium (latent — runner is now a faithful record of DB state, but the migration set cannot be re-run end-to-end without manual edits)

**What happened:**
`backend/migrations/20260518_rls_phase2_add_orgid.sql` and `20260518_rls_phase3_structural_fixes.sql` were applied to the dev DB out-of-band via `psql -f` during their original sprint and never stamped into `public.schema_migrations`. Phase 1 was correctly tracked. The drift was invisible until the role-rename Phase 1 DB dispatch ran `npm run migrate`, at which point the runner re-applied phase 1 (idempotent — harmless re-stamp) and then failed on phase 2's `ADD COLUMN org_id bigint` because the columns already existed (phase 2 has no `IF NOT EXISTS` guards). Surfaced while chasing **PATTERN-001** on the role-rename backfill — the silent `UPDATE 0` was the symptom that triggered the runner re-invocation that revealed the drift.

**Reconciliation (this entry, 2026-05-21):**
Before stamping, verified each migration's full footprint was actually present in the live schema:
- Phase 2 — all 14 tables (`asset_external_ids`, `clean_logs`, `hazards`, `infrastructure_issues`, `lead_route_overrides`, `level3_logs`, `route_run_stops`, `stop_condition_history`, `stop_effort_history`, `stop_photos`, `stop_risk_snapshot`, `stops_legacy`, `transit_stop_assets`, `trash_volume_logs`) confirmed: `org_id bigint NOT NULL` column, RLS enabled+forced, `org_isolation` policy with COALESCE/NULLIF shape in both USING and WITH CHECK.
- Phase 3 — Part A (`audit_log.org_id` bigint NOT NULL, three corrected policies, `audit_log_org_occurred` index, `organizations.tenant_uuid` populated for KCM), Part B (`core.asset_locations` + `core.location_external_ids` WITH CHECK added), Part C (`route_runs.shift_type` column + CHECK constraint), Part D (`stop_pool_memberships` table + RLS + policy + index + PK + 14,916 rows backfilled from `transit_stops.pool_id`) — all present.

Stamped both migrations into `schema_migrations` with `applied_at = '2026-05-18'` to reflect the original out-of-band apply date. The runner now skips phases 1/2/3 on subsequent invocations and applies pending migrations from `20260519_role_rename_backfill.sql` onward.

**Latent fragility (deferred):**
The migration set is not re-runnable end-to-end. Phase 2 + phase 3's structural DDL — `ADD COLUMN` without `IF NOT EXISTS`, `CREATE INDEX` without `IF NOT EXISTS`, `CREATE TABLE` without `IF NOT EXISTS` — will fail on second application. The runner protects against this by tracking applied migrations, but the protection is only as good as `schema_migrations`. Any future drift (a developer running `psql -f` on a new migration, a partial restore from backup, etc.) reproduces this exact failure mode.

**Fix hint (deferred to pre-pilot ops hardening):**
- Audit all migrations in `backend/migrations/` for non-idempotent DDL.
- Add `IF NOT EXISTS` guards to `ADD COLUMN`, `CREATE INDEX`, `CREATE TABLE`, `CREATE POLICY` (the latter requires `DROP POLICY IF EXISTS` first, already used in phase 1 — apply the same pattern everywhere).
- Add a CI check that runs `npm run migrate` against a freshly initialized DB on every PR — drift would surface immediately.
- Document the rule in `CLAUDE.md` and `docs/ops/`: every new migration must be re-runnable; out-of-band `psql -f` is not an acceptable apply path.

**Why deferred:**
The reconciliation closes the immediate problem. Making the full set re-runnable is a separate ops hardening exercise — touches every migration file, needs a CI gate to prevent regression, and has no functional impact on the running application. Right priority is pre-pilot deploy, alongside the rest of the multi-tenant + ops readiness work.

**Target:** Pre-pilot deploy hardening (alongside ISSUE-013 multi-org audit and the CI migration-replay gate).

---

## ISSUE-015 — Stopless `route_run` returns 404 on `/lead/route-runs/:id` — legitimate state or orphan data?
**Status:** Open question (not a fix request)
**Discovered:** 2026-05-23 (during role-rename Phase 1 audit live verification)
**Area:** backend loader (`backend/src/domains/routeRun/loaders/loadRouteRunById.ts`) + Dispatch UI surface
**Severity:** unknown — depends on whether stopless route_runs are a legitimate intermediate state

**Symptom:**
`GET /api/lead/route-runs/1167` (org 1, Dispatch caller) returns `404 {"error":"Route run not found"}` even though `route_runs.id=1167` exists in org 1 with `status='planned'`, `run_date='2026-05-18'`. The route_run row is real; what's missing is any row in `route_run_stops` for that run. The loader's query `JOIN route_run_stops rrs ON rrs.route_run_id = rr.id` is an `INNER JOIN`, so a route_run with zero stops returns zero rows and the handler maps that to 404. Quick check at the time of writing: route_runs `1166`–`1170` in org 1 are all stopless and would all 404 the same way.

**Surfaced during, but unrelated to, the role-rename:**
This came up while verifying that the Phase 1 audit fix (commit `e71c3c1`) cleared the Dispatch 403 on `/lead/route-runs/:id` live. The guard fix works — the request now reaches the handler. The 404 is a separate, pre-existing handler/data-shape behavior that has nothing to do with role names; it would have produced the same 404 for a Lead caller before the rename too.

**The question (not a fix):**
Is a `route_run` with zero `route_run_stops` a legitimate intermediate state — e.g., Dispatch created the run and hasn't added stops yet, or stops were all removed during planning revision — that the Dispatch UI should render gracefully ("empty run, add stops")? Or is it orphan data that shouldn't exist in the first place and should be cleaned up / prevented at write time?

The answer determines the fix shape, and the fix shape may be in two different places:
- If **legitimate**: the loader's `INNER JOIN route_run_stops` should be a `LEFT JOIN`, the handler should return a `route_run` with an empty `stops: []` array, and the Dispatch detail UI should render an empty-state instead of bouncing to a 404 page. This is a UX issue.
- If **orphan**: route_run creation should require ≥1 stop (DB constraint, API validation, or both), and the existing stopless rows (`1166`–`1170` in org 1, possibly more) should be deleted or archived. This is a data-integrity issue.
- Possibly **both**: enforce ≥1 stop going forward, but the loader still does LEFT JOIN as defense-in-depth and the UI handles empty-state.

**Why deferred:**
This is a product/surface decision for the Lead to make during Dispatch-surface UX testing, not an engineering call. Both fix shapes are small once the question is answered. Logging the question now so it doesn't get lost between the role-rename verification and the Dispatch UX pass.

**Fix hint (after question is answered):**
- Decision in hand → either widen the loader to LEFT JOIN + handler returns `{ ...route_run, stops: [] }` and update the `RouteRun` frontend type to allow empty stops, OR add the write-time constraint and run a one-off cleanup of stopless rows in dev.
- Either way: add a regression test (loader-level or HTTP-level) that locks in the chosen behavior — stopless route_run returns 200-with-empty-stops, or stopless route_run cannot exist.

---

## ISSUE-016 — Risk-map infra numerator semantics changed by umbrella retirement — defines "problem stop," needs intelligence-layer decision
**Status:** Open question (not a fix request) — owned by the intelligence workstream
**Discovered:** 2026-05-25 (during state-layer write-path cleanup, commit `1e4ac06`)
**Area:** backend — `backend/src/intelligence/riskMapService.ts` `infra` CTE; downstream `stop_risk_snapshot.infra_issue_score` / `infrastructure_score`
**Severity:** unknown — depends on which numerator the v1 transit Dispatch triage workflow needs

**What changed (mechanical, already in code):**
Commit `1e4ac06` retired `infrastructure_issue_present` (the generic umbrella) under the §2.1 anti-pattern, repointing the `infra` CTE's `WHERE` clause from a single umbrella string to `IN (...8 specific *_present types...)`. The repoint was necessary — the umbrella row stopped being written in the same commit — so the reader had to move to keep functioning.

The repoint silently shifted the numerator's meaning:
- **Old shape (umbrella):** exactly 1 umbrella row per issue-bearing visit. `COUNT(*)` over the 30-day window ≈ **count of issue-bearing VISITS**.
- **New shape (specifics):** 1 row per specific issue. A visit reporting 3 issues contributes 3 rows. `COUNT(*)` ≈ **count of PROBLEMS** (issue-instances).

The `LEAST(count, 5)::numeric(4,2) AS infra_issue_score` cap and the downstream `2.0 * COALESCE(i.infra_issue_score, 0) AS infrastructure_score` weight were calibrated for the old semantics. Neither has been reconsidered.

**Why this matters (the strategic frame):**
KCM's current notion of "problem stop" is downstream of WORK ORDERS — a record of spend, not condition — and they have no real reporting off it. BASELINE is AUTHORING the definition of stop condition for transit field assets on a blank page. Whatever v1 ships becomes the de facto definition. So the numerator choice is not a formula tweak; it is a **product decision about what a "problem stop" IS**, made by whichever line of code aggregates the canonical observations.

That decision must not be made inside a state-layer cleanup commit, and it was not made deliberately — it fell out of a state-layer-required repoint. Logging it so the intelligence workstream inherits it as an open design decision rather than an accidental inherited behavior.

**The design question (for the intelligence workstream, NOT to answer now):**
- **Count-of-problem-VISITS** = a **frequency / chronicity** signal. Answers "which stops keep needing attention." Closer to the old numerator. Treats one rough visit (3 issues) as equal to one mildly rough visit (1 issue).
- **Count-of-PROBLEMS** = a **severity / load** signal. Answers "which stops need the most work per touch." The new numerator as currently written. Treats a 3-issue visit as 3× a 1-issue visit.

Both are legitimate; they answer different operational questions. v1 must choose which serves the transit **Dispatch** triage workflow first. The analyst raw-access tier (`core.observations` / `core.v_observation_normalized`, per the canonical state layer §8a) is the escape hatch — KCM can re-scope against raw if our default doesn't fit, so this is a **good default**, not a lock-in.

**Cap interaction to check during recalibration:**
Under the new numerator, a SINGLE multi-issue visit can approach or hit the `LEAST(…, 5)` cap. That may compress the distinction between "one rough visit" and "chronically failing stop" — the exact distinction the degradation signal exists to surface. Recalibrate cap and/or numerator deliberately when intelligence work begins; do not assume the existing `5` and `2.0` constants are still well-calibrated against the new shape.

**Backward-comparability flag:**
Any `stop_risk_snapshot` rows computed before 2026-05-25 used the old numerator. Infra-score trend lines that cross 2026-05-25 will show a discontinuity that is a **formula artifact**, not a real condition change. Snapshot lineage / trend-rendering surfaces must note the change date so the discontinuity is not misread as degradation.

**Workstream routing note (boundary clarification):**
`riskMapService` is **intelligence**, not state. It was only touched in `1e4ac06` because it read a retired state-layer type and would have silently returned zero rows otherwise. The functioning repoint belonged in state-layer (it had to ship together with the umbrella retirement); this recalibration belongs in the intelligence workstream and must not be folded into further state-layer work.

> **Boundary test for future work:** if a change forces picking a NUMBER (a cap, a weight, a threshold) or a DEFINITION (what "problem" / "stale" / "at risk" means), it's **intelligence**, not state. State only owns the row shape, the registry vocabulary, and the read seam.

**Why deferred:**
This is an intelligence-layer design decision, not a state-layer bug. The state-layer side is consistent — the repointed reader works against the current write shape — and the system functions on the unrecalibrated numerator. The deliberate choice (and any recalibration) should land alongside the v1 intelligence workstream, with the Dispatch triage workflow in mind.

**Fix hint (after intelligence work picks this up):**
- Decide between the two numerator semantics (above) with the Dispatch triage workflow as the deciding use case.
- If the choice is count-of-VISITS, change the `infra` CTE to `SELECT tsa.stop_id, COUNT(DISTINCT o.visit_id)` (or wrap the existing rows in a per-visit collapsing CTE).
- Recalibrate the `LEAST(…, 5)` cap and the `2.0 * …` weight against the chosen semantics — and lock the new constants in a comment with the rationale.
- Record the 2026-05-25 numerator discontinuity in whatever snapshot-lineage surface analysts use.
- Same review applies to the `had_infra_issue` boolean in `stop_effort_history` (`cleanLogService.ts:200-217`) — that one is a boolean so the semantic shift is exact (no recalibration needed), but call it out in the audit.

**Target:** Dispatch-surface UX/data-shape pass with the Lead. No urgency; no field user is currently blocked by it (the original Dispatch 403 was the rename gap, not this 404).

---

## ISSUE-017 — Silent enum-key coercion in safety / infra hazard mapping — re-introduces the umbrella anti-pattern through a different door
**Status:** Open finding (not a fix request) — surfaced during the §9 verification pass
**Discovered:** 2026-05-30 (canonical state layer §9 verification pass, item 3)
**Area:** backend — `backend/src/domains/observation/observationService.ts` — `mapSafetyHazard` (line ~206) / `mapInfraIssue` (line ~227)
**Severity:** low live impact / latent — degrades silently if the capture UI expands ahead of the registry

**What it is:**
`mapSafetyHazard` and `mapInfraIssue` accept an enum key from the capture UI and translate it to a registry `observation_key` (e.g. `biohazard` → `biohazard_present`, `graffiti` → `graffiti_present`). When the input key is **unrecognized**, both functions fall through to a generic coercion — `other_safety_concern_present` / `other_infrastructure_issue_present` — rather than rejecting the write or surfacing the unknown durably. They do emit a `console.warn` at the fallthrough (`:221`, `:249`), but that is a transient log line, not a durable signal: the row still lands as a generic "other" presence, and nothing downstream can tell it apart from a genuine, deliberately-selected "other".

**Why it's not just a small bug — it re-opens a retired anti-pattern:**
This is structurally the **same** defect the 2026-05-25 dual retirement removed. `safety_concern_present` and `stop_not_serviced_due_to_safety` (and later `infrastructure_issue_present`) were retired from the registry under §2.1 of `CANONICAL_STATE_LAYER_DESIGN.md` — the *generic-umbrella-as-duplication* rule: a one-bit generic row carries no information the specific presences don't already carry, and writing it loses resolution / invites double-counting. The umbrella **types** were retired from the registry, but the umbrella **behavior** persists one layer down, at the mapping function: anything unrecognized is funneled into a generic `other_*_present` row. The door was closed in the registry and left open in the mapper.

**Concrete failure mode:**
If a new specific hazard is added to the capture UI **without** a matching registry seed + mapping-table update, every instance of that new hazard silently lands as `other_*_present`. The intelligence layer then reads "many generic concerns" instead of "many instances of [the new specific type]." Signal resolution degrades silently and nobody sees an error — exactly the failure the two-axis / specific-over-umbrella design exists to prevent. The `console.warn` is the only trace, and it is invisible in aggregate.

**Recommended fix shape (do NOT implement here):**
An unrecognized enum key should produce an **explicit** signal rather than a silent coercion — refuse the write, quarantine it, or at minimum persist the unknown key for repair (not just a console line). The proper home for this ties directly to the **§9 item 3 validation gap**: §6 steps 3–4 (registry-driven payload validation) are unimplemented and there is no quarantine queue. The clean fix is a **registry-aware validation layer that rejects unknown `observation_key`s at write time**, with rejected rows routed to the quarantine/repair queue §6 prescribes. So this is partly a **candidate to fold into the eventual offline-validation buildout**, not necessarily a standalone one-off fix.

**Relation to other items:**
Independent of the two deferred §9 migrations (normalized-columns backfill; actor-audit sidecar extraction). Can be fixed before, after, or alongside them. Live today with low-volume impact while the specific hazard/infra key sets are stable; the risk is **latent** and grows the moment the capture UI gains a hazard/infra option ahead of a registry seed. See the §9 verification changelog (`docs/changelog/2026-05-30-s9-verification-pass.md`) and `CANONICAL_STATE_LAYER_DESIGN.md` §2.1 (umbrella anti-pattern) and §9 item 3 (validation gap).

**Target:** Fold into the offline-validation / registry-aware write-validation buildout (§9 item 3 follow-up), or fix standalone if a new specific hazard/infra type is seeded before that buildout lands — whichever comes first.

---

## ISSUE-018 — Intelligence reads not yet routed through the `intelligence_reader` role — sidecar boundary not yet binding on the running app
**Status:** Open — follow-on to the 2026-06-01 sidecar-extraction migration
**Discovered:** 2026-06-01 (sidecar extraction, `feat/sidecar-extraction`)
**Area:** backend — DB connection/role wiring (`backend/src/db.ts` pool, intelligence read paths: `riskMapService`, MVs, any future intelligence consumer)
**Severity:** medium (latent — the structural boundary exists at the DB level but the app does not yet use it)

**Context:**
The sidecar-extraction migration (2026-06-01) made worker non-attribution (canonical state layer invariant #1) structural at the DB level: worker identity now lives only in the no-grant sidecars `core.{visit,observation,evidence,assignment}_actor_audit`, the plaintext identity columns are dropped from the canonical tables, and a `NOLOGIN` group role `intelligence_reader` exists with **no grant** on any sidecar (verified: `permission denied`). An `audit_reader` role holds the sidecar grant for legitimate audit/export.

**The gap:**
The running app opens **every** DB connection as `fieldpro` (see the pool in `backend/src/db.ts`), and `fieldpro` retains access to everything (it must — it writes the sidecars and runs the export/delete paths). The no-grant boundary therefore binds an *intelligence query* only once that query actually runs **as `intelligence_reader`** — a separate connection or a `SET ROLE`. Until that wiring lands, the structural guarantee is **proven and ready but not yet binding on the running app**; in-app, invariant #1 still leans on query discipline (which today holds, because no intelligence code reads identity — but that is discipline, not enforcement).

**Fix shape (its own dispatch):**
- Give `intelligence_reader` a `LOGIN` attribute + credentials (or adopt a `SET ROLE intelligence_reader` wrapper for read-only intelligence transactions), and route intelligence reads (`riskMapService`, MV refreshes, any executive/stewardship read surface) through that role/connection.
- Keep RLS in mind (PATTERN-001): the role is non-superuser/non-bypassrls, so intelligence reads under it must still set `app.current_org_id` via `withOrgContext`.
- Decide whether a second pool (intelligence-reader pool) or per-transaction `SET ROLE`/`RESET ROLE` is cleaner; the former is simpler to reason about, the latter avoids a second connection pool.
- Add a test that asserts an intelligence-path connection **cannot** `SELECT` from a sidecar (the boundary is live in-app, not just at the DB).

**Why deferred:** Decided as a follow-on at the start of the sidecar-extraction dispatch (Decision C). The extraction itself — the net-new schema + role provisioning + write/read repoint — was the scoped deliverable; the connection-routing is a separate, lower-risk change that does not touch schema. The DB-level boundary is the hard part and it is done and verified.

**Target:** Intelligence-layer workstream (the no-grant role becomes load-bearing the moment intelligence reads run under it). See `CANONICAL_STATE_LAYER_DESIGN.md` §3.2 "VERIFIED" note and §9 item 6.

---

## ISSUE-019 — Frontend TS error: `StopDetail.tsx` `PhotoDto` id type mismatch fails `build-frontend` on every PR
**Status:** Open — pre-existing, surfaced by sidecar-PR CI triage (2026-06-04)
**Discovered:** 2026-06-04 (CI triage on `feat/sidecar-extraction` PR #1)
**Area:** frontend — `frontend/src/components/today-route/StopDetail.tsx:394` (`PhotoDto` type)
**Severity:** medium (blocks green `build-frontend` CI on every PR; no runtime data impact)

**Symptom:**
`tsc -b` fails the `build-frontend` CI check with `TS2345` at `StopDetail.tsx:394`. A `setPhotos`-style state updater builds an object literal with `id: number`, but `PhotoDto.id` is typed `string` — so the updater's return type is not assignable to `SetStateAction<PhotoDto[]>`. Build exits with code 2.

**Scope — pre-existing, not caused by the sidecar work:**
The identical failure is present on `main` (verified against CI run `26703160245`, head `69016fec`, 2026-05-31) with the same file, line, and error. The sidecar PR touches **zero** frontend files. The `created_by_oid` field name visible inside the offending object literal is a **red herring** — it is a coincidental field name in a frontend literal, not a reference to the dropped backend identity column; the actual error is purely `id` number-vs-string.

**Fix shape (frontend-only):**
Either correct the literal to produce `id: string` (coerce/format the numeric id), or update the `PhotoDto` type to `id: number` if a numeric id is intentional and propagate that through consumers. One file, no backend/schema involvement.

**Priority:** Blocks green `build-frontend` CI on every PR. Should land soon, but is not blocking other merges since `main` is already in this state.

---

## ISSUE-020 — Dependency: `vitest <4.1.0` critical advisory (GHSA-5xrq-8626-4rwp) fails `dependency-audit`
**Status:** Open — environmental (advisory-DB drift), surfaced by sidecar-PR CI triage (2026-06-04)
**Discovered:** 2026-06-04 (CI triage on `feat/sidecar-extraction` PR #1)
**Area:** backend — dev dependency `vitest` (`backend/package.json`)
**Severity:** moderate (security advisory on a dev/test dependency; fails the `dependency-audit` check)

**Symptom:**
`pnpm audit --audit-level=high` reports a **critical** advisory against `vitest` (`<4.1.0`, GHSA-5xrq-8626-4rwp — "when the Vitest UI server is listening, an arbitrary file can be read and executed"), so the backend audit step exits 1 and fails the `dependency-audit` check.

**Scope — environmental, not caused by the diff:**
The same `vitest` version **passed** `dependency-audit` on `main` as recently as 2026-05-31 (CI run `26703160245` — `dependency-audit: success`); the advisory was published/escalated since then. `pnpm audit` queries a **live** advisory database, so this is version/time drift, not anything introduced by the PR (which touches no `package.json`, lockfile, or `vitest`). **Re-running CI will not clear it** — the advisory persists until the dependency is bumped.

**Fix shape (separate chore commit):**
Bump `vitest` to `>=4.1.0` in backend dev dependencies, refresh the lockfile, and verify no breaking changes in the test runner / fixtures (`backend/tests/`).

**Priority:** Security advisory; bump in the next reasonable window. Not actively exploitable in dev (the vulnerability requires the Vitest UI server to be listening), but should not linger.

---

## ISSUE-021 — CI config: missing `AZURE_TENANT_ID` / `AZURE_API_AUDIENCE` hard-throws at import, preventing ALL backend test execution
**Status:** Fixed 2026-06-05 — `AZURE_TENANT_ID` and `AZURE_API_AUDIENCE` added to repo secrets (Fix shape (a)) for the `test-backend` job
**Discovered:** 2026-06-04 (CI triage on `feat/sidecar-extraction` PR #1)
**Area:** CI config (`.github/workflows/ci.yml` `test-backend` job secrets) + `backend/src/authz.ts:14` (module-load env check)
**Severity:** HIGH (structural — backend CI had no test coverage for an unknown period)

**Resolution:**
Fix shape (a) was taken: the two repo secrets were populated, so `authz.ts:14` no longer throws at module import and the `ts-node tests/run.ts` bootstrap completes. Confirmed by the first post-fix CI test run (workflow run #81 on `45ae234`, the merged sidecar commit): the suite now **loads and executes** — pure-function tests (e.g. `deriveClientVisitId`) pass, and the run reaches the integration tests rather than dying at the `authz` import. The env-check is no longer the blocker. That same run immediately surfaced the *next* layer — a missing `TEST_POOL` seed row in the CI test database — now tracked as ISSUE-022. `authz.ts` was left unchanged (Fix shape (b) not taken); the module still hard-throws on genuinely-absent config, which is acceptable now that CI supplies the values.

**Symptom:**
`backend/src/authz.ts:14` throws `Error: Missing AZURE_TENANT_ID or AZURE_API_AUDIENCE in environment.` at **module import time** when those env vars are empty. In CI they are empty: the `test-backend` job maps them from repo secrets (`AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}`, `AZURE_API_AUDIENCE: ${{ secrets.AZURE_API_AUDIENCE }}`) that are unset. `tests/canonical/authClaims.test.ts:2` imports `authz.ts`, so the throw fires at test **bootstrap** — the runner (`ts-node tests/run.ts`) dies before a single backend test loads, and the job exits 1.

**Scope — pre-existing on main, and a coverage blind spot:**
The identical failure (same `authz.ts:14` throw, same `authClaims.test.ts:2` import site) is present on `main` (CI run `26703160245`, head `69016fec`, 2026-05-31). The sidecar PR touches neither `authz.ts` nor the CI workflow. **Consequence:** because the test process dies at bootstrap, **no backend test has actually run in CI for an unknown period** — every backend change in that window (including this sidecar PR) has landed under **local-test-only** verification. The migrations in the sidecar PR did apply cleanly in CI (`Migration run complete`), but the test suite never executed.

**Fix shape — choose one:**
- **(a) CI secrets:** add `AZURE_TENANT_ID` and `AZURE_API_AUDIENCE` to repo secrets for the `test-backend` job. Dummy values that satisfy the non-empty check are sufficient — the tests do not call Azure, they only need the import not to throw.
- **(b) Soften the env check:** lazy-load or guard the check in `authz.ts` so module import does not hard-throw — fail later, at first actual auth use, with an error message that distinguishes "config missing" from "config invalid." This also makes any test that doesn't exercise auth importable without Azure config.

**Priority:** HIGH. This is the issue that means backend CI is **structurally broken** for the whole project — green backend CI is currently impossible regardless of diff quality. Should be the next real fix after the sidecar PR merges. Without it, every backend change going forward lands without CI verification, including ISSUE-018's `intelligence_reader` wiring (whose fix shape explicitly calls for a boundary test that would itself never run under the current CI state). See ISSUE-018.

---

## ISSUE-022 — CI test database missing `TEST_POOL` seed row, causes all integration tests to fail
**Status:** Fixed 2026-06-05 — seed step added to CI (`test-backend`) + `backend/tests/fixtures/seed.sql`
**Discovered:** 2026-06-05 (first post-ISSUE-021 CI test run — workflow run #81 on `45ae234`)
**Area:** CI config (`.github/workflows/ci.yml` `test-backend` job — no seed step) + `backend/tests/setup.ts` `createRouteRunFixture` (~line 38)
**Severity:** HIGH (every integration test in `canonical/` fails; backend changes still land without integration coverage)

**Symptom:**
`createRouteRunFixture` references `route_pool_id 'TEST_POOL'` from the test database. Every integration test that uses the fixture fails with `route_pool_id TEST_POOL not found`. Tests that do **not** use the fixture (pure-function tests such as `deriveClientVisitId`) pass — so the suite now loads and runs (ISSUE-021 is genuinely fixed), but every fixture-backed integration test errors out.

**Scope — pre-existing, not caused by the sidecar work:**
The `TEST_POOL` seed row exists on local dev DBs (created manually or by a seed script at some point) but **not** on CI's test database: the workflow's "Run migrations" step creates **schema only**, not seed data. The gap was invisible until now because, until ISSUE-021 closed, the suite died at bootstrap before any integration test could run. The sidecar work has no relationship to test seed data — this same failure would occur on a CI run of **any** branch, including `main` at any point in the past several weeks; verifiable by triggering a CI run on a branch with no sidecar changes. Affects every integration test in the `canonical/` directory (visits, observations, evidence, and likely more — the first CI run's failure list was the visible portion).

**Fix shape — two reasonable options, neither implemented here:**
- **(a) Seed step in CI:** add a seed step to the `test-backend` job after "Run migrations" — a small SQL file (e.g. `backend/tests/fixtures/seed.sql`) or a node script inserting the minimal rows (`TEST_POOL` and any siblings the integration tests assume). Smallest change, but couples CI config to test assumptions. **Probably the right first move.**
- **(b) Self-seeding fixture:** make `createRouteRunFixture` own its state — create `TEST_POOL` if absent (idempotent), or generate ephemeral random IDs per run, or adopt a fixture strategy that assumes no pre-existing rows. Larger change, but more durable (tests own their own state).

**Priority:** HIGH (same standing ISSUE-021 had). Every backend change going forward lands without **integration**-test coverage until this is fixed. Should be the next CI-tooling dispatch after ISSUE-021's closure, before any further substantive backend changes ship.

**Relation to ISSUE-021:** Same structural shape — a pre-existing CI gap that stayed invisible while CI was broken in another way. Closing ISSUE-021 (the `authz` import throw) surfaced ISSUE-022 (the missing seed). If a further "next layer" gap exists behind ISSUE-022, the same pattern will surface it once 022 closes.

**Resolution:**  
Fix shape (a) taken. Added `backend/tests/fixtures/seed.sql` — a minimal, idempotent (`ON CONFLICT DO NOTHING`) reference graph (organizations, asset_types, bases, route_pools `TEST_POOL`, assets, transit_stops, `core.locations`, `core.location_external_ids`) — and a "Seed test fixtures" step to the `test-backend` job, after "Run migrations" and before "Run tests". The seed lives under `tests/`, never `migrations/`, so the migration runner never applies it. The `"route_pool_id TEST_POOL not found"` error originated in the `enforce_route_runs_pool_invariant` trigger (not a raw FK); seeding `route_pools` satisfies it and the trigger autofills `route_runs.org_id`/`base_id`. Verified by faithful CI replication (fresh DB → migrate → seed → run suite): the suite executes end-to-end with no fixture-setup crash.  
As predicted in "Relation to ISSUE-021", closing 022 surfaced the next layers — see ISSUE-024 (a latent trigger defect found while seeding) and ISSUE-025 (CI's test role bypasses RLS).  
Changelog: `2026-06-05-cleanup-phase-1-ci-test-infra.md`

---

## ISSUE-023 — Five canonical tests reference identity columns dropped by the sidecar extraction
**Status:** Filed and Fixed 2026-06-05  
**Discovered:** 2026-06-05 (cleanup Phase 1 dispatch — first fresh-DB CI replication after ISSUE-022's seed landed)  
**Area:** backend — `tests/canonical/assignments.test.ts`, `tests/canonical/oidCipher.test.ts`  
**Severity:** medium (blocked `test-backend` from going green; not a product defect)  

**Symptom:**  
Once the ISSUE-022 seed let the suite execute, five tests failed with `column ... does not exist`: `assignments.test.ts` (4) referenced `core.assignments.created_by_oid`, and `oidCipher.test.ts` (1) referenced `core.visits.actor_oid` / `captured_by_oid_ciphertext` / `captured_by_oid_key_id`. All five columns were dropped by `20260530_sidecar_extraction_b_drop.sql` (commit `b56c0bf`). The tests were written for the additive/dual-write phase and never updated when the drop migration completed the §3.2 extraction.

**Scope — test code only, not a product defect:**  
Production (`routeRunService.createRouteRun`, `visitService.ensureVisitForRouteRunStop`) was already correct — it writes creator/worker identity to the no-grant sidecars (`core.assignment_actor_audit`, `core.visit_actor_audit`) and omits the dropped plaintext columns. Only the tests had drifted.

**Resolution:**  
- `assignments.test.ts`: replaced the drifted inline `ASSIGNMENT_INSERT_SQL` (a snapshot copy that still had `created_by_oid`) with a `planAssignments` helper that reproduces *both* production statements — the `core.assignments` INSERT and the `core.assignment_actor_audit` sidecar INSERT — so the test stays a faithful reproduction of the contract going forward. The single identity assertion now reads `actor_ref` from `core.assignment_actor_audit`.  
- `oidCipher.test.ts`: rewrote the integration assertion to read `actor_ref` / `actor_ref_ciphertext` / `actor_ref_key_id` from `core.visit_actor_audit` instead of the dropped `core.visits` columns; reframed the "plaintext retained for dual-write period" comment to "identity lives only in the no-grant sidecar post-extraction." Kept the test (rather than retiring it) — it is the only integration test asserting the OID encrypt path runs end-to-end during visit creation, which is labor-safety-relevant coverage.  
Verified in both environments: 105/105 pass on the RLS-enforced dev DB; on the fresh CI-replica DB these five now pass (the only remaining reds are the ISSUE-025 RLS-bypass set).  
Changelog: `2026-06-05-cleanup-phase-1-ci-test-infra.md`

---

## ISSUE-024 — `sync_transit_stop_primary_asset` trigger inserts into `transit_stop_assets` without NOT NULL `org_id`
**Status:** Open — latent production defect, discovered during cleanup Phase 1  
**Discovered:** 2026-06-05 (seeding `transit_stops` in the cleanup Phase 1 dispatch)  
**Area:** backend — DB trigger `public.sync_transit_stop_primary_asset()` (fires `AFTER INSERT OR UPDATE OF asset_id ON public.transit_stops`)  
**Severity:** medium (real defect, but no current runtime path inserts `transit_stops` — they are reference data)  

**Symptom:**  
Any `INSERT`/`UPDATE` that sets `transit_stops.asset_id` to a non-null value fires the trigger, which runs:
```
INSERT INTO public.transit_stop_assets (stop_id, asset_id, role, active)
VALUES (NEW.stop_id, NEW.asset_id, 'primary', true)
ON CONFLICT (stop_id, asset_id, role) WHERE active = true DO UPDATE ...
```
`transit_stop_assets.org_id` is `NOT NULL` with no default, and the trigger does not supply it → `null value in column "org_id" ... violates not-null constraint`. Worse, the `ON CONFLICT DO UPDATE` does not self-heal: inside the plpgsql function the arbiter fails to match a pre-existing active link row, even though an identical top-level statement matches it — so pre-creating the link row does not prevent the null-`org_id` insert.

**Why it stayed hidden:**  
`transit_stops` are bulk reference data loaded historically (when the rows were created the `org_id` NOT NULL constraint / current trigger shape evidently did not co-exist). No current write path inserts `transit_stops` at runtime, so the defect is latent.

**Workaround in place (test seed only):**  
`backend/tests/fixtures/seed.sql` disables the trigger for its single `asset_id` write and populates `transit_stops` + `transit_stop_assets` explicitly (CI runs the seed as the postgres container superuser). This is a seed-only workaround; the trigger itself is unfixed.

**Fix shape:**  
Have the trigger derive `org_id` for the `transit_stop_assets` insert — e.g. `NEW.org_id` (transit_stops carries `org_id`) — so the link row inherits the stop's org. A dedicated migration replacing `sync_transit_stop_primary_asset()`. Re-verify the `ON CONFLICT` self-heal path once `org_id` is supplied.

**Target:** dedicated trigger-fix dispatch (own scope; not folded into the CI-test-infra dispatch that found it).

---

## ISSUE-025 — CI `test-backend` runs as a superuser, bypassing RLS; RLS-enforcement tests cannot pass
**Status:** Open — CI infrastructure / architecture, discovered during cleanup Phase 1  
**Discovered:** 2026-06-05 (fresh-DB CI replication in the cleanup Phase 1 dispatch)  
**Area:** CI config (`.github/workflows/ci.yml` `test-backend`) + the test DB connection role  
**Severity:** medium (six RLS-enforcement tests stay red on CI; the suite otherwise executes and passes)  

**Symptom:**  
After ISSUE-022/009/023 fixes, six tests still fail on a CI-identical DB — `audit_log` RLS (2), `audit_log_delete` policy (3), `loadRouteRunById` cross-tenant fail-closed (1) — all with the RLS-bypass signature (`expected 0, got 1`; `must return null, got <row>`). The same six pass on the local dev DB. Root cause: the postgres service image makes `POSTGRES_USER=fieldpro` a **superuser**, and the test suite connects as `fieldpro` — superusers bypass RLS even on `FORCE ROW LEVEL SECURITY` tables — so any test asserting RLS *blocks* a write or *hides* a foreign row fails. Locally `fieldpro` is a non-superuser, so RLS is enforced and the tests pass. These tests have likely never run-and-passed on CI (CI was broken by ISSUE-021, then ISSUE-022, until now).

**Fix shape:**  
Run the `test-backend` test connection as a **non-superuser, non-`BYPASSRLS` role** that mirrors the app's runtime role, so RLS is actually enforced — e.g. create a dedicated app-like role after migrations, grant it the privileges the app uses, and point the "Run tests" step's `DATABASE_URL` at it (migrations can still run as the superuser).

**Architectural intersection — resolve within ISSUE-018:**  
The choice of which role the app/test connection uses is the same decision ISSUE-018 must make when it wires the no-grant `intelligence_reader` boundary into the live app connection (`CANONICAL_STATE_LAYER_DESIGN.md` §3.2). Deciding the CI test role here, ahead of ISSUE-018, risks either conflicting with ISSUE-018's app-connection-role routing (rework) or pulling that architecture conversation into a CI dispatch. **The right resolution is to make this decision as part of ISSUE-018's wiring dispatch**, so the test role and the runtime role are chosen together rather than re-litigated.

**Target:** ISSUE-018's app-connection wiring dispatch (Phase 3 of the cleanup drain plan).