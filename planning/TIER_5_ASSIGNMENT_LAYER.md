# Tier 5 — Assignment Layer

> **Goal**: Wire `core.assignments` into the route creation path so every planned stop has a canonical assignment record, and wire `assignment_id` onto `core.visits` so the "planned vs. actual" question is answerable at the canonical level.
>
> **Status**: 🟢 Done — 2026-05-10. Changelogs: `docs/changelog/2026-05-10-tier-5-assignment-layer.md`, `docs/changelog/2026-05-10-tier-5-closure-docs.md`
> **Depends on**: Tier 1 must be stable (visit lifecycle must be correct — visit opens at stop-start)
> **Blocks**: Nothing (feeds Tier 2 completeness but does not gate it)

---

## Why This Is Load-Bearing

`core.assignments` is the canonical representation of planned work. It is the only place where "we intended this worker to clean this stop on this date" is recorded as a first-class domain fact — separate from `route_run_stops`, which is a transit adapter, not canonical truth.

Right now:
- `core.assignments`: 0 rows, no backend writers
- `core.visits.assignment_id`: always NULL
- The "planned vs. actual" question can only be answered by joining `route_runs` → `route_run_stops` → `core.visits`, all through transit-vertical tables

After this tier:
- Every route creation writes `core.assignments` rows (one per stop)
- Every visit open links to its `assignment_id`
- Intelligence can answer "was there a plan for this stop and did a visit happen" using canonical tables alone

**Must wait for Tier 1** because visit lifecycle must be stable. Specifically: `ensureVisitForRouteRunStop` must reliably fire at stop-start (not photo upload) before we can trust that `assignment_id` will be on every visit that represents real work.

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/src/domains/routeRun/routeRunService.ts` | In `createRouteRun()`, after inserting `route_run_stops`, insert one `core.assignments` row per stop |
| `backend/src/domains/visit/visitService.ts` | In `ensureVisitForRouteRunStop()`, look up the `assignment_id` from `core.assignments` for this stop and write it onto the visit |

---

## Files to Leave Alone

| File | Reason |
|------|--------|
| All auth files | Auth is frozen |
| All offline queue files | Offline contract is frozen |
| `backend/src/domains/routeRunStop/cleanLogService.ts` | Transit adapter — not touched in this tier |
| `backend/src/modules/work/routeRunStopRoutes.ts` | No changes needed here |
| `backend/src/intelligence/riskMapService.ts` | Intelligence migration is Tier 2 |
| All frontend files | No UI changes in this tier |
| `core.assignments` schema | Schema is complete — no migrations needed |

---

## `core.assignments` Schema (for reference)

```sql
core.assignments (
  id               bigint PK,
  org_id           bigint NOT NULL → organizations(id),
  assignment_type  text NOT NULL,       -- 'transit_stop_clean' for this vertical
  status           text DEFAULT 'planned',
  location_id      bigint → core.locations(id),
  primary_asset_id bigint → assets(id),
  planned_for_date date,
  planned_start_at timestamptz,
  planned_end_at   timestamptz,
  created_by_oid   text NOT NULL,       -- OID of the Lead who created the route
  source_system    text,                -- 'route_runs'
  source_ref       text,                -- route_run_id as string
  meta             jsonb DEFAULT '{}',
  created_at       timestamptz,
  updated_at       timestamptz
)
```

---

## Change 1 — Write `core.assignments` on Route Creation

### What and why

`createRouteRun()` in `routeRunService.ts` creates `route_runs` and `route_run_stops` rows. It must also create one `core.assignments` row per stop, representing the lead's planned intent for that stop on that date.

### File touched
- `backend/src/domains/routeRun/routeRunService.ts`

### Before

`createRouteRun()` inserts into `route_runs`, then bulk-inserts into `route_run_stops`. No canonical writes.

### After

After the `route_run_stops` insert, within the same transaction:

```typescript
// Write canonical assignments — one per stop
// source_ref links back to the route_run for the transit adapter
await client.query(`
  INSERT INTO core.assignments (
    org_id,
    assignment_type,
    status,
    location_id,
    primary_asset_id,
    planned_for_date,
    created_by_oid,
    source_system,
    source_ref,
    meta
  )
  SELECT
    $1,                          -- org_id
    'transit_stop_clean',        -- assignment_type
    'planned',                   -- status
    loc.id,                      -- location_id (via core.locations join)
    s.asset_id,                  -- primary_asset_id
    $2::date,                    -- planned_for_date (route run date)
    $3,                          -- created_by_oid (Lead's OID from auth context)
    'route_runs',                -- source_system
    $4::text,                    -- source_ref (route_run_id)
    '{}'::jsonb                  -- meta
  FROM route_run_stops rrs
  JOIN public.stops s ON s.stop_id = rrs.stop_id
  LEFT JOIN core.locations loc ON loc.external_id = rrs.stop_id
  WHERE rrs.route_run_id = $4
  ON CONFLICT DO NOTHING
`,
  [orgId, routeRunDate, createdByOid, routeRunId]
)
```

Note: `created_by_oid` requires the Lead's actual OID from the auth context, not the `user_id = 123` stub. This is one of the places where the stub must be acknowledged but not fixed in this tier — use the auth context OID if available, fall back to a system placeholder and log a warning if not.

### Done criteria
- After `POST /api/routes/create`, `SELECT COUNT(*) FROM core.assignments WHERE source_ref = :route_run_id` equals the number of stops in the route
- `assignment_type = 'transit_stop_clean'` on all rows
- `status = 'planned'` on all rows
- Existing `route_runs` and `route_run_stops` writes are unaffected

---

## Change 2 — Write `assignment_id` on Visit Open

### What and why

`ensureVisitForRouteRunStop()` in `visitService.ts` creates the `core.visits` row. It must look up the canonical assignment for this stop and write `assignment_id` onto the visit.

### File touched
- `backend/src/domains/visit/visitService.ts`

### Before

`ensureVisitForRouteRunStop()` inserts a visit with `assignment_id = NULL`.

### After

Before the visit INSERT, look up the assignment:

```typescript
// Look up canonical assignment for this stop
const assignmentResult = await client.query(`
  SELECT a.id
  FROM core.assignments a
  JOIN route_run_stops rrs ON rrs.route_run_id::text = a.source_ref
  WHERE rrs.id = $1
    AND a.source_system = 'route_runs'
    AND a.assignment_type = 'transit_stop_clean'
  LIMIT 1
`, [routeRunStopId])

const assignmentId = assignmentResult.rows[0]?.id ?? null

// Then use assignmentId in the visit INSERT:
// INSERT INTO core.visits (..., assignment_id) VALUES (..., $N)
```

If no assignment row exists (e.g., route was created before Tier 5 shipped), `assignment_id` is null — safe, no regression.

### Done criteria
- After completing a stop on a route created post-Tier-5, `SELECT assignment_id FROM core.visits WHERE route_run_stop_id = :id` returns a non-null value
- For stops on pre-Tier-5 routes, `assignment_id` is null — no error, no regression
- The UUIDv5 idempotency on visit creation still works correctly

---

## Tier 5 Overall Done Definition

Tier 5 is complete when ALL of the following are true, **and a changelog entry has been written to `docs/changelog/`**:

- [ ] `SELECT COUNT(*) FROM core.assignments` returns > 0 after a new route is created
- [ ] Assignment rows have correct `assignment_type`, `status`, `source_system`, `source_ref`
- [ ] `SELECT assignment_id FROM core.visits WHERE route_run_stop_id = :id` returns non-null for stops on post-Tier-5 routes
- [ ] Pre-Tier-5 routes (no assignments) produce null `assignment_id` on visits — no error
- [ ] Route creation still works end-to-end (OSRM plan → save → UL sees route)
- [ ] Stop completion still works end-to-end
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-tier-5-assignment-layer.md`

---

## What Tier 5 Does NOT Do

- Does not change `route_runs` or `route_run_stops` — those remain the transit adapter
- Does not change any frontend code
- Does not fix the `user_id = 123` stub (assignment writes use OID from auth context where available)
- Does not add assignment status updates (e.g., marking assignment as 'completed' when visit closes) — that is a future enhancement
- Does not populate assignments for historical route runs — only new routes going forward

---

## Agent Launch Blocks

### Change 1 — Write assignments on route creation

```
Refactor task. Read CLAUDE.md, then planning/TIER_5_ASSIGNMENT_LAYER.md, Change 1 only.
In backend/src/domains/routeRun/routeRunService.ts, inside createRouteRun(),
after the route_run_stops bulk insert and within the same transaction,
add an INSERT INTO core.assignments for each stop.
Schema reference is in the tier file. Use 'transit_stop_clean' as assignment_type,
'route_runs' as source_system, route_run_id as source_ref.
ON CONFLICT DO NOTHING for idempotency.
Do not touch any other file.
```

### Change 2 — Write assignment_id on visit open

```
Refactor task. Read CLAUDE.md, then planning/TIER_5_ASSIGNMENT_LAYER.md, Change 2 only.
In backend/src/domains/visit/visitService.ts, inside ensureVisitForRouteRunStop(),
look up the core.assignments row for this stop before the visit INSERT,
then write assignment_id onto the visit.
If no assignment exists (pre-Tier-5 route), assignment_id is null — no error.
Do not touch any other file.
```
