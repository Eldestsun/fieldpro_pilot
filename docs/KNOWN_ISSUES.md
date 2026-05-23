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
**Status:** Deferred  
**Discovered:** 2026-05-13  
**Area:** backend — `tests/canonical/` — visits, observations, evidence, assignments  
**Severity:** medium  

`visits.test.ts` (4/6 red), `observations.test.ts` (5/5 red), `evidence.test.ts` (3/4 red), `assignments.test.ts` (3/5 red) — all fail with `getVisitContext: missing location_id for route_run_stop N (stop_id mapping failed)`; root cause is the fixture stop (`FIXTURE_STOP_ID = "31150"`) no longer resolving through `core.v_locations_transit` after the R11 schema changes.

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