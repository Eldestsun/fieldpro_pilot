# ISSUE-009 — Fixture Failure Triage
**Date:** 2026-05-14  
**Analyst:** Claude Sonnet 4.6  
**Status:** Analysis complete — no fixes applied

---

## Confirmed Test Count

Test suite run: `cd backend && pnpm test`  
**Result: 51 passed, 48 failed (99 total)**

This differs from the S1-3 changelog baseline (19 pass / 15 fail / 34 total) because S1 sprints
(S1-1 through S1-13) added 65 new tests. The suite has grown from 34 to 99.

**Root cause of all 48 current failures:** PostgreSQL is not reachable (`ECONNREFUSED 127.0.0.1:5432`).
Docker was not running at analysis time. Every DB-touching test fails with `AggregateError` before
any assertion is reached.

**Projected failure count when DB is running (all S1 migrations applied):**  
~16 fail (16 ISSUE-009) / ~83 pass — based on code analysis below.

---

## Failure Classification

**Failure type codes**

| Code | Meaning |
|------|---------|
| **FX** | Fixture/setup problem — seed data missing from test DB |
| **EN** | Environment — DB not running; test expected to pass once DB starts |

**Origin codes**

| Code | Meaning |
|------|---------|
| **PRE** | Pre-existing before refactor; failing since canonical model was introduced |
| **S1** | Introduced during Security Sprint 1 |

---

### visits.test.ts

| Test name | File | Failure type | Origin | Fix complexity | Fix risk |
|-----------|------|-------------|--------|----------------|----------|
| ensureVisitForRouteRunStop creates exactly one visit with started_at | visits.test.ts | FX — ISSUE-009: `getVisitContext` throws missing `location_id`; stop "31150" not in `core.v_locations_transit` | PRE | trivial | safe |
| calling ensureVisitForRouteRunStop twice produces no duplicate | visits.test.ts | FX — ISSUE-009 | PRE | trivial | safe |
| closeVisitForRouteRunStop writes outcome='completed' on complete | visits.test.ts | FX — ISSUE-009 (calls `ensureVisitForRouteRunStop` first) | PRE | trivial | safe |
| closeVisitForRouteRunStop writes outcome='skipped' + reason_code on skip | visits.test.ts | FX — ISSUE-009 | PRE | trivial | safe |
| closeVisitForRouteRunStop returns null when no open visit exists | visits.test.ts | EN — does not call `ensureVisitForRouteRunStop`; only fails because DB is down | PRE | trivial | safe |

---

### observations.test.ts

| Test name | File | Failure type | Origin | Fix complexity | Fix risk |
|-----------|------|-------------|--------|----------------|----------|
| submit phase writes washed_can=true observation | observations.test.ts | FX — ISSUE-009 (calls `ensureVisitForRouteRunStop` via `setupVisit`) | PRE | trivial | safe |
| submit phase writes washed_can=false observation | observations.test.ts | FX — ISSUE-009 | PRE | trivial | safe |
| submit phase does NOT write washed_can when field is absent | observations.test.ts | FX — ISSUE-009 | PRE | trivial | safe |
| arrival phase writes ground_condition (defaults path) | observations.test.ts | FX — ISSUE-009 | PRE | trivial | safe |
| write inside the visit transaction (atomic with stop completion) | observations.test.ts | FX — ISSUE-009 | PRE | trivial | safe |

---

### evidence.test.ts

| Test name | File | Failure type | Origin | Fix complexity | Fix risk |
|-----------|------|-------------|--------|----------------|----------|
| createStopPhotos writes one core.evidence row per photo | evidence.test.ts | FX — ISSUE-009 (calls `ensureVisitForRouteRunStop` before photo write) | PRE | trivial | safe |
| createStopPhotos still writes stop_photos rows (no regression) | evidence.test.ts | FX — ISSUE-009 | PRE | trivial | safe |
| createStopPhotos does NOT create a visit row when called before stop-start | evidence.test.ts | EN — does not call `ensureVisitForRouteRunStop`; only fails because DB is down | PRE | trivial | safe |
| empty s3Keys list is a no-op | evidence.test.ts | FX — ISSUE-009 | PRE | trivial | safe |

---

### assignments.test.ts

| Test name | File | Failure type | Origin | Fix complexity | Fix risk |
|-----------|------|-------------|--------|----------------|----------|
| route creation writes one core.assignments row per stop | assignments.test.ts | EN — uses `LEFT JOIN core.v_locations_transit`; row inserts successfully with NULL `location_id` (nullable column); only fails because DB is down | PRE | trivial | safe |
| rows have correct type/status/source/location/asset/org | assignments.test.ts | FX — ISSUE-009: `LEFT JOIN core.v_locations_transit` returns NULL `location_id` for stop "31150"; assertion `location_id == FIXTURE_LOCATION_ID` fails | PRE | trivial | safe |
| ensureVisitForRouteRunStop writes assignment_id onto the visit | assignments.test.ts | FX — ISSUE-009 | PRE | trivial | safe |
| pre-Tier-5 route (no assignments) produces null assignment_id, no error | assignments.test.ts | FX — ISSUE-009 | PRE | trivial | safe |
| re-running the assignment INSERT is idempotent (ON CONFLICT DO NOTHING) | assignments.test.ts | EN — insert succeeds with NULL `location_id`; idempotency assertion (`>=`) passes; only fails because DB is down | PRE | trivial | safe |

---

### auditLog.test.ts (S1-1 / S1-3)

All 5 tests require the `audit_log` table (created in S1-1 migration) and RLS policies (S1-4 `audit_log_delete` policy). No ISSUE-009 dependency.

| Test name | File | Failure type | Origin | Fix complexity | Fix risk |
|-----------|------|-------------|--------|----------------|----------|
| writeAuditLog inserts a row readable by the app role | auditLog.test.ts | EN — audit_log table exists in schema; fails only because DB is down | S1 | trivial | safe |
| UPDATE is blocked by RLS — row survives unchanged | auditLog.test.ts | EN | S1 | trivial | safe |
| DELETE is blocked by RLS — row survives | auditLog.test.ts | EN | S1 | trivial | safe |
| audit_log query: S1-3 date range and org filtering returns correct entries | auditLog.test.ts | EN | S1 | trivial | safe |
| audit_log query: S1-3 action filter narrows results | auditLog.test.ts | EN | S1 | trivial | safe |

---

### eamBridge.test.ts (S1-7)

All 3 tests require `eam_bridge_route_log` and `eam_bridge_populate_state` tables (S1-7 migration). No ISSUE-009 dependency.

| Test name | File | Failure type | Origin | Fix complexity | Fix risk |
|-----------|------|-------------|--------|----------------|----------|
| eam_bridge_route_log: table has no worker identity columns | eamBridge.test.ts | EN | S1 | trivial | safe |
| populate inserts correct stop_count and exception_count | eamBridge.test.ts | EN | S1 | trivial | safe |
| populate is idempotent (ON CONFLICT DO NOTHING) | eamBridge.test.ts | EN | S1 | trivial | safe |

---

### oidCipher.test.ts (S1-13)

One DB test added in S1-13. Calls `ensureVisitForRouteRunStop` → hits ISSUE-009 before the S1-13 column assertions are reached.

| Test name | File | Failure type | Origin | Fix complexity | Fix risk |
|-----------|------|-------------|--------|----------------|----------|
| ensureVisitForRouteRunStop writes captured_by_oid_ciphertext and _key_id | oidCipher.test.ts | FX — ISSUE-009 (same root cause as PRE group; S1-13 column assertions unreachable until visit creation succeeds) | S1 | trivial | safe |

---

### exportDelete.test.ts (S1-4)

14 tests covering the `export_delete_tokens` table (created by S1-4 migration), the `audit_log_delete` RLS policy (S1-4), and the `organizations.tenant_uuid` column (S1-4). No ISSUE-009 dependency.

| Test name | File | Failure type | Origin | Fix complexity | Fix risk |
|-----------|------|-------------|--------|----------------|----------|
| export_delete_tokens: table exists with required columns | exportDelete.test.ts | EN | S1 | trivial | safe |
| token_hash is unique — duplicate hash rejected | exportDelete.test.ts | EN | S1 | trivial | safe |
| sha256 hash lookup returns correct row | exportDelete.test.ts | EN | S1 | trivial | safe |
| unknown token hash returns no rows (404 signal) | exportDelete.test.ts | EN | S1 | trivial | safe |
| expired token is detectable via expires_at < NOW() | exportDelete.test.ts | EN | S1 | trivial | safe |
| active token is not expired | exportDelete.test.ts | EN | S1 | trivial | safe |
| consumed token is detectable via consumed_at IS NOT NULL | exportDelete.test.ts | EN | S1 | trivial | safe |
| token org_id mismatch is detectable (403 signal) | exportDelete.test.ts | EN | S1 | trivial | safe |
| token org_id match succeeds (same org) | exportDelete.test.ts | EN | S1 | trivial | safe |
| audit_log_delete policy: DELETE is blocked without export_delete_active flag | exportDelete.test.ts | EN | S1 | trivial | safe |
| audit_log_delete policy: DELETE succeeds with export_delete_active + correct org_id | exportDelete.test.ts | EN | S1 | trivial | safe |
| audit_log_delete policy: SET LOCAL resets after COMMIT — subsequent DELETE blocked | exportDelete.test.ts | EN | S1 | trivial | safe |
| audit_log_delete policy: wrong org_id in session — DELETE blocked even with flag | exportDelete.test.ts | EN | S1 | trivial | safe |
| organizations: tenant_uuid column exists (added by S1-4 migration) | exportDelete.test.ts | EN | S1 | trivial | safe |

---

### sftpExport.test.ts (S1-6)

5 DB integration tests. Require DB + `audit_log` (S1-1) + `organizations.tenant_uuid` (S1-4). No ISSUE-009 dependency.

| Test name | File | Failure type | Origin | Fix complexity | Fix risk |
|-----------|------|-------------|--------|----------------|----------|
| local-only mode writes JSON and CSV bundles for fixture org | sftpExport.test.ts | EN | S1 | trivial | safe |
| org with no tenant_uuid gets synthetic audit UUID | sftpExport.test.ts | EN | S1 | trivial | safe |
| audit_log entry written after successful local export | sftpExport.test.ts | EN | S1 | trivial | safe |
| connection failure is caught and does not leave partial state | sftpExport.test.ts | EN | S1 | trivial | safe |
| mock SFTP server receives expected files for org export | sftpExport.test.ts | EN | S1 | trivial | safe |

---

### devAuthBypass.test.ts (S1-10)

One DB test (requires `audit_log` table, S1-1). No ISSUE-009 dependency.

| Test name | File | Failure type | Origin | Fix complexity | Fix risk |
|-----------|------|-------------|--------|----------------|----------|
| audit_log entry written for every bypass use | devAuthBypass.test.ts | EN | S1 | trivial | safe |

---

## Summary by Category

| Category | Count | Cause | When does it clear? |
|----------|-------|-------|---------------------|
| EN — DB not running | 32 | Docker/Postgres not running | Start DB |
| FX — ISSUE-009 (PRE) | 15 | Missing seed: `core.location_external_ids` has no row for stop "31150" | Start DB + fix ISSUE-009 seed |
| FX — ISSUE-009 (S1) | 1 | Same root cause; oidCipher DB test added in S1-13 | Start DB + fix ISSUE-009 seed |
| **Total failing** | **48** | | |

---

## Root Cause: ISSUE-009 Detail

**Affected tests:** 16 (15 pre-existing + 1 added in S1-13)

**Call chain:**
```
ensureVisitForRouteRunStop(client, { routeRunStopId, ... })
  → getVisitContext(client, routeRunStopId)
      → LEFT JOIN core.v_locations_transit loc ON loc.stop_id = rrs.stop_id
      → if (!location_id) throw new Error("missing location_id for route_run_stop...")
```

**View definition** (`core.v_locations_transit`):
```sql
SELECT l.id AS location_id, lei.external_id AS stop_id
FROM core.locations l
JOIN core.location_external_ids lei ON lei.location_id = l.id
WHERE l.location_type = 'transit_stop' AND lei.source_system = 'metro_stop';
```

**Missing seed data:** `core.location_external_ids` has no row with
`source_system = 'metro_stop'` and `external_id = '31150'`. The view returns no row
for the fixture stop → `getVisitContext` throws → test fails immediately.

**Secondary manifestation (assignments "rows have correct values"):**  
The `ASSIGNMENT_INSERT_SQL` uses `LEFT JOIN core.v_locations_transit`, so the assignment
row is inserted with `location_id = NULL` (nullable column). The test assertion
`assertEqual(Number(r.location_id), FIXTURE_LOCATION_ID, "location_id")` fails
because `Number(null) = 0 ≠ 1`.

**Note on `FIXTURE_LOCATION_ID = 1`:** The fixture hardcodes `location_id = 1`. Any seed
fix must ensure stop "31150" maps to exactly `id = 1` in `core.locations`, or the fixture
constant must be changed to a dynamic lookup.

---

## Recommended Fix Sequence

### Step 1 — Start the DB (fixes 32 tests, no code change)

Start Docker and confirm Postgres responds:
```sh
docker compose up -d db
pg_isready -h localhost -p 5432 -U fieldpro -d fieldpro_db
```

This eliminates all 32 EN-category failures. No schema or code changes required.

Prerequisite check: confirm all S1 migrations have been applied to the local DB:
- `20260513_audit_log.sql` (S1-1) — `audit_log` table + RLS
- `20260513_s1_4_export_delete_tokens.sql` (S1-4) — `export_delete_tokens` + `organizations.tenant_uuid` + `audit_log_delete` policy
- `20260513_eam_bridge_route_log.sql` (S1-7) — `eam_bridge_route_log` + `eam_bridge_populate_state`
- `20260513_s1_13_oid_encryption.sql` (S1-13) — `captured_by_oid_ciphertext` + `captured_by_oid_key_id` on `core.visits`

If any migration is absent, the corresponding EN tests will fail with "table/column not found" rather
than ECONNREFUSED — diagnose via migration runner before attributing to other causes.

---

### Step 2 — Fix ISSUE-009 seed (fixes 16 tests, trivial)

Two implementation options:

**Option A — Idempotent seed SQL (recommended)**  
Add a seed file (e.g., `backend/tests/fixtures/test_seed.sql`) that ensures the fixture location
exists with the expected `id`:

```sql
-- Test fixture: ensure stop "31150" maps to location_id=1 in core schema
INSERT INTO core.locations (id, org_id, location_type, label, lon, lat, active)
VALUES (1, 1, 'transit_stop', '31150', -122.3, 47.6, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO core.location_external_ids (org_id, location_id, source_system, external_id)
VALUES (1, 1, 'metro_stop', '31150')
ON CONFLICT (org_id, source_system, external_id) DO NOTHING;
```

Run this as a one-time setup step (before tests, or as a dev migration). Safe — uses `ON CONFLICT DO NOTHING`.

**Option B — Dynamic fixture lookup (more robust)**  
Modify `tests/setup.ts` to query the actual `location_id` for stop "31150" at test-suite startup
and store it as the fixture constant. Removes hardcoded `FIXTURE_LOCATION_ID = 1`:

```typescript
// In a globalSetup or at the top of setup.ts
const locRow = await pool.query(
  `SELECT location_id FROM core.v_locations_transit WHERE stop_id = $1 LIMIT 1`,
  [FIXTURE_STOP_ID]
);
export const FIXTURE_LOCATION_ID = locRow.rows[0]?.location_id ?? null;
```

Option A is simpler and preserves the existing constant semantics. Option B is more robust if the
DB is ever rebuilt with a different ID sequence.

**Risk:** Both options are safe. Neither touches canonical write paths or production data.
The seed data is test-only and isolated to org_id=1 / location_id=1.

---

## Tests NOT Covered by This Triage

All 51 currently-passing tests are unaffected. They include:

- Pure logic tests: `assertClaims` (9), `uploadValidation` (13), `oidCipher` pure (10),
  `sftpExport` pure (9), `devAuthBypass` gate (9)
- 1 visit test: `deriveClientVisitId is deterministic` (UUIDv5, no DB)

These tests pass in the current environment (DB down) and are not at risk from either fix step.

---

## Open Questions for Next Session

1. **Are all S1 migrations applied?** Run `pnpm ts-node scripts/runMigrations.ts` (or equivalent)
   against the local DB and confirm no pending migrations before retesting.

2. **Is stop "31150" in `public.transit_stops`?** The `createRouteRunFixture` function inserts into
   `route_run_stops` with `stop_id = "31150"` and `asset_id = 2`. These require `public.assets.id = 2`
   to exist (FK constraint). If the DB was rebuilt from scratch without the KCM data dump, the fixture
   insert itself will fail before ISSUE-009 is reached. Verify with:
   ```sql
   SELECT id FROM public.assets WHERE id = 2;
   SELECT stop_id FROM public.transit_stops WHERE stop_id = '31150' LIMIT 1;
   ```

3. **FIXTURE_LOCATION_ID = 1**: If Option A is used, confirm `core.locations` SERIAL sequence is
   either reset or the explicit INSERT id=1 doesn't conflict with existing rows.
