# Tier 7 — Row Level Security & Tenant Isolation

> **Goal**: Enforce org-level data isolation at the database layer using Postgres Row Level Security, so no query — regardless of application logic — can leak data across tenant boundaries. This is the safety guarantee that makes multi-tenant operation trustworthy.
>
> **Status**: 🔴 Not started
> **Depends on**: Tier 1 done (canonical write paths must be stable before RLS policies are applied — a policy applied to an incomplete write path produces silent data gaps)
> **Blocks**: Tier 8 (asset abstraction should run on an RLS-enforced schema), Scale (no second agency before this is verified)

---

## Context

`org_id` exists on every canonical table. That was the right early decision. But existence is not enforcement. Right now a query that omits `WHERE org_id = $1` returns all rows from all orgs. In a single-tenant deployment that's harmless. In a multi-tenant platform it's a critical data boundary violation waiting to happen — not from malicious intent but from a missing WHERE clause in a fast-written query.

Postgres Row Level Security solves this at the DB layer. A policy attached to the table filters every SELECT, INSERT, UPDATE, and DELETE by the authenticated org context — set once per session via `SET app.current_org_id = $1` — regardless of what the application query says. Bad query, missing clause, new feature written without thinking about tenancy — all filtered correctly by the DB itself.

This is the right place to enforce it. Not the ORM. Not the service layer. The DB.

---

## Files to Touch

| File | Change |
|------|--------|
| `backend/migrations/YYYYMMDD_row_level_security.sql` (new) | Enable RLS on all canonical tables, create policies |
| `backend/src/db.ts` | Set `app.current_org_id` on every pool connection checkout |
| `backend/src/domains/visit/visitService.ts` | Verify `org_id` is passed on all inserts — no silent NULL |
| `backend/src/domains/observation/observationService.ts` | Same verification |
| `backend/src/domains/routeRun/routeRunService.ts` | Same verification |
| `backend/scripts/verify_rls.ts` (new) | Test script that proves cross-tenant queries return zero rows |

---

## Files to Leave Alone

| File | Reason |
|------|--------|
| All frontend files | RLS is DB-layer only |
| All auth files | Auth is frozen — Entra tenant ID mapping handled separately in Tier 8 |
| Transit adapter tables (`route_runs`, `clean_logs` etc.) | RLS applied to canonical layer first — transit adapter cleanup is post-Tier-2 |

---

## Change 1 — Enable RLS on Canonical Tables

### Migration

```sql
-- ============================================================
-- Row Level Security — Canonical Layer Tenant Isolation
-- Enforces org_id filtering at the DB layer.
-- All canonical tables gain a policy that restricts rows
-- to the org_id set in the session configuration variable
-- app.current_org_id.
-- ============================================================

-- Enable RLS on each canonical table
ALTER TABLE core.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.locations ENABLE ROW LEVEL SECURITY;

-- Policy: all operations restricted to current org
-- current_setting throws if var not set — use the 'true' fallback
-- so migrations and admin scripts can run with superuser bypass

CREATE POLICY org_isolation ON core.visits
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

CREATE POLICY org_isolation ON core.observations
  USING (
    visit_id IN (
      SELECT id FROM core.visits
      WHERE org_id = current_setting('app.current_org_id', true)::bigint
    )
  );

CREATE POLICY org_isolation ON core.evidence
  USING (
    visit_id IN (
      SELECT id FROM core.visits
      WHERE org_id = current_setting('app.current_org_id', true)::bigint
    )
  );

CREATE POLICY org_isolation ON core.assignments
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

CREATE POLICY org_isolation ON core.locations
  USING (org_id = current_setting('app.current_org_id', true)::bigint);

-- Superuser bypass (migrations, backfill scripts, admin ops)
-- These roles are granted BYPASSRLS explicitly
-- Application role does NOT get BYPASSRLS
ALTER TABLE core.visits FORCE ROW LEVEL SECURITY;
ALTER TABLE core.observations FORCE ROW LEVEL SECURITY;
ALTER TABLE core.evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE core.assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE core.locations FORCE ROW LEVEL SECURITY;

COMMENT ON POLICY org_isolation ON core.visits IS
  'Tenant isolation policy. Filters all operations by app.current_org_id '
  'session variable. Set by db.ts on every connection checkout. '
  'Superuser and migration role bypass via BYPASSRLS grant.';
```

---

## Change 2 — Set Org Context on Every Connection

### `backend/src/db.ts`

Every connection checked out from the pool must set `app.current_org_id` before any query runs. The org ID comes from the authenticated request context.

```typescript
// In the pool connection middleware / request handler setup:

export async function withOrgContext<T>(
  orgId: number,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query(
      `SET LOCAL app.current_org_id = $1`,
      [orgId]
    )
    return await fn(client)
  } finally {
    client.release()
  }
}
```

All service calls that currently do `pool.connect()` directly are refactored to go through `withOrgContext(orgId, async (client) => { ... })`.

The `orgId` comes from the authenticated user's org membership — resolved at the auth middleware layer from their Entra tenant ID.

### Done criteria
- Every request that touches canonical tables sets `app.current_org_id` before the first query
- A request with `org_id = 1` cannot retrieve rows belonging to `org_id = 2` under any query path
- Migration scripts run correctly with superuser bypass

---

## Change 3 — Verification Script

### `backend/scripts/verify_rls.ts`

```typescript
// Creates two orgs, inserts a visit for each, then verifies
// that querying as org 1 returns zero rows from org 2.

async function verifyRLS() {
  // Insert test org A visit
  // Insert test org B visit
  // Set app.current_org_id = org A
  // SELECT COUNT(*) FROM core.visits — must equal 1, not 2
  // Set app.current_org_id = org B
  // SELECT COUNT(*) FROM core.visits — must equal 1, not 2
  // Cleanup test rows
  // Log PASS or FAIL
}
```

Run as: `ts-node scripts/verify_rls.ts`

Must be run after every migration that touches canonical tables.

---

## Tier 7 Overall Done Definition

Tier 7 is complete when ALL of the following are true, **and a changelog entry has been written**:

- [ ] RLS enabled and policies applied to all five canonical tables
- [ ] `withOrgContext()` wrapper in place and all service calls use it
- [ ] `verify_rls.ts` runs and logs PASS
- [ ] Existing KCM data unaffected — all queries return correct results
- [ ] Migration scripts confirmed to bypass RLS correctly
- [ ] No `app.current_org_id` not-set errors in application logs
- [ ] Changelog entry written to `docs/changelog/YYYY-MM-DD-tier-7-rls-tenant-isolation.md`

---

## Agent Launch Block

```
Refactor task. Read CLAUDE.md, then planning/TIER_7_RLS_TENANT_ISOLATION.md.
Write the RLS migration enabling row level security on all five canonical tables
with org_isolation policies using app.current_org_id session variable.
Add withOrgContext() wrapper to backend/src/db.ts.
Refactor all service calls in visitService.ts, observationService.ts,
and routeRunService.ts to use withOrgContext instead of direct pool.connect().
Write backend/scripts/verify_rls.ts that proves cross-tenant isolation.
Do not touch any frontend files or auth files.
Superuser must bypass RLS — verify migration scripts still run correctly.
```