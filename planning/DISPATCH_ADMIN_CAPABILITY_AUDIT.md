# Capability Audit — Dispatch and Admin Surfaces

> **Date:** 2026-05-18
> **Purpose:** Scope the weeks 3–4 design and build sprint for Dispatch and Admin surfaces.
> **Role names:** Specialist (was UL) / Dispatch (was Lead) / Admin (unchanged)
> **Note:** Four_Surfaces.html was not found in the repo root — audit conducted from live code.

---

## Summary Table

| # | Capability | Surface | Status |
|---|-----------|---------|--------|
| D-1 | Live route monitoring | Dispatch | **PARTIAL** |
| D-2 | Control Center access | Dispatch | **NO** |
| D-3 | Ad-hoc route creation | Dispatch | **NO** |
| D-4 | Route editing on live runs | Dispatch | **PARTIAL** |
| D-5 | Stop-level history view | Dispatch | **NO** |
| A-1 | Pool configuration | Admin | **YES** |
| A-2 | Stop configuration | Admin | **PARTIAL** |
| A-3 | User/role management | Admin | **NO** |
| A-4 | Route template/schedule management | Admin | **NO** |
| A-5 | Audit log viewer UI | Admin | **NO** (API: YES) |
| A-6 | Export-and-delete UI | Admin | **NO** (API: YES) |
| A-7 | System health page | Admin | **NO** |

---

## Dispatch Capabilities

### D-1 — Live Route Monitoring

**Status: PARTIAL**

**What's working:**
- `LeadRoutesPanel.tsx` — lists all route runs (active + completed) for today with pool, status, stop count, date. Clicking a run opens `LeadRouteDetail.tsx` (full stop list with per-stop status badges).
- Backend data: `GET /api/lead/todays-runs` (`routeRunRoutes.ts:107`) and `GET /api/ops/route-runs` (`opsRoutes.ts:256`) return planned/in-progress runs with stop counts.

**What's missing:**
- No exception surfacing in the Dispatch view — no hazard counts, no skip flags, no emergency-stop badges on the route list row.
- No near-real-time refresh — panel loads once on mount and goes stale. Admin Control Center has 30s polling; Lead/Dispatch routes panel does not.
- No progress indicator (X of Y stops complete) on the route list row itself.

**Files involved:**
- `frontend/src/components/LeadRoutesPanel.tsx`
- `frontend/src/components/LeadRouteDetail.tsx`
- `backend/src/modules/routes/routeRunRoutes.ts`
- `backend/src/modules/ops/opsRoutes.ts`

---

### D-2 — Control Center Access for Dispatch

**Status: NO**

**What exists:** `AdminControlCenter.tsx` is a complete component (30s polling, 4-panel layout: snapshot, route status, exceptions, difficulty indicators). It is gated Admin-only in two places:
- Frontend router: `App.tsx:262` — `<RequireRole roles={["Admin"]}>`
- Backend ccRouter: `adminRoutes.ts:984` — `ccRouter.use(requireAuth, requireAdmin)`

No `/ops/control-center` or Dispatch-accessible equivalent endpoint exists.

**Nearest piece to build from:** The Control Center itself — only locked by role guard, not by any capability gap in the component. Expanding access to Dispatch means:
1. Widening the frontend `RequireRole` to include `Lead`.
2. Adding a mirrored `GET /api/ops/control-center/*` set (or opening the Admin endpoints to Lead).
3. Adding the nav link under the Dispatch nav section in `App.tsx`.

**Effort estimate:** Small in code — but carries a governance decision. The control center is currently Admin-only as a policy choice. Expanding to Dispatch needs explicit sign-off.

---

### D-3 — Ad-hoc Route Creation (is_adhoc flag + stop picker)

**Status: NO**

**What exists:**
- `RouteCreatePanel.tsx` — creates routes by selecting pool + crew + shift. Drives `POST /api/route-runs`.
- `POST /api/route-runs` (`routeRunRoutes.ts:551`) accepts an explicit `stop_ids[]` array (Option A), so the backend can create a route from an arbitrary stop list — but the UI only drives pool selection.
- No `is_adhoc` column anywhere in the codebase or schema.

**What's missing:**
- `is_adhoc` boolean column on `route_runs` — requires migration.
- A stop inventory browser UI (search all stops, select individual stops, build a custom list). No frontend component for this.
- Backend to accept and persist `is_adhoc: true` in the create payload.

**Nearest piece:** `POST /api/route-runs` with explicit `stop_ids` is already the backend primitive. `AdminStopsPanel.tsx` is the closest existing UI with a searchable, filterable stop inventory — though it's Admin-only and an edit panel, not a picker.

**Effort estimate:** Medium. Backend + migration is small. The stop picker UI (multi-select with search) is the bulk of the work.

---

### D-4 — Route Editing on Live Route Runs

**Status: PARTIAL**

**What's working:**

| Operation | API | Auth | UI |
|-----------|-----|------|-----|
| Reassign run to different crew | `PATCH /api/route-runs/:id/assign` (`routeRunRoutes.ts:1009`) | Lead+Admin | ❌ No UI |
| Add stop override (exclude from future planning) | `POST /api/route-overrides/add` (`routeOverrideRoutes.ts:134`) | Lead+Admin | ❌ No UI |
| Remove override | `DELETE /api/route-overrides/:id` (`routeOverrideRoutes.ts:195`) | Lead+Admin | ❌ No UI |

**What's missing:**
- Reassign UI: `LeadRouteDetail.tsx` shows pool/status/date + stop list but has no reassign control. The API is complete and audit-logged — frontend just doesn't expose it.
- Add/swap/remove a stop on a live `route_run_stops` list: No backend endpoint exists. Would require `POST /api/route-runs/:id/stops` (add emergency stop) and `DELETE /api/route-runs/:id/stops/:rrs_id` (remove pending stop). Conflict handling needed if stop is already `in_progress`.

**Files involved:**
- `backend/src/modules/routes/routeRunRoutes.ts` (reassign API)
- `backend/src/modules/routeOverrides/routeOverrideRoutes.ts` (pool-level overrides)
- `frontend/src/components/LeadRouteDetail.tsx` (needs reassign control + stop edit controls)

**Effort estimate:** Reassign UI = Small. Add/remove live stops = Medium (backend + frontend + conflict guard).

---

### D-5 — Stop-Level History View

**Status: NO** (data exists in DB; no API endpoint, no frontend component)

**What exists in DB:**

| Table | Key columns | Written by | Notes |
|-------|-------------|-----------|-------|
| `stop_condition_history` | `stop_id`, `visit_id`, `scored_at`, `cleanliness_score`, `safety_score`, `infra_score` | `riskMapService.ts` on every risk rebuild | Worker-anonymous |
| `stop_effort_history` | `stop_id`, `visit_id`, `duration_minutes` | `cleanLogService.ts` on stop completion | Worker-anonymous |
| `hazards` | `stop_id`, `reported_at`, `hazard_type`, `severity` | Field worker flow | Worker-anonymous at query level |

**What's missing:**
- Backend endpoint: `GET /api/stops/:id/history` — query the three tables by `stop_id`, return recent condition scores, effort durations, hazards.
- Frontend: A stop history drawer or sub-panel reachable from the Dispatch stop list in `LeadRouteDetail`. No component exists.

**Effort estimate:** Small–Medium. Backend endpoint is straightforward queries on three known tables. Frontend is a new read-only display component only.

---

## Admin Capabilities

### A-1 — Pool Configuration

**Status: YES**

**Backend:**
- `GET /api/admin/pools` — list all pools
- `POST /api/admin/pools` — create pool (id + label required)
- `PATCH /api/admin/pools/:id` — update label or active flag
- `DELETE /api/admin/pools/:id` — soft-delete (sets `active = false`)
- All write operations: `adminRoutes.ts:173–316`, all audit-logged with `admin.config_change`

**Frontend:** `AdminPoolsPanel.tsx` — create by name, disable (soft-delete), paginated list with active badge. Admin-only (`/admin/pools`). Also available read-only to Lead via `/ops/pools`.

**DB tables:** `route_pools`, `stop_pool_memberships`

**Minor gaps:**
- No edit-pool-name inline UI (PATCH supports it but there's no form field — only create + disable are exposed).
- `stop_pool_memberships.shift_type` (day/night/all_day eligibility) is not exposed in the UI.

---

### A-2 — Stop Configuration

**Status: PARTIAL**

**Backend:**
- `GET /api/admin/stops` — paginated, searchable, filterable by pool (`adminRoutes.ts:361`)
- `PATCH /api/admin/stops/:id` — update `pool_id`, `active`, `is_hotspot`, `compactor`, `has_trash`, `notes` (`adminRoutes.ts:423`)
- `POST /api/admin/stops/bulk` — bulk update flags/pool across multiple stops (`adminRoutes.ts:484`)

**Frontend:** `AdminStopsPanel.tsx` — inline row editing of pool assignment, notes, flag toggles (hotspot/compactor/trash); bulk flag operations; paginated search with pool filter.

**What's missing:**
- No `POST /api/admin/stops` to create a net-new stop. Stops originate from `transit_stops` (external data import). No admin UI path to add a stop that doesn't already exist in the inventory.
- No explicit "Retire" button in the UI — `active` is PATCH-able on the backend but not exposed as a toggle in the current component. Only flags (hotspot/compactor/trash) and pool assignment are inline-editable.

**Effort estimate for gaps:** Retire button = Small. Create-stop from UI = Medium (requires design around which fields are required and how it relates to `transit_stops`/`public.assets`).

---

### A-3 — User/Role Management

**Status: NO** (open as ISSUE-010)

**What exists:**
- `identity_directory` table: auto-populated by `requireAuth` middleware on every login (`authz.ts:98`). Fields: `oid`, `org_id`, `display_name`, `email`, `last_seen_role`, `last_seen_at`.
- `GET /api/users` (`resourceRoutes.ts:136`) — returns UL+Lead users from `identity_directory` for assignment dropdowns. Lead+Admin. Read-only.
- `admin.user_role_change` is registered in `AUDIT_KNOWN_ACTIONS` (`auditActions.ts:17`) — audit event defined but no handler writes it.

**What's missing — entirely:**
- `GET /api/admin/users` — list all users in `identity_directory` (all roles), with last-seen-role and last-seen-at.
- `PATCH /api/admin/users/:oid/role` — change a user's role (writes `admin.user_role_change` audit entry).
- `PATCH /api/admin/users/:oid` — deactivate a user.
- Frontend: `AdminUsersPanel` component — does not exist.

**Design constraint:** In real Entra auth, roles are Azure app role assignments. The canonical role source is Azure AD, not the app DB. `identity_directory.last_seen_role` is a cache of the last token claim — not a writable source of truth. "Role management" in the app is either (a) read-only display of what Entra says, or (b) a local override layer. This decision gates scope.

**Effort estimate:** Medium (API + UI). The Entra vs. local-override design question may expand or constrain scope before implementation begins.

---

### A-4 — Route Template / Schedule Management

**Status: NO**

**What exists:** None. There are no tables, endpoints, or frontend components for recurring route templates, schedules, or cron-driven route creation. The closest structure is `route_pools` (a pool defines a stop set that can be routed daily) — but template configuration, schedule cadence, and auto-creation are not implemented.

**What `sftpExport.ts` touches:** A comment references "nightly at 02:00 local time" as a recommended scheduler cadence for the EAM bridge export script — this is an external cron, not an in-app scheduling system.

**Nearest pieces:**
- `route_pools` + `POST /api/route-runs` — the data and API primitive for creating a route from a pool exist.
- An in-app schedule system would need: a `route_templates` table (pool_id, shift_type, run_days_of_week, auto_create), a schedule runner (cron job or pg_cron), and an Admin UI to configure templates.

**Effort estimate:** Large. No foundation exists. Requires new schema, backend service, cron infrastructure, and UI.

---

### A-5 — Audit Log Viewer UI

**Status: NO (API: YES)**

**API:** `GET /api/admin/audit-log` (`adminRoutes.ts:817`) — fully implemented. Supports date range, action filter, JSON or CSV response. Max 1000 rows per request, max 365-day window. The endpoint itself writes an `admin.audit_log_read` audit entry.

**Frontend:** No audit log viewer component exists anywhere in `frontend/src/`. The API response is never fetched or displayed in the app.

**Nearest piece:** `DataTable.tsx` — generic paginated table component that would host the audit log rows. All the column data (`action`, `resource_type`, `resource_id`, `occurred_at`, `ip_address`) maps cleanly to table columns.

**Effort estimate:** Small. Backend is complete. Frontend is a new page component + API call + `DataTable` wiring. No new backend work required.

---

### A-6 — Export-and-Delete UI

**Status: NO (API: YES)**

**API — complete four-step flow:**
- `POST /api/admin/export-and-delete/request` — builds gzipped JSON export bundle, generates one-time confirmation token, returns token + download path. Writes `export.data_export` + `export.delete_confirm` audit entries.
- `GET /api/admin/export-and-delete/export/:token_id` — downloads the gzipped bundle.
- `POST /api/admin/export-and-delete/execute` — consumes confirmation token, hard-deletes all canonical org data in a single transaction, writes `export.delete_execute` audit entry.
- All endpoints: `exportDeleteRoutes.ts`, Admin-only.

**Frontend:** No export-and-delete UI component exists. The flow requires surfacing the confirmation token to the admin in a way that makes the two-step pattern (export → review → execute) explicit and hard to trigger accidentally.

**Effort estimate:** Small–Medium. Backend is complete. Frontend is a purpose-built multi-step flow UI — needs careful design around the irreversibility warning. New component only.

---

### A-7 — System Health Page

**Status: NO**

**What exists:** `AdminDashboard.tsx` displays 4 aggregate counters: total stops, total pools, active runs today, completed runs today — sourced from `GET /api/admin/dashboard` (`adminRoutes.ts:54`).

**What's missing from the required spec:**
| Metric | Data available? | API endpoint? |
|--------|----------------|---------------|
| User count by role | `identity_directory` table | No endpoint |
| Stop count (active/retired) | `transit_stops.active` / `public.stops` | Partial — dashboard has total, not active/retired split |
| Pool count | `route_pools` | Yes (in dashboard) |
| Route runs yesterday by status | `route_runs` table | No endpoint (dashboard is today-only) |
| Visits yesterday | `core.visits` | No endpoint |
| EAM bridge last successful export + recent failures | `eam_bridge_route_log` | No endpoint |
| Audit log volume (24h / 7d) | `audit_log` | No endpoint |
| Open hazards count | `hazards` table | No endpoint |
| Open infrastructure issues count | `infrastructure_issues` table | No endpoint |

**Nearest piece:** `GET /api/admin/dashboard` is the seed. All data sources exist in the DB. Requires a new `GET /api/admin/health` endpoint that aggregates across these tables, and a new frontend page component.

**Effort estimate:** Medium. Backend is multiple queries (most simple count/filter queries). Frontend is a new page with a data grid or card layout.

---

## Build Priorities for Weeks 3–4

Based on the audit, items ranked by (a) fetch-from-nothing vs. build-on-what-exists, and (b) pitch-readiness impact:

| Priority | Item | Effort | Why |
|----------|------|--------|-----|
| 1 | D-2: Control Center → Dispatch | Small | Role guard change only; highest visibility for demo |
| 2 | A-5: Audit log viewer UI | Small | API complete; `DataTable` wiring only; TPRA artifact |
| 3 | D-1: Add polling + exceptions to route list | Small | Brings Dispatch surface to pitch-ready state |
| 4 | D-5: Stop history view (API + display) | Small–Med | New endpoint + read-only component; strong demo story |
| 5 | A-6: Export-and-delete UI | Small–Med | API complete; needed for TPRA data rights demo |
| 6 | D-4: Reassign UI (only) | Small | API complete; just a dropdown + submit in RouteDetail |
| 7 | A-2: Retire stop button | Small | Gap in existing panel; one PATCH call |
| 8 | A-7: System health page | Medium | New endpoint + page; strong operational credibility |
| 9 | D-3: Ad-hoc route creation | Medium | Stop picker UI is the bulk; backend primitive exists |
| 10 | A-3: User/role management | Medium | Design question on Entra vs. local must resolve first |
| 11 | D-4: Add/remove live stops | Medium | No backend; conflict handling adds risk |
| 12 | A-4: Route template/schedule | Large | No foundation; post-pilot scope |
