# Org ID Completeness Audit — 2026-05-18

**Type:** Analysis — read-only, no code changes, no changelog entry required.

**Context:** BASELINE is multi-tenant. RLS was implemented in Tier 7 and relies on
`app.current_org_id` being set via `withOrgContext()`. This audit determines whether
every table holding tenant-specific data is protected before a second tenant is onboarded.

**Database:** 2 schemas — `core` (canonical layer) and `public` (transit adapter + shared tables)

---

## A) Full Table Inventory

| Schema | Table | org_id exists | NOT NULL | RLS enabled | Force RLS | Tenant data? |
|--------|-------|:-------------:|:--------:|:-----------:|:---------:|--------------|
| core | asset_locations | YES | YES | YES | YES | YES |
| core | asset_types | YES | YES | YES | YES | YES — per-org type registry |
| core | assignments | YES | YES | YES | YES | YES |
| core | evidence | YES | YES | YES | YES | YES |
| core | location_external_ids | YES | YES | YES | YES | YES |
| core | locations | YES | YES | YES | YES | YES |
| core | observation_type_registry | YES | YES | YES | YES | YES — per-org config |
| core | observations | YES | YES | YES | YES | YES |
| core | visits | YES | YES | YES | YES | YES |
| public | asset_external_ids | **NO** | — | NO | NO | Ambiguous — see §B |
| public | asset_types | **NO** | — | NO | NO | NO — global code/name lookup |
| public | assets | YES | YES | **NO** | **NO** | **YES — gap** |
| public | audit_log | YES (uuid) | YES | YES | YES | YES — **SELECT leaks cross-org** |
| public | bases | YES | YES | **NO** | **NO** | **YES — gap** |
| public | clean_logs | **NO** | — | **NO** | **NO** | **YES — gap** |
| public | eam_bridge_populate_state | NO | — | NO | NO | NO — singleton watermark |
| public | eam_bridge_route_log | YES | YES | **NO** | **NO** | **YES — gap** |
| public | export_delete_tokens | YES (text) | YES | **NO** | **NO** | **YES — gap** |
| public | hazards | **NO** | — | **NO** | **NO** | **YES — gap** |
| public | identity_directory | YES | YES | YES | YES | YES — ISSUE-012 fixed |
| public | infrastructure_issues | **NO** | — | **NO** | **NO** | **YES — gap** |
| public | lead_route_overrides | **NO** | — | **NO** | **NO** | **YES — gap** |
| public | level3_logs | **NO** | — | **NO** | **NO** | **YES — gap** |
| public | organizations | NO | — | NO | NO | NO — IS the org table |
| public | route_pools | YES | YES | **NO** | **NO** | **YES — gap** |
| public | route_run_stops | **NO** | — | **NO** | **NO** | **YES — gap** |
| public | route_runs | YES | YES | **NO** | **NO** | **YES — gap** |
| public | schema_migrations | NO | — | NO | NO | NO — system table |
| public | stop_condition_history | **NO** | — | **NO** | **NO** | **YES — intelligence layer — gap** |
| public | stop_effort_history | **NO** | — | **NO** | **NO** | **YES — intelligence layer — gap** |
| public | stop_photos | **NO** | — | **NO** | **NO** | **YES — gap** |
| public | stop_risk_snapshot | **NO** | — | **NO** | **NO** | **YES — intelligence layer — gap** |
| public | stops_legacy | **NO** | — | **NO** | **NO** | YES — 14,916 rows |
| public | transit_stop_assets | **NO** | — | **NO** | **NO** | **YES — gap** |
| public | transit_stops | YES | YES | **NO** | **NO** | **YES — gap** |
| public | trash_volume_logs | **NO** | — | **NO** | **NO** | **YES — gap** |

---

## B) RLS Policy Audit

### core schema — all 9 tables

All `core.*` tables have:
- `rowsecurity = true`
- `forcerowsecurity = true` (owner is subject to RLS — correct)
- Policy name: `org_isolation`, PERMISSIVE, roles: `{public}`

**Two policy variants are in use:**

**Variant A — strict equality (asset_locations, location_external_ids):**
```sql
USING (org_id = (current_setting('app.current_org_id', true))::bigint)
WITH CHECK: (none)
```
Problem: No `WITH CHECK` clause. INSERT and UPDATE are not validated against org_id.
A client can insert a row with any org_id and it succeeds silently.

**Variant B — COALESCE passthrough (all other 7 core tables):**
```sql
USING (
  COALESCE(current_setting('app.current_org_id', true), '') = ''
  OR org_id = NULLIF(current_setting('app.current_org_id', true), '')::bigint
)
WITH CHECK: (same as USING)
```
When `app.current_org_id` is unset or empty, this evaluates to `true` for every row —
all tenant data from all orgs is visible. This is intentional for migration/seed sessions
but means any API route that forgets to call `withOrgContext()` silently dumps all tenant
data across all orgs. It is a footgun built into the RLS design.

---

### public schema — tables with RLS

**identity_directory** — `rowsecurity = true`, `forcerowsecurity = true`
```sql
Policy: org_isolation  CMD: ALL  Roles: {public}
USING (org_id = (current_setting('app.current_org_id', true))::bigint)
WITH CHECK: (none)
```
- Uses Variant A (no WITH CHECK — inserts are unguarded at the DB layer)
- ISSUE-012 fix confirmed: `/api/users` query runs inside `withOrgContext(numericOrgId, ...)` in `resourceRoutes.ts:164`. The RLS policy filters correctly at query time.

**audit_log** — `rowsecurity = true`, `forcerowsecurity = true`
Three policies:
```sql
Policy: audit_log_select  CMD: SELECT  USING (true)         -- ALL rows visible to all orgs
Policy: audit_log_insert  CMD: INSERT  WITH CHECK (true)    -- no org validation on writes
Policy: audit_log_delete  CMD: DELETE
  USING (
    current_setting('app.export_delete_active', true) = 'true'
    AND (org_id)::text = NULLIF(current_setting('app.export_delete_org_id', true), '')
  )
```
Problems:
1. SELECT policy is `USING (true)` — every authenticated user sees every org's audit entries today
2. INSERT policy has no org_id check — any org can write audit entries attributed to any org_id
3. `audit_log.org_id` is type `uuid`, while all other org_id columns are `bigint` — type mismatch prevents using the standard `::bigint` cast pattern

---

### public schema — tables with org_id but NO RLS (7 tables)

assets, bases, eam_bridge_route_log, export_delete_tokens, route_pools, route_runs, transit_stops

`rowsecurity = false`, `forcerowsecurity = false`. No policies.
Any query against these tables returns rows from all orgs regardless of the calling org's context.

---

## C) Gap List

### Priority 1 — Intelligence layer (critical, fix before any second-tenant work)

These tables are the output of BASELINE's analytical engine. If a second tenant is onboarded
today, their scored data sits unpartitioned next to org 1's data with no fence.

| Table | Rows | Missing | Backfill path | Risk |
|-------|------|---------|--------------|------|
| stop_condition_history | 3 | org_id + RLS | `visit_id → core.visits.org_id` | Cross-org score leakage |
| stop_effort_history | 2 | org_id + RLS | `visit_id → core.visits.org_id` | Cross-org intelligence leakage |
| stop_risk_snapshot | 206 | org_id + RLS | `stop_id → transit_stops.org_id` | Cross-org risk map leakage |

---

### Priority 2 — Safety-critical field records

| Table | Rows | Missing | Backfill path | Risk |
|-------|------|---------|--------------|------|
| hazards | 12 | org_id + RLS | `visit_id → core.visits.org_id` | Hazard reports visible cross-org |
| infrastructure_issues | 11 | org_id + RLS | `visit_id → core.visits.org_id` | Infra reports visible cross-org |
| stop_photos | 15 | org_id + RLS | `route_run_stop_id → route_run_stops → route_runs.org_id` | Photo evidence leakage |

---

### Priority 3 — Core operational tables with org_id but no RLS

| Table | org_id type | Risk |
|-------|------------|------|
| assets | bigint NOT NULL | Core asset registry — cross-org asset visibility |
| route_runs | bigint NOT NULL | Execution records — cross-org operational visibility |
| route_run_stops | no org_id | 44 rows of stop execution data; backfill: `route_run_id → route_runs.org_id` |
| route_pools | bigint NOT NULL | Route definitions — cross-org structure visible |
| transit_stops | bigint NOT NULL | Stop master data — cross-org |
| bases | bigint NOT NULL | Depot locations — cross-org |
| eam_bridge_route_log | bigint NOT NULL | EAM export summaries — cross-org |
| export_delete_tokens | text (type gap) | Export auth tokens — cross-org token visibility |

---

### Priority 4 — Transit adapter tables (tenant data, no isolation)

Scheduled for replacement in Tier 4B, but hold live data today.

| Table | Rows | Backfill path |
|-------|------|--------------|
| clean_logs | 2 | `visit_id → core.visits.org_id` |
| level3_logs | 0 | `visit_id → core.visits.org_id` |
| trash_volume_logs | 0 | `visit_id → core.visits.org_id` |
| lead_route_overrides | 0 | `pool_id →(soft join)→ route_pools.org_id` (no FK constraint) |
| stops_legacy | 14,916 | `asset_id → assets.org_id` (some rows may have NULL asset_id) |
| transit_stop_assets | 0 | `asset_id → assets.org_id` |
| asset_external_ids | 0 | `asset_id → assets.org_id` |

---

### Priority 5 — Structural / policy defects

**audit_log SELECT policy = `true`**
All rows from all orgs are visible to all authenticated users. The DELETE policy
is correctly guarded; SELECT and INSERT are not. Requires a policy rewrite and
resolution of the `uuid` vs `bigint` type inconsistency on `org_id`.

**core.asset_locations — no WITH CHECK**
USING clause checks org_id on reads. INSERT and UPDATE bypass the check.
Any client can insert a row with a foreign org_id. Fix: add `WITH CHECK (org_id = current_setting('app.current_org_id')::bigint)`.

**core.location_external_ids — no WITH CHECK**
Same issue as asset_locations.

---

## D) Tables That Legitimately Don't Need org_id

| Table | Reason |
|-------|--------|
| public.organizations | IS the org table — adding org_id would be circular |
| public.schema_migrations | System tracking table, no tenant content |
| public.eam_bridge_populate_state | Singleton watermark for EAM sync process. If EAM bridge becomes per-org in future it would need one, but currently it is shared. |
| public.asset_types | Global code/name lookup (transit_stop, trash_can, etc.). Note: `core.asset_types` has org_id for per-org custom types. The `public.asset_types` is a global registry — this dual-table situation is pre-canonical and should be resolved in a future refactor, but the public table does not need org_id now. |

---

## E) identity_directory — ISSUE-012 Confirmation

The RLS policy on `identity_directory` is:
```sql
USING (org_id = (current_setting('app.current_org_id', true))::bigint)
```

The fix in `backend/src/modules/admin/resourceRoutes.ts:164` wraps the query correctly:
```typescript
const result = await withOrgContext(numericOrgId, (client) =>
  client.query(query),
);
```

The fix is consistent with the RLS policy. The `identity_directory` table currently has
0 rows — it will be populated on first real login. The RLS will filter correctly at that point.

One remaining structural note: the `identity_directory` policy has no `WITH CHECK`,
so an INSERT could write a row with any org_id. In practice the only INSERT path
is in `authz.ts:100` which also runs inside `withOrgContext()`, so the risk is mitigated
at the application layer. But the DB-level guarantee is incomplete.

---

## F) Migration Scope

### Phase 1 — RLS only, no schema change (7 tables)
Tables: `assets`, `bases`, `eam_bridge_route_log`, `route_pools`, `route_runs`, `transit_stops`
+ special handling for `export_delete_tokens` (org_id is text, not bigint)

Template:
```sql
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.<table> FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.<table>
  USING (org_id = current_setting('app.current_org_id', true)::bigint)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::bigint);
```

Risk: none — additive only, no data change.

---

### Phase 2 — Add org_id + backfill + RLS (14 tables)
Tables: route_run_stops, stop_condition_history, stop_effort_history, stop_risk_snapshot,
hazards, infrastructure_issues, stop_photos, clean_logs, level3_logs, trash_volume_logs,
lead_route_overrides, stops_legacy, transit_stop_assets, asset_external_ids

Template per table (example: stop_effort_history):
```sql
ALTER TABLE public.stop_effort_history ADD COLUMN org_id bigint;

UPDATE public.stop_effort_history seh
SET org_id = v.org_id
FROM core.visits v
WHERE seh.visit_id = v.id;

-- Verify no NULLs before setting NOT NULL
SELECT COUNT(*) FROM public.stop_effort_history WHERE org_id IS NULL; -- must be 0

ALTER TABLE public.stop_effort_history ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE public.stop_effort_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stop_effort_history FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.stop_effort_history
  USING (org_id = current_setting('app.current_org_id', true)::bigint)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::bigint);
```

Special cases:
- **stops_legacy** — 14,916 rows; some may have NULL `asset_id`. Run backfill, then check
  residual NULLs. Orphaned rows (no asset_id) will need a decision: delete, assign to default org,
  or leave nullable.
- **lead_route_overrides** — no FK constraint on pool_id. Backfill:
  `UPDATE lead_route_overrides lro SET org_id = rp.org_id FROM route_pools rp WHERE lro.pool_id = rp.id;`
- **stop_photos** — 2-hop backfill: `route_run_stop_id → route_run_stops → route_runs.org_id`

Each table should be its own transaction with the NULL-check assertion before `SET NOT NULL`.

---

### Phase 3 — Structural fixes (3 cases)

**audit_log:**
1. Reconcile org_id type: either cast in policy or `ALTER COLUMN org_id TYPE bigint USING org_id::text::bigint` (only safe if values are numeric UUIDs — likely not the case, may need to drop and re-add)
2. Replace SELECT policy: `DROP POLICY audit_log_select ON public.audit_log; CREATE POLICY audit_log_select ON public.audit_log FOR SELECT USING (...org filter...);`
3. Add INSERT WITH CHECK

**core.asset_locations and core.location_external_ids:**
```sql
-- Drop and recreate policy with WITH CHECK
DROP POLICY org_isolation ON core.asset_locations;
CREATE POLICY org_isolation ON core.asset_locations
  USING (org_id = current_setting('app.current_org_id', true)::bigint)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::bigint);
-- Repeat for location_external_ids
```

---

### Total blast radius

| Phase | Tables affected | Schema change | Data risk |
|-------|----------------|--------------|-----------|
| Phase 1 | 7 | None | None |
| Phase 2 | 14 | ADD COLUMN + backfill | Low (additive, verify NULLs before NOT NULL) |
| Phase 3 | 3 | Policy rewrite + possible type change | Medium on audit_log (active write path) |

---

## G) Clear Signal

**24 gaps found — fix these before onboarding a second tenant.**

- The entire `public` schema (except `audit_log` and `identity_directory`) has no RLS.
- The three intelligence-layer tables (`stop_condition_history`, `stop_effort_history`,
  `stop_risk_snapshot`) would expose org 1's scored operational history to org 2 with
  zero protection at the DB layer.
- `public.audit_log` SELECT policy is `USING (true)` — all audit entries are cross-tenant
  visible today.
- Two core tables (`asset_locations`, `location_external_ids`) have RLS enabled but no
  `WITH CHECK`, leaving the insert path unguarded at the DB layer.
- The `core` schema canonical layer is structurally sound (enabled, forced, policies present).
  ISSUE-012 is confirmed fixed. The problem is the transit adapter layer in `public` was
  never brought under RLS, and it holds real operational and intelligence data.
