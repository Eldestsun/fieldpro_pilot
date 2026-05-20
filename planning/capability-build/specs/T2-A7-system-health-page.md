# T2-A7 — System Health Page

| Field | Value |
|-------|-------|
| ID | T2-A7 |
| Capability | Admin operational-health dashboard beyond the existing 4-counter dashboard |
| Surface | Admin |
| Tier | 2 |
| Type | Code (backend + frontend) |
| Depends on | Role rename workstream complete |
| Blocks | "Operational credibility" demo story |
| Status | 🔴 Not started |
| Last updated | 2026-05-19 |

---

## Purpose

The existing `AdminDashboard.tsx` shows four counters (stops, pools, active
runs today, completed runs today). The pilot needs a richer Admin health
page that surfaces volume, status, and integration health across the
system — without crossing into operational live-views (those live on the
Dispatch Control Center).

This spec adds a new aggregation endpoint and a new page.

Users: Admin verifying overall system health (volumes, integration last-run
status, open issues counts). Compliance reviewers during TPRA demos.

---

## Context

### What exists (verified)

- **Existing dashboard endpoint**: `GET /api/admin/dashboard` at
  `backend/src/modules/admin/adminRoutes.ts:54`. Returns total_stops,
  total_pools, active_runs_today, completed_runs_today. Verified at lines
  54–86.
- **Existing dashboard component**: `frontend/src/components/admin/
  AdminDashboard.tsx` (100 lines). Mounted at `/admin/dashboard` and
  `/ops/dashboard`.
- **Tables that hold the data the audit lists**: `identity_directory`,
  `transit_stops`, `route_pools`, `route_runs`, `core.visits`,
  `eam_bridge_route_log`, `audit_log`, `hazards`, `infrastructure_issues`.
  All have RLS active per the post-S1 RLS extension.

### What does not exist

- No `GET /api/admin/health` endpoint.
- No system health page component.

---

## What to Build

Implementation order:

### 1. Backend — new aggregation endpoint

Add `GET /api/admin/health` to `adminRoutes.ts`. Admin-gated by parent
middleware. Returns a structured aggregation of system counts and
integration statuses.

Response shape:

```json
{
  "as_of": "2026-05-19T12:00:00Z",
  "users": {
    "by_role": { "Specialist": 12, "Dispatch": 3, "Admin": 2 },
    "active_last_30d": 14
  },
  "stops": {
    "active": 1240, "retired": 35, "total": 1275
  },
  "pools": {
    "active": 8, "inactive": 1, "total": 9
  },
  "route_runs_yesterday": {
    "planned": 7, "in_progress": 0, "completed": 6, "cancelled": 1
  },
  "visits_yesterday": 142,
  "eam_bridge": {
    "last_successful_export_at": "2026-05-18T02:03:11Z",
    "recent_failures_7d": 0
  },
  "audit_log": {
    "rows_24h": 312, "rows_7d": 2104
  },
  "open_issues": {
    "hazards_open": 4,
    "infrastructure_issues_open": 2
  }
}
```

Implementation notes:
- Run as parallel queries inside `withOrgContext()`. All queries are
  simple `SELECT COUNT(*) ... WHERE ...`. Total endpoint latency target
  < 500 ms on dev data.
- `users.by_role` aggregates from `identity_directory.last_seen_role`.
  Use the post-rename role strings (`Specialist`, `Dispatch`, `Admin`)
  — the rename workstream is expected to have backfilled
  `identity_directory.last_seen_role` by the time this ships. If not,
  treat the role strings as opaque and bucket whatever comes back.
- `users.active_last_30d` = count of distinct `oid` in `identity_directory`
  with `last_seen_at > now() - interval '30 days'`.
- `route_runs_yesterday` uses `run_date = CURRENT_DATE - INTERVAL '1 day'`.
- `eam_bridge.last_successful_export_at` =
  `MAX(exported_at) FROM eam_bridge_route_log WHERE status = 'exported'`.
- `eam_bridge.recent_failures_7d` = count of `status = 'failed'` in last
  7 days.
- `audit_log.rows_24h` / `rows_7d` are simple range counts.
- `open_issues.hazards_open` = `hazards WHERE status = 'open'` (verify
  the open status string in the hazards table).
- `open_issues.infrastructure_issues_open` = same pattern.

### 2. Frontend API client

Add `getSystemHealth(token)` to `frontend/src/api/admin.ts` (or wherever
admin API helpers live).

### 3. Frontend page

Add `frontend/src/components/admin/AdminSystemHealthPanel.tsx`. Render
each section of the response as an `OpsCard` with a small grid of
key:value pairs. No charts — a Tier 2 page should be readable and
demoable at low complexity.

Polling: refresh on mount; manual refresh button. No auto-poll (this is
not a live-view; that lives in CC).

### 4. Routing + nav

`frontend/src/App.tsx`:
- New route `/admin/system-health` gated `<RequireRole roles={["Admin"]}>`.
- Nav entry "System Health" in Admin block (desktop + mobile).

### 5. RBAC / auth

No new RBAC. Admin-only via parent middleware.

### 6. Audit logging

This is a read endpoint, no audit write (consistent with the existing
`/admin/dashboard` which also does not audit).

---

## Data Model

No schema changes. All tables exist.

---

## API Contracts

```
GET /api/admin/health
Authorization: Bearer <token>   (Admin)

Response 200: see step 1 above
Response 500: { "error": "..." }
```

---

## Labor Safety Constraint

The system health page surfaces **counts**, not individuals. The
`users.by_role` field reports counts per role; it does not list user
names or OIDs. Active-last-30d is a count of distinct OIDs, not a list.

What this spec must not include:
- A "least recently active" or "most recently active" user list
- Any per-user activity counter
- Any leaderboard
- Any field linking a count back to a named worker

The page may be reached only by Admins (route guard + parent middleware).

---

## Tests Required

- Backend: endpoint returns the documented shape on a populated test
  database. Cross-org isolation test (RLS).
- Backend: response body contains no `oid` or named-user fields (string
  grep assertion in the test).
- Frontend: component renders each section; loading and error states
  visible; refresh button triggers refetch.

---

## Done Criteria

- [ ] `GET /api/admin/health` implemented in `adminRoutes.ts`
- [ ] Endpoint uses `withOrgContext()` for RLS
- [ ] Response excludes any per-user identifier (asserted in test)
- [ ] `AdminSystemHealthPanel.tsx` renders all sections
- [ ] Route `/admin/system-health` + nav entry added
- [ ] Refresh button works; no auto-poll
- [ ] Backend integration test passes (shape, RLS, no-oid grep)
- [ ] Frontend component test passes
- [ ] Manual smoke test against dev data
- [ ] Changelog entry written

---

## Out of Scope

- Time-series charts (rows-per-day over the last 30 days, etc.)
- Per-pool / per-region drill-down
- Alerting thresholds ("notify if EAM bridge fails twice")
- Drilling from `eam_bridge.recent_failures_7d` into the failed rows
  themselves (separate spec if needed)
- Latency / response-time metrics (those belong in infra observability,
  not in-app)

---

## Dependencies and Sequencing

- **Hard dependency**: role rename complete. `users.by_role` aggregates
  from `identity_directory.last_seen_role` — shipping before the rename
  would surface buckets `{ UL, Lead, Admin }` instead of
  `{ Specialist, Dispatch, Admin }`.
- Pairs naturally with the relocated Control Center: CC is the
  operational live-view (Dispatch), system health is the governance
  view (Admin).
