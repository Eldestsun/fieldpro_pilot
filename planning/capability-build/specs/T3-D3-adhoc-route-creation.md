# T3-D3 — Ad-Hoc Route Creation

| Field | Value |
|-------|-------|
| ID | T3-D3 |
| Capability | Dispatch can compose a route from an arbitrary stop list (not just a pool) and mark it as ad-hoc |
| Surface | Dispatch |
| Tier | 3 |
| Type | Code (schema + backend + frontend) |
| Depends on | Role rename workstream (UL→Specialist, Lead→Dispatch) complete |
| Blocks | "Dispatch can respond to emergent requests" demo |
| Status | 🔴 Not started |
| Last updated | 2026-05-19 |

---

## Purpose

Today, route creation is pool-driven: `RouteCreatePanel.tsx` selects a
pool, then `POST /api/route-runs` creates the run from the pool's
stops. The backend `POST /route-runs` already accepts an explicit
`stop_ids[]` array (audit confirms), but no UI drives it.

This spec adds (a) a frontend stop picker that selects an arbitrary stop
list, (b) a flag (`is_adhoc`) on the resulting run so downstream
intelligence can tag it differently, and (c) the schema change to
support that flag.

Users: Dispatch building a one-off route for an emergent need (special
event, hazard sweep, equipment delivery).

---

## Context

### What exists (verified)

- **Backend create**: `POST /api/route-runs` at
  `backend/src/modules/routes/routeRunRoutes.ts:554` (audit cited 551;
  actual is 554, off by 3). Gated `Lead + Admin`. Accepts `stop_ids[]`
  per the audit.
- **No `is_adhoc` column**: confirmed via repo-wide grep
  (`backend/src/modules/routes/routeRunRoutes.ts` has no `is_adhoc`
  reference).
- **Stop inventory UI**: `AdminStopsPanel.tsx` is the only place with a
  searchable, filterable stop inventory. It is Admin-only and is an edit
  panel, not a picker.

### Locked design decisions (2026-05-19)

1. **Picker UX**: dedicated **full-page picker** route, not a modal
   expansion of `RouteCreatePanel`.
2. **Write authority**: **Dispatch + Admin** — ad-hoc creation inherits
   the existing `POST /api/route-runs` gate; no special Admin-only
   branch.
3. **Pool association**: an ad-hoc run references a **synthetic per-org
   `__adhoc` pool**. `pool_id` stays `NOT NULL`. Each org gets exactly
   one `__adhoc` row in `route_pools` seeded by migration; all ad-hoc
   runs in that org reference it.

---

## What to Build

Implementation order:

### 1. Backend — schema migration

Two changes:
1. Add `is_adhoc BOOLEAN NOT NULL DEFAULT FALSE` to `route_runs`.
2. Seed one synthetic `__adhoc` pool per org. `pool_id` stays
   `NOT NULL`; ad-hoc runs reference the synthetic row.

Migration file: `backend/migrations/20260520_route_runs_adhoc.sql`
(adjust date on dispatch).

```sql
ALTER TABLE route_runs
  ADD COLUMN is_adhoc BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed a synthetic ad-hoc pool per existing org. Idempotent.
INSERT INTO route_pools (pool_id, org_id, label, active)
SELECT
  '__adhoc',
  o.org_id,
  'Ad-hoc (system)',
  TRUE
FROM (SELECT DISTINCT org_id FROM route_pools) o
ON CONFLICT (pool_id, org_id) DO NOTHING;
```

New-org provisioning must also seed a `__adhoc` row (track as a
follow-up in the org-bootstrap script — out of scope for this spec but
called out in the changelog).

### 2. Backend — modify create endpoint

In `routeRunRoutes.ts` at the create handler (line 554):
- Accept `is_adhoc?: boolean` in the request body. Default false.
- Validate: if `is_adhoc === true`, require `stop_ids[]` non-empty and
  force `pool_id = '__adhoc'` (ignore any client-supplied `pool_id`).
- Persist `is_adhoc` on the row.
- Audit-log via existing `assignment.create` with
  `detail.is_adhoc = true` appended. No new action string.

### 3. Backend — list filter

Consider exposing `is_adhoc` in `GET /api/lead/todays-runs`
(`routeRunRoutes.ts:107`) and `GET /api/ops/route-runs` responses so the
Dispatch UI can badge ad-hoc runs. Confirm the field is included.

### 4. Frontend — stop picker (full-page route)

Add `frontend/src/components/ops/StopPickerPage.tsx` mounted at
`/ops/routes/new/adhoc`:
- Searchable list of stops scoped to the user's org. Backend source:
  reuse the existing `GET /api/admin/stops` endpoint with one change —
  **gate widen** from Admin-only to `Lead + Admin` for a new mirrored
  `/api/ops/stops` read endpoint (do NOT widen the admin endpoint
  itself; mirror the read in `opsRoutes.ts`). Confirm with founder.
- Multi-select with running count, ordered list with drag-to-reorder
  (or fixed order: stop_id ascending for v1; reorder later).
- Filter by pool optional (pre-narrow the candidate list).

### 5. Frontend — create flow

`RouteCreatePanel.tsx` stays pool-driven (unchanged). Add a sibling
entry point — a "Create ad-hoc route" link/button in the Dispatch
routes nav that navigates to `/ops/routes/new/adhoc`. The full-page
picker collects:
- `stop_ids[]` (multi-select)
- `shift_type` (day / night)
- `assigned_user_oid` (crew dropdown reusing `/api/users`)

On submit: `POST /api/route-runs` with `is_adhoc: true, stop_ids,
shift_type, assigned_user_oid`. Backend forces `pool_id = '__adhoc'`,
so the client does not send it.

### 6. Frontend — badging

In `LeadRoutesPanel.tsx` and the CC routes panel (post-T1-CC),
render an "Ad-hoc" badge on rows where `is_adhoc === true`.

### 7. RBAC / auth

- Create endpoint stays `Dispatch + Admin`. Ad-hoc creation inherits
  that — no special branch.
- New `/api/ops/stops` read-only mirror: `Dispatch + Admin`.

### 8. Audit logging

`assignment.create` with `detail.is_adhoc = true` appended. No new
action string.

---

## Data Model

```sql
ALTER TABLE route_runs
  ADD COLUMN is_adhoc BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS route_runs_is_adhoc
  ON route_runs (org_id, is_adhoc) WHERE is_adhoc = TRUE;
-- Partial index: query "show recent ad-hoc runs" stays cheap.

-- Synthetic per-org ad-hoc pool. Idempotent seed.
INSERT INTO route_pools (pool_id, org_id, label, active)
SELECT '__adhoc', o.org_id, 'Ad-hoc (system)', TRUE
FROM (SELECT DISTINCT org_id FROM route_pools) o
ON CONFLICT (pool_id, org_id) DO NOTHING;
```

`pool_id` remains `NOT NULL`. The synthetic `__adhoc` row carries
ad-hoc runs.

RLS: existing RLS on `route_runs` and `route_pools` covers the new
column and seeded rows without modification (both tables are
org-scoped).

---

## API Contracts

### Modified

```
POST /api/route-runs
Authorization: Bearer <token>   (Dispatch + Admin)
Body: {
  "pool_id": "POOL-001",           // ignored when is_adhoc=true;
                                   // server forces pool_id='__adhoc'
  "shift_type": "day" | "night",
  "stop_ids": ["STOP-001", ...],   // required if is_adhoc=true
  "is_adhoc": true,
  "assigned_user_oid": "..." | null
}
```

### Added (mirrored read for picker)

```
GET /api/ops/stops?query=&pool_id=&page=&pageSize=
Authorization: Bearer <token>   (Dispatch + Admin)
Response: same shape as GET /api/admin/stops
```

---

## Labor Safety Constraint

The stop picker displays stop metadata only (id, label, pool, flags).
It must not display any per-worker history alongside the stop ("last
cleaned by X", "worker Y has Z runs at this stop") — those joins must
not happen.

The ad-hoc badge on route rows is metadata about the run, not the
worker — no labor-safety concern.

---

## Tests Required

- Backend: migration applies; `is_adhoc` defaults to false on existing
  rows; new ad-hoc create with `stop_ids` persists with `is_adhoc=true`.
- Backend: create endpoint validates `stop_ids[]` non-empty when
  `is_adhoc=true`.
- Backend: `GET /api/ops/stops` returns paginated stops for Dispatch
  role; rejects UL.
- Frontend: `StopPicker` selection persists across pagination, count
  updates, submit posts the right body.
- Frontend: `LeadRoutesPanel` badges ad-hoc rows.

---

## Done Criteria

- [ ] Migration applied; `is_adhoc` column present and indexed
- [ ] Synthetic `__adhoc` pool seeded for every existing org
- [ ] Create handler forces `pool_id = '__adhoc'` when `is_adhoc=true`
- [ ] Create handler validates `stop_ids[]` non-empty when `is_adhoc=true`
- [ ] List endpoints include `is_adhoc` in their response shape
- [ ] `/api/ops/stops` mirrored read endpoint added (Dispatch + Admin)
- [ ] Full-page `StopPickerPage` route built and unit-tested
- [ ] Dispatch nav exposes the ad-hoc entry point
- [ ] Ad-hoc badge renders in route lists
- [ ] Backend + frontend tests pass
- [ ] Changelog entry written to `docs/changelog/capability-build/`

---

## Out of Scope

- Recurring ad-hoc templates (would be A-4 territory — deferred Tier 4)
- Adding / removing stops from an in-progress ad-hoc run (deferred Tier 4)
- Map-based picker (text/list picker is v1)
- Cross-org ad-hoc (org-scoped only)

---

## Dependencies and Sequencing

- **Hard dependency**: role rename workstream complete. New nav entry,
  RBAC strings, and audit detail use the new role names.
- Independent of other Tier 1 / Tier 2 specs once rename lands.
- Ships well after T1 + T2 — demo benefit is meaningful but effort is
  higher than smaller items.
