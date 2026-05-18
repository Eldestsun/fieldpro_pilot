# Route Pool Schema Audit — 2026-05-18

## Context

Audit of the `transit_stops.pool_id` / `route_pools` relationship to determine
whether the current many-to-one model correctly represents real-world operational
requirements: cross-district stops, day/night shift separation, and multi-tenancy.

---

## A) Current Model

### Schema — relevant tables

**`route_pools`** (12 rows, all `org_id = 1`)
```
id             text     PK
label          text     NOT NULL
trf_district   text     geographic district code
org_id         bigint   NOT NULL
default_max_minutes  integer
active         boolean  DEFAULT true
```
No shift column.

**`transit_stops`** (14,916 rows, all `org_id = 1`)
```
stop_id        text     PK
pool_id        text     → route_pools.id  [single value per stop, NOT NULL in practice]
org_id         bigint   NOT NULL DEFAULT 1
lon, lat       double precision
is_hotspot     boolean
has_trash      boolean
compactor      boolean
priority_class text
asset_id       bigint   → assets.id
```
No shift column. The `pool_id` FK is a single text column — many-to-one only.

**`lead_route_overrides`**
```
pool_id        text     → route_pools.id
stop_id        text     → transit_stops.stop_id
override_type  text     CHECK IN ('FORCE_INCLUDE', 'FORCE_EXCLUDE', 'PRIORITY_BUMP')
value          numeric
```

**`route_runs`**
```
id             bigint   PK
route_pool_id  text     → route_pools.id
org_id         bigint   NOT NULL
assigned_user_oid text  Azure Entra OID
run_date       date
```
No shift column. No RLS.

**`route_run_stops`**
```
id             bigint   PK
route_run_id   bigint   → route_runs.id
stop_id        text     → transit_stops.stop_id
asset_id       bigint   NOT NULL
sequence       integer
status         text     CHECK IN ('pending', 'in_progress', 'done', 'skipped')
```
**No `org_id` column at all.** No RLS.

**`core.locations`** (14,916 rows — 1:1 with transit_stops)
- Linked via `core.location_external_ids` (`source_system = 'metro_stop'`, `external_id = stop_id`)
- `org_id` enforced by RLS (`org_isolation` policy, FORCE ROW LEVEL SECURITY)

**`core.assignments`**
- `org_id` enforced by RLS
- `location_id` → `core.locations`
- `primary_asset_id` → `assets`
- No pool context — pool lineage exists only in `route_runs`

### Entity relationship as built

```
route_pools ──(1:N)──────────> transit_stops      [many-to-one, single FK column]
route_pools ──(1:N)──> route_runs ──(1:N)──> route_run_stops ──(N:1)──> transit_stops
core.locations ──(1:1)──────────> transit_stops   [via location_external_ids]
core.assignments ──(N:1)────────> core.locations  [no pool context here]
```

### RouteCreatePanel query path

1. On open: `GET /api/pools` → `resourceRoutes.ts` queries `route_pools WHERE active = true`
   — **no org_id filter**
2. Lead selects pool + UL → `POST /api/route-runs/preview` with `pool_id`
3. Backend: `getCandidateStopsForPoolWithRisk(poolId)` in `routeRunService.ts:30-46`
   → `SELECT ... FROM public.stops WHERE pool_id = $1 ORDER BY combined_risk_score DESC LIMIT 200`
   → sliced to 25 (`MAX_OSRM_STOPS`) for OSRM trip planning
   — **no org filter, no shift filter**
4. Force-include fallback at `routeRunService.ts:92-94` also uses `WHERE pool_id = $2`

---

## B) Gap Assessment

### Data state (live)

| pool_id     | stop_count |
|-------------|-----------|
| SE          | 3,120     |
| E           | 2,784     |
| SW          | 2,478     |
| NS          | 2,056     |
| NL          | 1,741     |
| SC          | 1,458     |
| CB          | 1,185     |
| TEST_POOL_1 | 30        |
| TEST_POOL_2 | 30        |
| TEST_POOL_3 | 30        |
| TEST_POOL   | 4         |
| null        | **0**     |

All 14,916 stops have exactly one `pool_id`. All pools and stops are `org_id = 1`.
`core.locations` has 14,916 rows — one location per transit stop.

### RLS coverage

| Table | RLS enabled | org_id column | Notes |
|-------|-------------|---------------|-------|
| `core.locations` | YES (FORCE) | YES | org_isolation policy |
| `core.assignments` | YES (FORCE) | YES | org_isolation policy |
| `core.visits` | YES (FORCE) | YES | org_isolation policy |
| `core.observations` | YES (FORCE) | YES | org_isolation policy |
| `transit_stops` | **NO** | YES (not enforced) | — |
| `route_pools` | **NO** | YES (not enforced) | — |
| `route_runs` | **NO** | YES (not enforced) | — |
| `route_run_stops` | **NO** | **MISSING** | No org_id column |

### Gap 1 — One stop in multiple pools: Not supported

`pool_id` is a single text column. A stop can only belong to one pool. There is no
junction table. The real-world case — a stop on the boundary of two districts, or a
stop that belongs to both a day and a night route pool — cannot be expressed in the
data model. `lead_route_overrides` with `FORCE_INCLUDE` provides a per-run workaround
but is not a structural relationship.

### Gap 2 — Day/night shift separation: Not supported

Neither `transit_stops` nor `route_pools` has a shift or schedule column. Pools map
to geographic TRF districts only. The only current approximation is to create pools
named "SE-Day" / "SE-Night" and manually split stops between them — but because each
stop can only have one `pool_id`, any stop that should appear on both shifts cannot be
expressed without duplication.

### Gap 3 — Second tenant: org_id present but not enforced

- `transit_stops`, `route_pools`, `route_runs`: have `org_id` columns but **no RLS**
- `route_run_stops`: **no `org_id` column**
- `GET /api/pools`: no `WHERE org_id = ?` filter — tenant 2 would receive all 12 KCM pools
- `getCandidateStopsForPoolWithRisk`: no org filter — any pool_id returns KCM stops

A second tenant cannot be safely onboarded without RLS on all four transit tables and
org-scoped API queries.

### Gap 4 — Actively serviced vs. full inventory

The ~2,000 actively serviced stops are not explicitly flagged. The system relies on
`combined_risk_score > 0` to float relevant stops and caps routes at 25 via
`MAX_OSRM_STOPS`. There is no "in service rotation" boolean — it is implicit in the
risk score. This is operationally workable but means any stop in the pool with a
non-zero score is eligible for route inclusion.

---

## C) Recommendation

Three changes in priority order.

### P1 — RLS on transit adapter tables (hard blocker for multi-tenancy)

Add `org_isolation` RLS policies matching the `core.*` pattern to all four transit tables.
Also add `org_id` to `route_run_stops` first.

```sql
-- Step 1: add missing org_id to route_run_stops
ALTER TABLE public.route_run_stops ADD COLUMN org_id bigint NOT NULL DEFAULT 1;
-- Backfill from parent run
UPDATE public.route_run_stops rrs
SET org_id = rr.org_id
FROM public.route_runs rr
WHERE rr.id = rrs.route_run_id;

-- Step 2: enable RLS on all four tables
ALTER TABLE public.transit_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transit_stops FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.transit_stops
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

ALTER TABLE public.route_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_pools FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.route_pools
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

ALTER TABLE public.route_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.route_runs
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

ALTER TABLE public.route_run_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_run_stops FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.route_run_stops
  USING (org_id = current_setting('app.current_org_id', true)::bigint);
```

Every API handler that queries these tables must call `withOrgContext` before the query.
Affected handlers: `resourceRoutes.ts`, `routeRunRoutes.ts`, `adminRoutes.ts`,
`opsRoutes.ts`, `adminStopService.ts`. Roughly 8–12 touch points. The pattern is
already established in `core.*` handlers.

### P2 — Shift type on route_runs (near-term operational need)

Add shift context to `route_runs`, not to pools. Pools remain pure geographic groupings.
A Lead selects pool + shift when creating a run.

```sql
ALTER TABLE public.route_runs
  ADD COLUMN shift_type text DEFAULT 'day'
  CHECK (shift_type IN ('day', 'night', 'all_day'));
```

No existing queries break (nullable/defaulted column). `getCandidateStopsForPoolWithRisk`
can accept an optional shift parameter for future filtering. `RouteCreatePanel` gets
a shift dropdown. Two backend files, one frontend component.

If stops themselves need shift-specific eligibility (e.g., stop X is night-only),
a `stop_pool_memberships` row (see P3) with a `shift_type` column handles that.
For now, shift on the run is sufficient.

### P3 — Junction table for stop-to-pool membership (future, not blocking today)

The correct long-term model. Needed when:
- A stop must appear in more than one pool (cross-district coverage, night vs. day routes
  pulling from the same district), OR
- Stops need to be re-assigned between pools without data duplication

```sql
CREATE TABLE public.stop_pool_memberships (
    stop_id  text    NOT NULL REFERENCES public.transit_stops(stop_id) ON DELETE CASCADE,
    pool_id  text    NOT NULL REFERENCES public.route_pools(id)        ON DELETE CASCADE,
    org_id   bigint  NOT NULL,
    shift_type text  DEFAULT NULL,  -- NULL = all shifts; 'day' / 'night' if shift-specific
    active   boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (stop_id, pool_id)
);

-- Populate from current single-value pool_id:
INSERT INTO public.stop_pool_memberships (stop_id, pool_id, org_id)
SELECT stop_id, pool_id, org_id FROM public.transit_stops;
```

After migration: update `getCandidateStopsForPoolWithRisk` to JOIN
`stop_pool_memberships` instead of filtering on `transit_stops.pool_id`.
Keep the `pool_id` column on `transit_stops` as a deprecated denormalized cache
(do not drop it yet — too many callsites). Remove it in a later sprint.

---

## D) Refactor Risk

### P1 — RLS additions

**Scope: medium.** 8–12 handler touch points across 5 backend files. The pattern
is already implemented in `core.*` handlers (`withOrgContext`). The `route_run_stops`
migration (add `org_id` column) must run before RLS is enabled on that table.
No frontend changes required.

### P2 — Shift column on route_runs

**Scope: low.** Additive nullable column — no existing queries break. Changes:
- 1 migration (ALTER TABLE)
- `routeRunRoutes.ts` — accept `shift_type` in POST body
- `routeRunService.ts` — pass shift to INSERT
- `RouteCreatePanel.tsx` + `useCreateRoute.ts` — add shift dropdown

### P3 — Junction table

**Scope: targeted if `pool_id` retained on `transit_stops`, medium if dropped.**

If `pool_id` is kept as a denormalized cache (recommended):
- `routeRunService.ts:30-46` — primary candidate query (WHERE pool_id → JOIN)
- `routeRunService.ts:92-94` — force-include fallback query (same fix)
- `adminStopService.ts` — write to both tables transactionally on pool change
- Blast radius: 2–3 backend files, no frontend changes

If `pool_id` is fully dropped from `transit_stops`:
- `adminStopService.ts` — pool filter in list query + pool update logic
- `adminRoutes.ts` — bulk stop update endpoint
- `routeRunService.ts` — both queries above
- `lead_route_overrides.pool_id` — separate column, evaluate separately
- Frontend: `NormalizedAdminStop` interface, admin panel pool filter, bulk assignment UI
- Blast radius: 5–7 files + 1 migration

**Recommended:** add junction table, retain `pool_id` as deprecated cache column,
migrate read path first, remove column in a later sprint.

---

## Summary

| Gap | Current State | Blocks | Priority | Effort |
|-----|--------------|--------|----------|--------|
| RLS on transit tables | No RLS on any transit table | Tenant 2 onboarding | **P1** | Medium |
| `route_run_stops` missing `org_id` | No column | RLS on that table | **P1** | Low (migration) |
| Shift separation (day/night) | No shift concept anywhere | Day/night route scheduling | **P2** | Low (additive column) |
| Many-to-many stop-pool | Single FK, many-to-one only | Cross-district stops, tenant flexibility | **P3** | Targeted (junction table) |

## Key files for any implementation work

| File | Relevance |
|------|-----------|
| `backend/src/domains/routeRun/routeRunService.ts:30-46` | Primary candidate query — `WHERE pool_id = $1` |
| `backend/src/domains/routeRun/routeRunService.ts:92-94` | Force-include fallback — same `pool_id` filter |
| `backend/src/modules/admin/resourceRoutes.ts:59-64` | `GET /api/pools` — no org filter |
| `backend/src/services/adminStopService.ts:42-44,104-106` | Stop list filter + pool_id update |
| `backend/src/modules/admin/adminRoutes.ts` | Bulk stop update, pool-filtered queries |
| `backend/src/modules/ops/opsRoutes.ts` | Ops read-only pool/run queries |
| `frontend/src/components/RouteCreatePanel.tsx` | Create-route UI (pool + UL selection) |
| `frontend/src/hooks/useCreateRoute.ts` | Hook that drives RouteCreatePanel |
| `frontend/src/api/routeRuns.ts:381-391` | `fetchPools()` — calls `GET /api/pools` |
