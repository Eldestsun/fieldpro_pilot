# Dispatch Surface — Live Inventory (DISCOVERY-D0)

> **Date:** 2026-07-07 · **Type:** Analysis (discovery, read-only) · **Branch:** `chore/dispatch-discovery-inventory`
> **Base:** origin/main @ `779bdbb` · **Method:** every verdict re-proven against live code (greps + file:line + live `\d`/SQL). The
> 2026-05-18 `DISPATCH_ADMIN_CAPABILITY_AUDIT.md` and the T1-* specs were treated as hypothesis only.
> **No code/schema/migration changed** — this artifact is the sole write.

---

## TL;DR

- **Control Center is still Admin-only** (frontend `App.tsx:262-264` + backend `adminRoutes.ts:977`). The T1-CC *relocation* to
  Dispatch has **not** landed. The *canonical repoint* (CC reads `core.visits`/`core.observations`) **has** landed.
- **CC handlers live in `adminRoutes.ts` as `ccRouter`** — no `controlCenterRoutes.ts` file. The P1 in-place repoint is confirmed.
- **Two live "reads a clipped adapter" findings:** `loadRouteRunById` reads `clean_logs` (Dispatch route detail); CC `/exceptions`
  reads `public.hazards` + `public.infrastructure_issues` (both Stage-2 clipped → stale counts).
- **Labor-safety:** the prior clean-logs `user_id` leak is **fixed** (both handlers delegate to the canonical builder). One
  **review-worthy exposure remains:** `GET /lead/route-runs/:id` returns `assigned_user_name`/`assigned_user_oid`/`created_by_name`
  to the Dispatch role (R11 controlled exception, operational-reassignment necessity). It is **not** rendered by the current UI but
  **is** in the API payload — and a code comment mislabels it "Admin-gated," which is not enforced.
- **Tests green:** backend **158/0**, frontend **27/0**. (The dispatch's "159" was the unmerged ISSUE-059 branch; `main` is 158.)

---

## STEP 1 — Frontend component + route inventory

### Components (Dispatch surface + Admin)
`frontend/src/components/`: `LeadRoutesPanel.tsx`, `LeadRouteDetail.tsx`, `LeadCompletedRouteDetail.tsx`, `RouteCreatePanel.tsx`,
`RouteSummary.tsx`, `TodayRouteView.tsx`. `components/admin/`: `AdminControlCenter.tsx`, `AdminDashboard.tsx`, `AdminPoolsPanel.tsx`,
`AdminStopsPanel.tsx`.

**Role rename did NOT rename the `Lead*` components** — they keep the historical `Lead` names while the role string in guards is
`"Dispatch"`. `LeadRoutesPanel`/`LeadRouteDetail`/`LeadCompletedRouteDetail` are the Dispatch route surface. (Naming-only; ISSUE-043
notes "lead" is now an identifier, not a description of who may call.)

### Route map (`App.tsx:242-274`, verbatim role guards)
| Path | Guard (`RequireRole`) | Component |
|------|----------------------|-----------|
| `/work` | `["Specialist","Dispatch"]` | `TodayRouteView` |
| `/routes` | `["Dispatch","Admin"]` | `LeadRoutesPanel` |
| `/routes/:routeRunId` | `["Dispatch","Admin"]` | `LeadRouteDetail` |
| `/admin/dashboard` | `["Admin"]` | `AdminDashboard` scope=admin |
| `/admin/pools` | `["Admin"]` | `AdminPoolsPanel` scope=admin |
| `/admin/stops` | `["Admin"]` | `AdminStopsPanel` scope=admin |
| `/admin/control-center` | **`["Admin"]`** | `AdminControlCenter` |
| `/ops/dashboard` | `["Dispatch","Admin"]` | `AdminDashboard` scope=ops |
| `/ops/pools` | `["Dispatch","Admin"]` | `AdminPoolsPanel` scope=ops |
| `/ops/stops` | `["Dispatch","Admin"]` | `AdminStopsPanel` scope=ops |

**Does Control Center render for Dispatch today? NO.** Only route is `/admin/control-center`, gated `["Admin"]` (`App.tsx:262-264`).
There is no `/ops/control-center`. The Dispatch nav (`App.tsx:120-127` desktop, `210-216` mobile) has **My Work, Routes, Dashboard,
Pools, Stops** — no Control Center link.

---

## STEP 2 — Backend endpoint inventory

Mounts (`app.ts:40-58`): all `/api`, except `route-overrides` → `/api/route-overrides`, `tenant` → `/api/admin/tenant`.
`ccRouter` mounts at `/admin/control-center` (`adminRoutes.ts:1526`). **No `controlCenterRoutes.ts` exists** — CC handlers are in
`adminRoutes.ts`.

| Method · Path | file:line | Auth | Reads |
|---|---|---|---|
| GET `/lead/hub` | routeRunRoutes.ts:56 | Dispatch | static hub payload |
| GET `/lead/todays-runs` | routeRunRoutes.ts:107 | Dispatch,Admin | `route_runs` + stop counts (selects dead `rr.user_id`) |
| GET `/lead/route-runs/:id` | routeRunRoutes.ts:189 & :223 (dup, back-compat) | Dispatch,Admin | `loadRouteRunById` → **identity + clipped `clean_logs`** |
| POST `/routes/plan` | routeRunRoutes.ts:302 | Dispatch,Admin | stop coords (OSRM plan) |
| POST `/route-runs/preview` | routeRunRoutes.ts:431 | Dispatch,Admin | preview plan |
| POST `/route-runs` | routeRunRoutes.ts:591 | Dispatch,Admin | **accepts `stop_ids[]`**; writes run + audit |
| POST `/route-runs/:id/start` | routeRunRoutes.ts:752 | Specialist,Dispatch,Admin | run start |
| POST `/route-run-stops/:id/start` | routeRunRoutes.ts:820 | Specialist,Dispatch,Admin | stop start |
| POST `/route-runs/:id/finish` | routeRunRoutes.ts:929 | Specialist,Dispatch,Admin | run finish |
| PATCH `/route-runs/:id/assign` | routeRunRoutes.ts:1013 | Dispatch,Admin | **reassign** (D-4 backend) |
| GET `/ops/dashboard` | opsRoutes.ts:55 | Dispatch,Admin | aggregate counts |
| GET `/ops/pools` | opsRoutes.ts:122 | Dispatch,Admin | `route_pools` |
| GET `/ops/stops` | opsRoutes.ts:182 | Dispatch,Admin | `transit_stops`/`stops` |
| GET `/ops/route-runs` | opsRoutes.ts:257 | Dispatch,Admin | `route_runs` + counts (selects dead `rr.user_id`) |
| GET `/ops/clean-logs` | opsRoutes.ts:373 | Dispatch,Admin | **canonical builder** (`core.visits`+`core.observations`) |
| GET `/by-pool/:pool_id` | routeOverrideRoutes.ts:68 | Dispatch,Admin | `lead_route_overrides` |
| POST `/add` | routeOverrideRoutes.ts:134 | Dispatch,Admin | override write |
| DELETE `/:id` | routeOverrideRoutes.ts:195 | Dispatch,Admin | override delete |
| GET `/admin/control-center/overview` | adminRoutes.ts:1017 | **Admin** | `core.visits`/`core.observations` (canonical) |
| GET `/admin/control-center/routes` | adminRoutes.ts:1124 | **Admin** | `core.visits`/`core.observations` (canonical) |
| GET `/admin/control-center/exceptions` | adminRoutes.ts:1275 | **Admin** | **clipped `public.hazards` + `public.infrastructure_issues`** |

**Canonical vs adapter/view reads:**
- **Canonical (`core.*`) ✓:** CC `/overview` + `/routes` (`adminRoutes.ts:1039,1049,1406,1454,1488`); `/ops/clean-logs` + `/admin/clean-logs`
  (both delegate to `buildCleanLogsCanonicalQueries`, `opsRoutes.ts:386`, `adminRoutes.ts:687`).
- **No `v_*_transit` view reads** in any Dispatch/CC handler (evicted per D3, confirmed absent).
- **FINDING — clipped-adapter reads (2):**
  1. `loadRouteRunById.ts:81` — `LEFT JOIN clean_logs cl` for the 5 cleaning booleans. `clean_logs` is Stage-2 clipped (writes
     stopped); post-clip visits render empty booleans on the **Dispatch** route detail.
  2. CC `/exceptions` (`adminRoutes.ts:1291-1315`) — `public.route_run_stops LEFT JOIN public.hazards`, `FROM public.hazards`,
     `FROM public.infrastructure_issues`. Both adapters are Stage-2 clipped → today-counts read stale/zero. (Admin-only surface, but a
     real correctness finding; contradicts the "CC handlers repointed" assumption for the hazards/infra tiles.)

---

## STEP 3 — Capability gap matrix

| ID | Capability | Verdict | Proof |
|----|-----------|---------|-------|
| **D-1a** | Route list per-run progress (X of Y) | **PARTIAL** | Backend returns `completed_stops` (`routeRunRoutes.ts:120`, `opsRoutes.ts:291`) but `LeadRoutesPanel.tsx:89,116` renders only `run.stop_count` — no X-of-Y. |
| **D-1b** | Exceptions on route list (hazards/skips/emergencies) | **ABSENT** | `LeadRoutesPanel.tsx` renders no hazard/skip/emergency field; the list query returns none either. |
| **D-1c** | Near-real-time polling on Dispatch list | **ABSENT** | No `setInterval`/poll in `LeadRoutesPanel.tsx` (only a one-time mount `useEffect:38`). |
| **CC-a** | Control Center for Dispatch | **ABSENT** | `App.tsx:262-264` `["Admin"]`; `adminRoutes.ts:977` `requireAdmin`; no `/ops/control-center`; no Dispatch nav link. |
| **CC-b** | CC reads canonical + real severity | **PARTIAL** | Canonical repoint landed (`/overview`,`/routes` read `core.*`). BUT `/exceptions` still counts from **clipped** `public.hazards`/`public.infrastructure_issues` (`adminRoutes.ts:1291-1315`). |
| **D-4** | Reassign UI wired to PATCH assign | **PARTIAL** | Backend `PATCH /route-runs/:id/assign` EXISTS (`routeRunRoutes.ts:1013`, Dispatch,Admin, audit-logged). No frontend control (`LeadRouteDetail.tsx` has no reassign — grep empty). |
| **D-5** | Stop-history endpoint | **ABSENT** | No `GET /api/stops/:id/history` or equivalent anywhere (grep of `src/modules` for history routes → only a risk-rebuild comment). |
| **D-5b** | Where does stop-history data live NOW | — | `stop_effort_history` (written by `cleanLogService.ts` on completion), `stop_condition_history` (written by `riskMapService.ts` on rebuild); both worker-anonymous. `hazards` is **clipped** — do NOT source a new D-5 from it. Canonical source for condition/hazard signal is `core.observations` (`obs_kind`/`norm_status`/`norm_severity`). A new D-5 should read the two history tables + `core.observations`, never `public.hazards`. |
| **D-3** | Ad-hoc route creation | **ABSENT (backend primitive exists)** | No `is_adhoc` column anywhere (grep of code + `pg_state.sql` → empty). `RouteCreatePanel.tsx` is pool-only (`:51`), no stop picker. BUT `POST /route-runs` accepts `stop_ids[]` (`routeRunRoutes.ts:595`) — arbitrary-stop creation is already possible server-side. |
| **NAV** | Dispatch nav links today | — | My Work, Routes, Dashboard (`/ops/dashboard`), Pools (`/ops/pools`), Stops (`/ops/stops`) — `App.tsx:114-127`/`200-216`. No CC, no history, no reassign entry. |

---

## STEP 4 — Labor-safety scan (Dispatch-reachable endpoints)

| Endpoint (Dispatch-reachable) | Identity fields in response | Verdict |
|---|---|---|
| GET `/ops/route-runs` | `rr.user_id` (returned, `opsRoutes.ts:287,304`) | **CLEAN (dead constant)** — `user_id = LEGACY_TRANSIT_USER_ID = 0` (`routeRunRoutes.ts:25`); live `route_runs.user_id` has a single distinct value across all rows. Carries no worker identity. *Cleanup:* drop `rr.user_id` from the SELECT — it serves nothing and reads as a leak. |
| GET `/lead/todays-runs` | `rr.user_id` (returned, `routeRunRoutes.ts:115`) | **CLEAN (dead constant)** — same as above. *Cleanup:* drop it. |
| GET `/lead/route-runs/:id` (`loadRouteRunById`) | `assigned_user_oid` (:32), `assigned_user_name`=`id_dir.display_name` (:33), `assigned_user_role` (:34), `created_by_oid` (:35), `created_by_name`=`creator.display_name` (:36) | **⚠ SANCTIONED EXPOSURE — needs founder ruling.** R11 controlled exception (the "only permitted JOIN to identity_directory," `loadRouteRunById.ts:70-76`): shows the assigned worker + assigning Lead for reassignment. NOT an intelligence/performance surface. NOT rendered by current `LeadRouteDetail` UI — but **is** in the API payload, reachable by any Dispatch client. **Discrepancy:** `routeRunRoutes.ts:31` claims these identity fields are "Admin-gated by loadRouteRunById" — the loader has **no role gate** and the route allows Dispatch, so the claim is not enforced. |
| GET `/ops/clean-logs` | none | **CLEAN** — delegates to `buildCleanLogsCanonicalQueries`; the canonical builder names no identity column. The 2026-06-11 `cl.user_id` leak is **fixed**. |
| GET `/admin/clean-logs` (Admin, not Dispatch) | none | **CLEAN** — same canonical builder. |

**Ordering check (reminder — fixed org sequence, never execution order):** `loadRouteRunById` stop list orders `ORDER BY rrs.sequence`
(`:83`) — correct organizational route sequence. Route *lists* order `rr.created_at DESC` (run-level, not stop execution) — fine.

**No LEAK-class (accidental identity spillage) found.** The one identity exposure is the documented R11 reassignment field set; it is
flagged as a **founder decision**, not auto-classified Blocker, because it is a reviewed, operational exposure — but the founder must
(a) confirm Dispatch-visible assigned-worker identity is intended, and (b) reconcile the inaccurate "Admin-gated" comment.

---

## STEP 5 — Test + CI baseline

- **Backend:** `158 passed, 0 failed` (`npm test`, real local DB). No pre-existing failures.
- **Frontend:** `27 passed` across `5` test files (`vitest run`). No failures.
- **Reconciliation:** the dispatch cited "159/0 on main." That 159 included `resourceRoutesOrgFailClosed.test.ts` from the **unmerged**
  ISSUE-059 branch; `origin/main` @ `779bdbb` is **158**. Not a regression — a branch-not-yet-merged accounting difference.

---

## Stale-spec corrections (spec/audit claim → live truth)

| Source | Claim | Live truth (this pass) |
|---|---|---|
| Capability audit (2026-05-18) D-2 | CC gated at `App.tsx:262` / `adminRoutes.ts:984` | Lines drifted: `App.tsx:262-264`, `adminRoutes.ts:977`. Still Admin-only — accurate in substance. |
| Audit D-1 | "Admin CC has 30s polling; Lead panel does not" | Confirmed: `LeadRoutesPanel` has no polling. |
| Audit D-4 | `PATCH /route-runs/:id/assign` at `:1009` | Drifted to `:1013`. Endpoint present, Dispatch,Admin, audit-logged. No UI. |
| Audit D-5 | history data in `stop_condition_history`/`stop_effort_history`/`hazards` | Two history tables live; **`hazards` is clipped** — a new D-5 must not read it. |
| Audit D-3 | "no `is_adhoc` column"; `POST /route-runs` accepts `stop_ids[]` at `:551` | Confirmed no `is_adhoc`; `stop_ids[]` accepted, drifted to `:591/:595`. |
| Audit A-3 | `GET /api/users` "Lead+Admin, read-only" | Still true; note its org-resolution was hardened separately (ISSUE-059, unmerged). |
| CAPABILITY_BUILD_INDEX (2026-05-19) | T1-CC = single "relocation" card | Split (per Notion): T1-CC-a mechanical relocation + T1-CC-b canonical repoint. **Repoint landed; relocation did not.** |
| Known-stale warning (c) | "CC handlers repointed" | True for clean-logs/`v_*_transit` eviction; **NOT** for CC `/exceptions` hazards/infra tiles — still clipped-adapter reads. |

---

## Proposed phase seams (for operator + PM sequencing — NOT started)

Grouped by dependency and shared surface. Each is a candidate build dispatch.

**Seam A — Dispatch live-monitoring polish (no new backend, no governance gate).**
D-1a (render `completed_stops` as X-of-Y), D-1b (surface exception counts on the list — needs a small backend add to the list query),
D-1c (add polling to `LeadRoutesPanel`), D-4 frontend (reassign control in `LeadRouteDetail`, wiring the existing PATCH). Lowest risk,
highest demo value. *Dependency:* D-1b needs the list query to return hazard/skip counts from canonical (`core.observations`), not the
clipped adapters.

**Seam B — Control Center relocation to Dispatch (governance-gated).**
CC-a (widen the guard + add `/ops/control-center` route + Dispatch nav link). **Founder decision required (F-1):** the Entra Dispatch-role
assignment and the explicit sign-off that live-monitoring belongs to Dispatch. Path A (Dispatch-only CC, no dual-role code) per the
capability index. *Blocked on:* the F-1 role decision; independent of the code once ruled.

**Seam C — Canonical-correctness cleanups (bug-class, do before or alongside B).**
(1) Repoint CC `/exceptions` off `public.hazards`/`public.infrastructure_issues` onto canonical `core.observations` severity, so the
exception/severity tiles are accurate post-clip. (2) Repoint `loadRouteRunById`'s 5 cleaning booleans off clipped `clean_logs` onto the
canonical pivot (same `buildCleanLogsCanonicalQueries` shape the clean-logs endpoints already use). (3) Drop the dead `rr.user_id` from the
two route-list SELECTs. These make Seams A/B read true data.

**Seam D — Stop-history view (D-5) + Ad-hoc creation (D-3), each needs a design decision.**
D-5: new `GET /api/stops/:id/history` over `stop_effort_history` + `stop_condition_history` + `core.observations` (worker-anonymous by
construction) + a read-only drawer in `LeadRouteDetail`. D-3: **founder design decision** on `is_adhoc` (new column + migration) vs.
reusing the existing `stop_ids[]` primitive without a flag; plus the stop-picker UI (the bulk of the work).

### Founder decisions this inventory surfaces
1. **F-1 / CC-a:** Is live-monitoring (Control Center) moving to the Dispatch role? Entra role assignment + sign-off gate Seam B.
2. **Dispatch identity exposure:** Confirm `GET /lead/route-runs/:id` returning `assigned_user_name`/`assigned_user_oid` to Dispatch is
   intended (reassignment necessity), and rule on trimming the raw `assigned_user_oid` (name suffices) + fixing the inaccurate
   "Admin-gated" comment.
3. **D-3 `is_adhoc`:** new column/migration vs. flagless reuse of the `stop_ids[]` primitive.

---

*Read-only discovery. No code/schema/migration changed; this file is the only write. Branch `chore/dispatch-discovery-inventory`,
committed for operator review — do not merge from here; the operator opens/merges and sequences the build dispatches with the PM layer.*
