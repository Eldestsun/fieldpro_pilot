# Three-Workspace Maturity Map — Specialist / Dispatch / Admin

> **Date:** 2026-06-22
> **Type:** RECON-ONLY. No code changes, no board status changes were made producing this.
> **Purpose:** A verified, per-workspace map of what exists, what's wired, and what's
> net-new across BASELINE's three role surfaces — built from PROOF (file existence, grep,
> git log, the running route/component files, and the live Notion board), not from
> recollection or the stale `CAPABILITY_BUILD_INDEX.md`. This map is the substrate the
> Capability Build sequences against.
> **Method:** App.tsx routing read directly; three parallel file-backed surface inventories;
> Notion BASELINE Work Tracker (collection `51c4c465…`) read card-by-card; git log per
> surface; backend read-path greps.
> **Board note:** Notion SQL/view query modes require an Enterprise plan and returned 402;
> cards were retrieved via scoped semantic search + per-card fetch. Card statuses below are
> as of the fetch timestamps shown on each card.

---

## Bottom Line (read this first)

| Workspace | Founder hypothesis | Verdict from proof |
|-----------|-------------------|--------------------|
| **Specialist** | ~98%, pilot-ready, polish post-pilot | **CONFIRMED ~97–98%.** Full capture flow built + wired + offline-complete. Real gaps are test depth and an incomplete infra-photo persist, not capability. |
| **Dispatch** | Skeleton → needs overhaul | **PARTIALLY WRONG.** Not a skeleton — four wired components + three reused read-only Admin panels. The real work is *modification to the locked viewing model* + *relocating the Control Center in*, not greenfield build. |
| **Admin** | Net-new / greenfield (zero surface) | **DECISIVELY WRONG for the 4 mounted panels** (~1,118 LOC, all wired, incl. a 489-LOC live Control Center). **TRUE only for A-5 / A-6 / A-7 / A-3** governance surfaces (no component exists). |

**Which workspace is ready to move to a build dispatch:** **None can be dispatched yet under
phase discipline** — every Capability Build card is **P2-Capability**, and there is **open P1
work** (D3 view-eviction is P1/Backlog; ISSUE-038/039 clean-build deploy-gate is in flight on
the current branch). P1 must clear first. *Once P1 clears,* the **Admin TPRA-blocking pair
(T1-A5, T1-A6)** is the cleanest first dispatch: both `Ready`, both build a net-new UI on a
**complete, verified backend**, neither touches the contested Dispatch viewing model.
**Board reconciliation required before any Dispatch dispatch** — see §Dispatch-C and the
Control Center note in Knot 1.

---

## 1. SPECIALIST (field worker; role formerly "UL")

Route: `/work` → `TodayRouteView`, guarded `RequireRole={["Specialist","Dispatch"]}` (`App.tsx:226`).

### A. Maturity verdict — CONFIRMED ~97–98% pilot-complete

The capture flow is built end-to-end, wired to live endpoints, and offline-complete. This is
the most mature surface by a wide margin and the git history backs it (Tier 1 canonical
completeness `689faed`-era, R4 offline hardening, R5 Surface 2/3 UI rebuild, ISSUE-007 hazard
severity, ISSUE-036 photo→`core.evidence` repoint).

**Strongest evidence FOR:** every specialist action — start route, start stop, complete stop,
skip-with-hazard, finish route, photo upload/fetch, hotspot toggle — calls a real
`/api/...` endpoint (`frontend/src/api/routeRuns.ts`, 952 LOC); the offline layer (cache +
action queue + photo blob store + draft store + replay manager) is fully wired, not scaffold;
zero `user_id=123`-style stubs in the surface.

**Strongest evidence AGAINST 100%:** test coverage is thin (3 test files: `StopWizard`,
`StopListItem`, `offlineQueue`; no hook/E2E/replay-with-real-IndexedDB tests). Infra-photo
capture is scaffolded in `StopDetail.tsx` but `photo_key` is **not** persisted into the infra
payload (in-code comment "photo_key not supported in InfraIssuePayload"). Skip endpoint returns
the stop, not the full route (handled by local state sync). None of these are pilot blockers.

### B. Capability inventory

| File | Lines | State | Proof |
|------|------:|-------|-------|
| `components/TodayRouteView.tsx` | 321 | BUILT+WIRED | `useTodayRoute()`; renders StopList/StopDetail/RouteSummary; `baseline:after-replay` refresh listener |
| `components/today-route/StopDetail.tsx` | 1388 | BUILT+WIRED | Full active-stop wizard: safety modal (hazard+severity+photo), infra modal, cleaning tasks + trash volume, photo capture, after-photo gate, spot-check mode, skip-with-hazard |
| `hooks/useTodayRoute.ts` | 680 | BUILT+WIRED | start/finish route, start/complete/skip stop; enqueues offline actions; `uploadPhotos`/`fetchPhotos` |
| `api/routeRuns.ts` | 952 | BUILT+WIRED | Live: `/api/ul/todays-run`, `/route-runs/:id/start|finish`, `/route-run-stops/:id/start|complete|skip-with-hazard`, signed-url + S3 photo upload, `/photos` |
| `offline/offlineQueue.ts` | 575 | BUILT+WIRED | enqueue/dedupe/persist/replay of START/COMPLETE/SKIP/UPLOAD actions |
| `offline/OfflineSyncManager.tsx` | 184 | BUILT+WIRED | online-event replay; reconstructs File from IndexedDB; refresh dispatch |
| `offline/photoStore.ts` / `stopDraftStore.ts` / `todayRouteCache.ts` | 130 / 137 / 41 | BUILT+WIRED | IndexedDB photo blobs; 24h-fresh per-stop drafts; route cache fallback |
| `components/work/ULRouteMap.tsx` | 196 | BUILT+WIRED | MapLibre stop markers, active highlight, GPS validation, nav-out |
| `today-route/{StopList,StopListItem,RouteHeader,UlLayout}.tsx` | 23/85/66/9 | BUILT+WIRED | list + per-stop card (status/flags/sync badges) + progress header |
| `today-route/__tests__/*`, `offline/offlineQueue.test.ts` | — | TEST (thin) | Wizard, list-item, ISSUE-001 spot-check pending-count regression only |

**STUBBED:** none material. **NET-NEW:** none — surface is feature-complete.

### C. Card-to-reality reconciliation

No open Capability-Build cards target the Specialist surface (it predates this track; its work
landed under Refactor Tier 1 / Refinement R4–R5 / ISSUE-007 / ISSUE-036). **MATCHES reality** —
the board correctly carries no "build Specialist" work. Residual polish (test depth, infra-photo
persist) is not yet carded; capturing it as a small post-pilot card is optional.

---

## 2. DISPATCH (operational leadership; role formerly "Lead")

Routes: `/routes` → `LeadRoutesPanel`; `/routes/:id` → `LeadRouteDetail`; plus `/ops/dashboard`,
`/ops/pools`, `/ops/stops` which **reuse the Admin panels with `scope="ops"`** (read-only).
Guards `RequireRole={["Dispatch","Admin"]}` (`App.tsx:230-236`, `266-275`). The Control Center
is **not yet on this surface** — still Admin-only.

### A. Maturity verdict — "skeleton needing overhaul" is INACCURATE

Dispatch is a **well-wired but viewing-model-noncompliant prototype**, not a skeleton. Route
list, route detail, completed-route drill-in, and route creation are all built and wired
(`LeadRoutesPanel` got an R5 enterprise rebuild — git `9ce4720`). The actual remaining work is
**(1) modify the existing surfaces to the locked Dispatch viewing model**, **(2) relocate the
Control Center in (T1-CC-a)**, and **(3) add the two missing read surfaces (D-1 exceptions/poll,
D-5 stop history)** — none of which is a from-scratch build.

### B. Capability inventory + locked-viewing-model classification

Locked frame (not re-litigated here): operational surface renders **no time/duration/timestamp**;
route grain = **x-of-y stops + scheduled shift-end**; stop order = fixed org sequence; route-list
order = identity or coverage-% only; **the route is the identity**.

| Component | Lines | State | vs. locked model | Proof |
|-----------|------:|-------|------------------|-------|
| `LeadRoutesPanel.tsx` | 137 | BUILT+WIRED | **MODIFY** | `getOpsRouteRuns()`; list renders day-grain `run_date` (OK) but has no x-of-y progress, no exceptions, no poll (D-1 gaps) |
| `LeadRouteDetail.tsx` | 123 | BUILT+WIRED | **SURVIVES** | `getLeadRouteRunById()`; renders status/pool/date + stop list, **no time/duration/worker** rendered |
| `LeadCompletedRouteDetail.tsx` | 148 | BUILT+WIRED | **MODIFY (real violation)** | `getOpsCleanLogs()`; **line ~128 renders `new Date(log.cleaned_at).toLocaleString()`** — a timestamp; violates no-time rule, must drop the column |
| `RouteCreatePanel.tsx` | 163 | BUILT+WIRED | **CONFIRM (likely SURVIVES)** | shows assignee `displayName` in the assign picker (line ~69). Per `T1-D4` spec §Labor Safety, **assignment is intent** and name-in-picker is explicitly permitted; this is *not* the prohibited per-worker-metric case. Founder to confirm; do not reflexively cut. |
| `AdminDashboard` (scope="ops") | 100 | BUILT+WIRED (reuse) | **SURVIVES** | aggregate counters only; scope-branched endpoint |
| `AdminPoolsPanel` (scope="ops") | 158 | BUILT+WIRED (reuse) | **SURVIVES** | `isReadOnly = scope==="ops"` gates mutations |
| `AdminStopsPanel` (scope="ops") | 371 | BUILT+WIRED (reuse) | **SURVIVES** | same read-only gate; static columns |

**NET-NEW for Dispatch:** D-5 stop-history view (no component, no API endpoint — T2-D5); D-1
exception/poll enrichment of the route list. **RELOCATE-IN:** the Control Center (T1-CC-a) — but
see the Control Center modification flag in Knot 1.

### C. Card-to-reality reconciliation

| Card | Board status | Reality | Verdict |
|------|--------------|---------|---------|
| **T1-CC-a** Control Center relocation Admin→Dispatch | Ready, P2, dep **F-1** | CC exists Admin-only (489 LOC); relocation not done | **MATCHES** (but scope drift — see Knot 1: it also needs viewing-model MODIFICATION, not pure mechanical move) |
| **T1-D4** Reassign UI (Dispatch) | Ready, P2, dep "API complete" | API verified present; UI absent in `LeadRouteDetail` | **MATCHES** — see Knot 2 |
| **T2-D5** Stop-level history view | Ready, P2 | no API endpoint, no component | **MATCHES** (genuinely net-new) |
| **T3-D3** Ad-hoc route creation | Founder-Decision, P2 | `POST /route-runs` accepts `stop_ids[]`; no `is_adhoc`, no stop-picker UI | **MATCHES** — correctly parked on a design decision |
| **D-4-add** add/remove live stops | deferred post-pilot | no backend endpoint | **MATCHES** |

---

## 3. ADMIN (governance)

Routes: `/admin/{dashboard,pools,stops,control-center}`, all `RequireRole={["Admin"]}`
(`App.tsx:254-263`). Git: R5 Surface 5 (`05c1a43`, dashboard/pools/stops enterprise rebuild),
R5 Surface 6 (`6191f96`, AdminControlCenter rebuild), R6/ISSUE-002/003 CC live updates.

### A. Maturity verdict — "greenfield" is DECISIVELY FALSE for the mounted panels

Four components, ~1,118 LOC, all wired to backend endpoints, including a sophisticated 489-LOC
live Control Center (30s polling, 4-panel layout). Admin is the *most enterprise-rebuilt*
surface, not the emptiest. "Greenfield" is true **only** for the four governance surfaces that
have a complete backend but **no UI component**: A-5 audit-log viewer, A-6 export-and-delete,
A-7 system-health, A-3 user directory.

### B. Capability inventory

| Component | Lines | State | Proof / endpoints |
|-----------|------:|-------|-------------------|
| `admin/AdminDashboard.tsx` | 100 | BUILT+WIRED | 4 counters (stops/pools/active/completed); `getDashboard(scope)` → `/api/admin/dashboard` \| `/api/ops/dashboard` |
| `admin/AdminPoolsPanel.tsx` | 158 | BUILT+WIRED | full CRUD: GET/POST/DELETE `/api/admin/pools`; read-only when `scope="ops"` |
| `admin/AdminStopsPanel.tsx` | 371 | BUILT+WIRED | search/filter/inline-edit/bulk-flags; `/api/admin/stops` GET/PATCH + `/bulk` |
| `admin/AdminControlCenter.tsx` | 489 | BUILT+WIRED | 30s poll (`POLL_INTERVAL_MS=30_000`, `setInterval`); 4 panels (snapshot/route-status/exceptions/difficulty); fetches 4 `/api/admin/control-center/*` endpoints |

**NET-NEW (no component exists; backend complete):**

| Cap | Backend (verified present) | Frontend |
|-----|----------------------------|----------|
| **A-5** Audit-log viewer | `GET /api/admin/audit-log` (`adminRoutes.ts:817`) — filters, CSV/JSON | NET-NEW (T1-A5) |
| **A-6** Export-and-delete | `exportDeleteRoutes.ts` 3-step request/export/execute | NET-NEW (T1-A6) |
| **A-7** System-health page | partial; needs a `/api/admin/health` aggregator | NET-NEW (no card dispatched here yet beyond T2-A7) |
| **A-3** User directory (read-only) | `GET /api/users` (`resourceRoutes.ts`) + `tenantRoutes.ts` | NET-NEW (T3-A3) |

### B-note (cross-surface, important). `AdminControlCenter.tsx` renders **`observed_minutes`
durations (≈line 329)** and **relative timestamps ("Updated N ago", `formatRelativeTime`)**.
These are acceptable on the *Admin* governance surface but **violate the locked Dispatch viewing
model**. Therefore T1-CC-a ("mechanical move, reads unchanged") is mis-scoped: relocating the CC
to Dispatch requires **stripping time/duration rendering** as part of the move. This is a board
bug to fix before dispatch — see Knot 1.

### C. Card-to-reality reconciliation

| Card | Board status | Reality | Verdict |
|------|--------------|---------|---------|
| **T1-A5** Audit-log viewer UI | Ready, P2, deps done | backend complete, no UI | **MATCHES** — clean net-new-on-verified-backend |
| **T1-A6** Export-and-delete UI | Ready, P2, deps done | backend complete, no UI | **MATCHES** |
| **A-4** Route templates | deferred post-pilot | no foundation | **MATCHES** |

---

## Knot 1 — T1-CC-b split: real remaining work, or already done?

**RESOLVED: T1-CC-b is EMPTY. The canonical repoint already happened in P1 and is verified in
code.**

Evidence chain:
1. Board card **"P1 — Control Center reads → canonical (in place, adminRoutes.ts)"** is **Done**
   — branch `feat/issue-031-p1-cc-repoint`, commit **`ba660c3`**, completed 2026-06-14; all five
   reader sites in `adminRoutes.ts` repointed `/overview` + `/difficulty` to
   `core.visits` / `core.observations`; 111 tests pass; severity decision A2 applied.
2. Card **T1-CC-b** carries its own banner: *"SUPERSEDED … by the time the P2 relocation runs,
   these handlers already read canonical — so there is nothing left for a separate T1-CC-b
   repoint to do. This card is redundant."* (Status: Backlog, P2.)
3. **Code proof (today):** `grep -rn "v_clean_logs_transit\|v_hazards_transit" backend/src
   --include="*.ts"` → **exit 1, zero matches.** `adminRoutes.ts` reads `core.visits` /
   `core.observations` with a pinned `SAFETY_HAZARD_OBSERVATION_TYPES` constant (line 964) and
   `ISSUE-031/CC-REPOINT` markers at lines 1019-1056 and 1384-1481. The transit views have no
   readers left.

**Caveat that survives:** the **D3** card (re-touched 2026-06-22) keeps the word "repoint" in its
*title*, but its `Depends On` and body confirm the repoint is owned by the Done P1 card; D3's only
remaining real work is **dropping `v_clean_logs_transit` + `v_hazards_transit`** (P1, Backlog),
now additionally framed as **labor-safety-gated** (ISSUE-039 recon: `mcp_readonly` still holds
SELECT on both; they are identity-clean today only because base columns are constant-0 — a data
coincidence, not a guarantee).

**Second-order finding (board bug):** T1-CC-a is labeled "mechanical move, reads UNCHANGED," but
the relocated component renders durations + timestamps that violate the Dispatch viewing model.
**The relocation cannot be purely mechanical** — it must strip time/duration. Sever the
"reads/render unchanged" framing on T1-CC-a before dispatch.

**Action before any CC dispatch:** (a) close/repurpose T1-CC-b as a post-move verification
checkpoint; (b) re-scope T1-CC-a to "relocate + conform-to-viewing-model (strip time/duration)";
(c) D3 view-eviction proceeds independently as P1 once readers are confirmed zero (they are).

## Knot 2 — T1-D4 framing: UI on an existing verified mechanism?

**RESOLVED: CONFIRMED. The reassignment mechanism exists and is verified; T1-D4 is UI-only.**

Mechanism (code proof, not card claim):
- `PATCH /route-runs/:id/assign` at `backend/src/modules/routes/routeRunRoutes.ts:1009`, gated
  `requireAuth, requireAnyRole(["Dispatch","Admin"])`. Runs inside `withOrgContext(...)`
  (RLS-correct), reads prior `assigned_user_oid`, calls `assignRouteRun`, then **audit-writes
  `assignment.create | assignment.reassign | assignment.cancel`** depending on prior state
  (lines ~1040-1065). Empty-string body → 400.
- `assignment.reassign` is registered in `backend/src/middleware/auditActions.ts:11`.
- Assignee list endpoint `GET /api/users` (`resourceRoutes.ts`) exists for the picker.
- The spec `planning/capability-build/specs/T1-D4-reassign-ui.md` §Context already records this
  as **"What exists (verified)"** and **"Backend: No changes."** Done-criteria are entirely
  frontend (`reassignRouteRun` client fn + a modal in `LeadRouteDetail.tsx`).

**T1-D4 is the smallest Capability-Build item and is correctly framed.** Not greenfield.

---

## Enumeration-artifact check (the SURVIVES / MODIFIED / CUT / INTELLIGENCE-ONLY classification)

**NOT FOUND on disk or Notion — flag for capture.**

`grep -rniE "survives|intelligence-only|x-of-y|the route is the identity|shift-end|viewing
model|unconstrained capabilit"` across `docs/ planning/ specs/` returns only **table-level**
adapter-clip classifications (`docs/audit/2026-06-06-transit-adapter-complete-inventory.md`,
`2026-06-07-adapter-boundary-reconciliation.md`, `2026-06-11-issue-031-calibration-decisions.md`)
— i.e. "which *tables* survive/clip," **not** the prior-session enumeration of *unconstrained
capabilities* classified SURVIVES / MODIFIED / CUT / INTELLIGENCE-ONLY against the locked
Dispatch viewing model. No hit for "x-of-y," "the route is the identity," "shift-end," or
"viewing model" anywhere in the planning corpus.

The closest existing artifact is `planning/DISPATCH_ADMIN_CAPABILITY_AUDIT.md` (2026-05-18) — a
capability enumeration with YES/NO/PARTIAL status — but it **predates** the locked viewing model
and carries **no** SURVIVES/MODIFIED/CUT classification against it.

**Recommendation:** capturing the prior session's enumeration + viewing-model classification is a
**separate small task**. The §Dispatch-B table above is a partial reconstruction for the existing
components, but the *unconstrained* enumeration (everything the surface *could* show, then
classified) is not on disk and should be written before the Dispatch build is sequenced.

---

## Appendix — board cards read (status as of fetch)

| Card | Issue ID | Phase | Status | Owner |
|------|----------|-------|--------|-------|
| P1 — Control Center reads → canonical (in place) | ISSUE-031/CC-REPOINT | P1 | **Done** | Agent |
| D3 — Evict transit views (+legacy "repoint" title) | ISSUE-031/D3 | P1 | Backlog | Agent |
| T1-CC-a — CC relocation Admin→Dispatch | T1-CC-a | P2 | Ready (dep F-1) | Agent |
| T1-CC-b — CC canonical repoint | T1-CC-b | P2 | Backlog (**SUPERSEDED**) | Agent |
| T1-D4 — Reassign UI (Dispatch) | T1-D4 | P2 | Ready | Agent |
| T1-A5 — Audit-log viewer (Admin) | T1-A5 | P2 | Ready | Agent |
| T1-A6 — Export-and-delete (Admin) | T1-A6 | P2 | Ready | Agent |
| T2-D5 — Stop-level history (Dispatch) | T2-D5 | P2 | Ready | Agent |
| T3-D3 — Ad-hoc route creation (Dispatch) | T3-D3 | P2 | Founder-Decision | Founder-Decision |
| F-1 — Assign Dispatch role in Entra | F-1 | P2 | (Founder-Infra) | Founder-Infra |
| A-4 / D-4-add — templates / live-stop edit | — | — | deferred post-pilot | — |

**Phase-discipline reconciliation:** all Capability Build cards are **P2**. Open **P1** work
exists (D3 view-eviction; plus the ISSUE-038 migration-runner drift and ISSUE-039 `mcp_readonly`
clean-build deploy-gate cards, the latter in flight on branch
`chore/issue-039-mcp-readonly-canonical-grant`). Per the hard phase rule, **no P2 Capability
Build card may start while P1 is open.** Clear P1 (close the clean-build gate + drop the two dead
views) first; then dispatch T1-A5 / T1-A6 as the cleanest opening moves.
