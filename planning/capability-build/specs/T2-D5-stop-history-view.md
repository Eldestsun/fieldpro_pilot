# T2-D5 — Stop-Level History View

| Field | Value |
|-------|-------|
| ID | T2-D5 |
| Capability | Per-stop recent history (condition scores, effort durations, open hazards) reachable from Dispatch |
| Surface | Dispatch |
| Tier | 2 |
| Type | Code (backend + frontend) |
| Depends on | None — data tables exist |
| Blocks | "Stop intelligence" demo story |
| Status | 🔴 Not started |
| Last updated | 2026-05-19 |

---

## Purpose

The intelligence layer captures stop-level history in three worker-anonymous
tables. None of that is surfaced in the Dispatch UI. A dispatcher reviewing
a stop on `LeadRouteDetail` cannot see whether the stop has been recently
problematic.

This spec adds a single read endpoint and a drawer in `LeadRouteDetail`
that displays recent condition scores, effort durations, and open hazards
for a stop.

Users: Dispatch (and Admin) reviewing operational context for a stop on a
running route. Field workers do not consume this view.

---

## Context

### What exists (verified)

Per the audit, three intelligence tables hold the data:
- `stop_condition_history` — written by `riskMapService.ts` on every risk
  rebuild. Columns include `stop_id`, `visit_id`, `scored_at`,
  `cleanliness_score`, `safety_score`, `infra_score`. Worker-anonymous.
- `stop_effort_history` — written by `cleanLogService.ts` on stop
  completion. Columns include `stop_id`, `visit_id`, `duration_minutes`.
  Worker-anonymous.
- `hazards` — written by field worker flow. Columns include `stop_id`,
  `reported_at`, `hazard_type`, `severity`. Worker-anonymous at query
  level (no `oid` exposed in responses).

All three tables have RLS active per the post-S1 RLS extension (Phase 2;
see `SECURITY_SPRINT_INDEX.md` line 111).

### What does not exist

- No `GET /api/stops/:id/history` endpoint.
- No frontend history drawer or panel.

### Audit claim

Audit says "data exists in DB; no API endpoint, no frontend component" —
confirmed.

---

## What to Build

Implementation order:

### 1. Backend — new endpoint

Add `GET /api/ops/stops/:stop_id/history` to `opsRoutes.ts` (or a new
`stopHistoryRoutes.ts` mounted under `/api/ops`). Gated `requireAuth +
requireAnyRole(["Lead", "Admin"])`. Use `withOrgContext()` for RLS.

Query parameters:
- `window` — `'30d' | '90d' | '180d' | '365d'`, default `'90d'`. Caps the
  date range.
- `limit` — max rows per series, default 50, max 200.

Response shape:

```json
{
  "stop_id": "<id>",
  "window_days": 90,
  "condition_history": [
    { "scored_at": "2026-05-10T12:00:00Z",
      "cleanliness_score": 0.72, "safety_score": 0.81,
      "infra_score": 0.66 }
  ],
  "effort_history": [
    { "completed_at": "2026-05-10T12:00:00Z",
      "duration_minutes": 14.5 }
  ],
  "open_hazards": [
    { "id": 123, "reported_at": "2026-05-08T09:00:00Z",
      "hazard_type": "broken_glass", "severity": "high",
      "status": "open" }
  ],
  "hazard_count_open": 1,
  "hazard_count_resolved_window": 3
}
```

**Worker-anonymity**: the endpoint must NOT return `captured_by_oid`,
`reported_by_oid`, or any worker identifier. Confirm at code review that
the SQL `SELECT` lists are explicit (no `SELECT *`) and exclude those
columns even if they exist on the tables.

Audit logging: this is a read endpoint and is high-volume (every stop
drawer open). Do **not** write `audit_log` per call — same rationale as
CC endpoints. If TPRA requires audit on intelligence reads, address as a
separate policy decision.

### 2. Frontend API client

Add `frontend/src/api/stopHistory.ts`:
- `getStopHistory(token, stopId, params)` → calls the new endpoint.

### 3. Frontend component

Modify `LeadRouteDetail.tsx`:
- Each row in the stop list renders the stop ID and status. Add a "View
  history" affordance (icon button or text link) at the row level.
- Click → opens a drawer (right-side panel) or modal showing three
  sections: Condition, Effort, Hazards. Each section displays the
  corresponding history series — small sparkline or compact table.
- Empty states per section ("No condition history for this stop in the
  last 90 days.")
- Close drawer returns focus to the triggering row.

Component name suggestion: `StopHistoryDrawer.tsx` under
`frontend/src/components/ops/`.

### 4. Routing / nav

No new routes. The drawer is an in-page surface from `LeadRouteDetail`.

### 5. RBAC / auth

Endpoint: `Lead + Admin`. Frontend drawer is reachable only from
`LeadRouteDetail` which is already `RequireRole={["Lead", "Admin"]}`.

### 6. Audit logging

None (see step 1 rationale).

---

## Data Model

No schema changes. Existing tables: `stop_condition_history`,
`stop_effort_history`, `hazards`. Add an index if the query is slow:

```sql
-- May already exist; verify before adding.
CREATE INDEX IF NOT EXISTS stop_condition_history_stop_scored
  ON stop_condition_history (stop_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS stop_effort_history_stop_completed
  ON stop_effort_history (stop_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS hazards_stop_reported
  ON hazards (stop_id, reported_at DESC);
```

Run `EXPLAIN ANALYZE` against the query on a representative dataset
before adding indexes; do not add speculative indexes.

---

## API Contracts

```
GET /api/ops/stops/:stop_id/history?window=90d&limit=50
Authorization: Bearer <token>   (Lead + Admin)

Response 200: see step 1 above
Response 404: { "error": "Stop not found" }
Response 403: standard RLS-out-of-org case
```

---

## Labor Safety Constraint

The history view aggregates **stop-level** intelligence, not worker-level
intelligence. The three source tables are worker-anonymous by design —
they store `visit_id`, not `captured_by_oid`. The endpoint must preserve
that: do not JOIN `core.visits` to expose any worker field.

Specifically prohibited in this view:
- Any field that resolves to a single named worker
- Any "this stop was last cleaned by X" attribution
- Any per-worker scoring of how stops were cleaned by whom

The view shows: scores, durations, hazards. Aggregated. Worker-anonymous.

---

## Tests Required

- Backend integration test: endpoint returns expected shape for a stop
  with mixed history; returns empty arrays for a stop with no history;
  rejects stop IDs from other orgs (RLS test).
- Backend assertion: response JSON does not contain any of these strings:
  `oid`, `captured_by`, `reported_by`, `assigned`.
- Frontend component test: drawer opens, fetches, renders three sections;
  empty-state copy is visible when arrays are empty.
- Manual: scroll through several stops on a route, open history drawer
  for each, confirm no worker identity visible.

---

## Done Criteria

- [ ] `GET /api/ops/stops/:stop_id/history` implemented and tested
- [ ] Endpoint enforces `Lead + Admin` + RLS via `withOrgContext()`
- [ ] Response excludes all worker-identity columns
- [ ] `frontend/src/api/stopHistory.ts` exports `getStopHistory`
- [ ] `StopHistoryDrawer.tsx` renders the three sections with empty states
- [ ] `LeadRouteDetail.tsx` exposes a per-row "View history" affordance
      that opens the drawer
- [ ] Integration tests pass (shape, empty, RLS, no-oid-leak grep)
- [ ] Component tests pass
- [ ] Changelog entry written

---

## Out of Scope

- Inline editing / hazard resolution from inside the drawer (separate
  spec, not currently scoped)
- Charts / visualizations beyond simple sparklines
- Cross-stop comparison views ("compare stops A and B")
- Date range pickers beyond the fixed window presets
- Aggregated "stop heat" view across all stops (that is risk map territory)

---

## Dependencies and Sequencing

- Independent of T1 specs.
- Strongest demo when paired with T1-CC (CC → route card → detail →
  per-stop history): the user can drill from live dashboard down to a
  single stop's recent history in three clicks.
- Ships any time after Tier 1.
