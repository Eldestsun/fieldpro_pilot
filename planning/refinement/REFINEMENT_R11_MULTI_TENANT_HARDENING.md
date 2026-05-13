# R11 — Multi-Tenant Hardening

> **Goal**: Close the tenant isolation and labor-safety gaps surfaced by the 2026-05-13 schema audit before the KCM pilot staging environment is stood up. Every gap here is a potential TPRA finding or a data boundary violation at second-agency onboarding.
>
> **Status**: 🔴 Not started
> **Depends on**: Tier 7 done (RLS pattern established), Tier 8 done (core.asset_types with org_id is the reference pattern)
> **Blocks**: Fly.io beta deploy (C1 is visible in schema), Azure pilot staging (TPRA reviewer will inspect schema)

---

## Source

Findings from `docs/audit/2026-05-13-schema-audit.md` produced by Opus 4 full-schema audit.

---

## What This Item Does NOT Do

- Does not drop transit adapter tables (`clean_logs`, `stop_photos`, `route_run_stops`) — these are still live write paths in shadow mode. Vestigial `user_id`/`reported_by` columns in the adapter layer are post-pilot cleanup.
- Does not add `org_id` to all 17 public tables missing it — that is pre-scale work, not pilot-blocking.
- Does not touch auth files, offline queue files, or any frontend component.
- Does not change any canonical write paths — migrations and comments only.

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/migrations/20260513_r11_identity_directory_org.sql` (new) | Add `org_id` to `identity_directory`, backfill KCM, add RLS |
| `backend/migrations/20260513_r11_core_location_tables_rls.sql` (new) | Add RLS to `core.asset_locations` and `core.location_external_ids` |
| `backend/migrations/20260513_r11_route_runs_org_notnull.sql` (new) | Make `public.route_runs.org_id` NOT NULL, backfill nulls |
| `backend/src/domains/routeRun/routeRunService.ts` | Add comment documenting `loadRouteRunById` OID→name join as controlled exception |
| `backend/scripts/verify_r11.ts` (new) | Verification script — proves identity_directory is org-isolated |
| `docs/audit/2026-05-13-schema-audit.md` | Mark resolved items |

---

## Change 1 — `identity_directory`: Add `org_id` + RLS

### Why

`public.identity_directory` stores worker display names, emails, roles, and last-seen timestamps keyed by Azure Entra OID. It has no `org_id` column and no RLS policy. In a single-tenant KCM deployment this is harmless. In a multi-tenant deployment, every tenant's workforce is pooled into one global table — a Lead at agency two could theoretically have their OID resolved to a KCM worker's display name.

The TPRA reviewer will inspect the schema. A user table with no tenant isolation is a finding.

### Migration

```sql
-- ============================================================
-- R11 Change 1 — identity_directory tenant isolation
-- Adds org_id column, backfills KCM org (id=1),
-- adds NOT NULL constraint, enables RLS.
-- ============================================================

-- Step 1: add org_id column (nullable first for backfill)
ALTER TABLE public.identity_directory
  ADD COLUMN IF NOT EXISTS org_id bigint REFERENCES public.organizations(id);

-- Step 2: backfill all existing rows to KCM org
-- Assumes org id=1 is KCM — verify before running on production
UPDATE public.identity_directory SET org_id = 1 WHERE org_id IS NULL;

-- Step 3: enforce NOT NULL
ALTER TABLE public.identity_directory
  ALTER COLUMN org_id SET NOT NULL;

-- Step 4: index for lookup performance
CREATE INDEX IF NOT EXISTS idx_identity_directory_org_id
  ON public.identity_directory (org_id);

-- Step 5: enable RLS using the same pattern as core tables
ALTER TABLE public.identity_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_directory FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON public.identity_directory
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

-- Step 6: document the table's purpose and constraints
COMMENT ON TABLE public.identity_directory IS
  'Operational identity registry — maps Azure Entra OIDs to display names '
  'and roles for UI presentation and route assignment. '
  'Tenant-isolated via RLS on org_id. '
  'LABOR SAFETY: This table is the ONLY place worker identity is stored. '
  'No query in the intelligence layer (riskMapService, stop_risk_snapshot, '
  'stop_effort_history, stop_condition_history, AdminControlCenter) may '
  'JOIN to this table. The one controlled exception is loadRouteRunById '
  'in routeRunService.ts — documented there with justification. '
  'Any new JOIN to this table requires explicit review and comment.';
```

### Backend impact

`withOrgContext()` in `db.ts` already sets `app.current_org_id` on every connection checkout. The new RLS policy on `identity_directory` will automatically filter to the current tenant on every query — no application code changes required.

### Verify

After migration:
```sql
-- Should return only KCM rows when org context is set
SET app.current_org_id = 1;
SELECT count(*) FROM public.identity_directory; -- returns KCM user count

-- Should return 0 rows when different org context is set
SET app.current_org_id = 999;
SELECT count(*) FROM public.identity_directory; -- returns 0
```

---

## Change 2 — `core.asset_locations` + `core.location_external_ids`: Add RLS

### Why

Audit found these are the only two `core.*` tables with `org_id` but no RLS policy — a gap from Tier 7 which focused on the five primary canonical tables. These are location mapping tables used by the intelligence layer.

### Migration

```sql
-- ============================================================
-- R11 Change 2 — RLS on core location mapping tables
-- These were missed by Tier 7 — both have org_id but no policy.
-- ============================================================

ALTER TABLE core.asset_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.asset_locations FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON core.asset_locations
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

ALTER TABLE core.location_external_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.location_external_ids FORCE ROW LEVEL SECURITY;

CREATE POLICY org_isolation ON core.location_external_ids
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

COMMENT ON POLICY org_isolation ON core.asset_locations IS
  'Tenant isolation — mirrors Tier 7 pattern. Missed in original RLS migration.';

COMMENT ON POLICY org_isolation ON core.location_external_ids IS
  'Tenant isolation — mirrors Tier 7 pattern. Missed in original RLS migration.';
```

---

## Change 3 — `public.route_runs.org_id`: Enforce NOT NULL

### Why

`route_runs.org_id` is currently nullable. Every route run should belong to an org — a NULL here means a route run with no tenant ownership, which is both a data integrity gap and a potential RLS bypass vector if RLS is ever applied to `route_runs`.

### Migration

```sql
-- ============================================================
-- R11 Change 3 — route_runs.org_id NOT NULL enforcement
-- ============================================================

-- Step 1: backfill any NULL rows to KCM org before constraining
UPDATE public.route_runs SET org_id = 1 WHERE org_id IS NULL;

-- Step 2: enforce NOT NULL
ALTER TABLE public.route_runs
  ALTER COLUMN org_id SET NOT NULL;

-- Step 3: add FK if not already present
ALTER TABLE public.route_runs
  ADD CONSTRAINT IF NOT EXISTS fk_route_runs_org
  FOREIGN KEY (org_id) REFERENCES public.organizations(id);
```

---

## Change 4 — Document `loadRouteRunById` as Controlled Exception

### Why

The schema audit flagged `loadRouteRunById` in `routeRunService.ts` as the only backend location that JOINs `identity_directory` to resolve worker display names. This join is architecturally acceptable — a Lead viewing their route detail needs to see who the route is assigned to for operational purposes. But it must be documented as a controlled exception so no future agent or developer treats it as a pattern to replicate.

### Change

In `backend/src/domains/routeRun/routeRunService.ts`, find the `loadRouteRunById` function and add a comment above the identity_directory JOIN:

```typescript
// CONTROLLED EXCEPTION — identity_directory JOIN
// This is the only permitted JOIN to identity_directory in the codebase.
// Purpose: route detail view shows the Lead who assigned the route and
// the UL it was assigned to — operational necessity for route management.
// Constraint: this display name MUST NOT flow into any intelligence surface
// (risk maps, condition history, effort history, Control Center dashboards).
// Any new JOIN to identity_directory requires explicit review. See R11 spec.
```

---

## Change 5 — Orphan Table Investigation + Drop

### Why

The audit identified four orphan candidates that may be safe to drop:
- `public.lead_route_overrides` — 0 rows, purpose unclear
- `public.route_run_audit` — 0 rows, UUID/bigint FK mismatch makes it non-functional
- `public.stops_legacy` — superseded by `transit_stops`
- `public.asset_types` — superseded by `core.asset_types` (Tier 8)

### Process

Before dropping anything, the agent must:

1. Run `SELECT count(*) FROM <table>` — confirm 0 rows
2. Run `SELECT * FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY'` to confirm nothing references the table
3. Search `backend/src/` for any reference to the table name in queries or service files
4. Only drop if: 0 rows AND no FKs pointing to it AND no backend references

```sql
-- Only run after investigation confirms safe:
DROP TABLE IF EXISTS public.route_run_audit;
DROP TABLE IF EXISTS public.stops_legacy;
-- public.asset_types: verify core.asset_types fully replaces it first
-- public.lead_route_overrides: investigate purpose before dropping
```

---

## Verification Script — `backend/scripts/verify_r11.ts`

```typescript
// Verify R11 multi-tenant hardening
// Run: npx ts-node scripts/verify_r11.ts

import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function verify() {
  const client = await pool.connect()
  const results: { test: string; pass: boolean; detail: string }[] = []

  try {
    // Test 1: identity_directory has org_id column
    const col = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'identity_directory' AND column_name = 'org_id'
    `)
    results.push({
      test: 'identity_directory has org_id',
      pass: col.rows.length === 1,
      detail: col.rows.length === 1 ? 'column exists' : 'MISSING'
    })

    // Test 2: identity_directory has RLS policy
    const rls = await client.query(`
      SELECT policyname FROM pg_policies
      WHERE tablename = 'identity_directory' AND policyname = 'org_isolation'
    `)
    results.push({
      test: 'identity_directory has org_isolation policy',
      pass: rls.rows.length === 1,
      detail: rls.rows.length === 1 ? 'policy exists' : 'MISSING'
    })

    // Test 3: identity_directory cross-tenant isolation
    await client.query(`SET app.current_org_id = 999`)
    const crossTenant = await client.query(
      `SELECT count(*) FROM public.identity_directory`
    )
    results.push({
      test: 'identity_directory returns 0 rows for unknown org',
      pass: parseInt(crossTenant.rows[0].count) === 0,
      detail: `returned ${crossTenant.rows[0].count} rows`
    })

    // Test 4: core.asset_locations has RLS
    const alRls = await client.query(`
      SELECT policyname FROM pg_policies
      WHERE tablename = 'asset_locations' AND schemaname = 'core'
    `)
    results.push({
      test: 'core.asset_locations has RLS policy',
      pass: alRls.rows.length > 0,
      detail: alRls.rows.length > 0 ? 'policy exists' : 'MISSING'
    })

    // Test 5: route_runs.org_id is NOT NULL
    const rrNull = await client.query(`
      SELECT count(*) FROM public.route_runs WHERE org_id IS NULL
    `)
    results.push({
      test: 'route_runs has no NULL org_id rows',
      pass: parseInt(rrNull.rows[0].count) === 0,
      detail: `${rrNull.rows[0].count} NULL rows`
    })

    // Test 6: no user_id on intelligence tables
    const labourSafety = await client.query(`
      SELECT table_name FROM information_schema.columns
      WHERE column_name = 'user_id'
        AND table_name IN (
          'stop_effort_history','stop_condition_history',
          'stop_risk_snapshot','stop_risk_scores'
        )
    `)
    results.push({
      test: 'intelligence tables have no user_id column',
      pass: labourSafety.rows.length === 0,
      detail: labourSafety.rows.length === 0
        ? 'clean'
        : `FOUND on: ${labourSafety.rows.map((r: any) => r.table_name).join(', ')}`
    })

  } finally {
    client.release()
    await pool.end()
  }

  console.log('\nR11 Verification Results\n' + '─'.repeat(50))
  let allPass = true
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌'
    console.log(`${icon} ${r.test} — ${r.detail}`)
    if (!r.pass) allPass = false
  }
  console.log('─'.repeat(50))
  console.log(allPass ? '\nAll assertions PASS' : '\nFAILURES detected — see above')
  process.exit(allPass ? 0 : 1)
}

verify().catch(console.error)
```

---

## Done Criteria

- [ ] `identity_directory` has `org_id NOT NULL`, FK to `organizations`, RLS policy
- [ ] Cross-tenant query against `identity_directory` returns 0 rows (verified by script)
- [ ] `core.asset_locations` and `core.location_external_ids` have `org_isolation` RLS policies
- [ ] `public.route_runs.org_id` is NOT NULL, no NULL rows exist
- [ ] `loadRouteRunById` has the controlled exception comment
- [ ] Orphan tables investigated — safe ones dropped, remainder documented
- [ ] `verify_r11.ts` runs clean — all 6 assertions PASS
- [ ] Migration runner stamps all three new migrations
- [ ] Changelog written to `docs/changelog/2026-05-13-r11-multi-tenant-hardening.md`

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🔴 Not started | No work begun |
| 🟡 In progress | Active development |
| 🟢 Done | All done-criteria verified |