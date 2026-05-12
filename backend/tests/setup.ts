import { Pool, PoolClient } from "pg";

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host:     process.env.PGHOST     ?? "localhost",
      port:     Number(process.env.PGPORT ?? 5432),
      user:     process.env.PGUSER     ?? "fieldpro",
      password: process.env.PGPASSWORD ?? "fieldpro_pass",
      database: process.env.PGDATABASE ?? "fieldpro_db",
    });

// Fixture stop — exists in transit_stops, public.stops (asset_id=2),
// and core.v_locations_transit (location_id=1, org_id=1).
export const FIXTURE_STOP_ID = "31150";
export const FIXTURE_ASSET_ID = 2;
export const FIXTURE_LOCATION_ID = 1;
export const FIXTURE_ORG_ID = 1;
export const FIXTURE_POOL_ID = "TEST_POOL";
export const FIXTURE_BASE_ID = "SOUTH";
export const FIXTURE_ACTOR_OID = "test-actor-oid-canonical-suite";
export const FIXTURE_CREATED_BY_OID = "test-lead-oid-canonical-suite";

export type RouteRunFixture = {
  routeRunId: number;
  routeRunStopId: number;
};

/**
 * Insert a route_run + one route_run_stop directly via SQL (no OSRM).
 * Returns ids for use in tests. Cleanup via cleanupFixture().
 */
export async function createRouteRunFixture(client: PoolClient): Promise<RouteRunFixture> {
  const runRes = await client.query(
    `INSERT INTO route_runs (route_pool_id, run_date, status)
     VALUES ($1, CURRENT_DATE, 'planned')
     RETURNING id`,
    [FIXTURE_POOL_ID]
  );
  const routeRunId = Number(runRes.rows[0].id);

  const stopRes = await client.query(
    `INSERT INTO route_run_stops (route_run_id, stop_id, asset_id, sequence)
     VALUES ($1, $2, $3, 0)
     RETURNING id`,
    [routeRunId, FIXTURE_STOP_ID, FIXTURE_ASSET_ID]
  );
  const routeRunStopId = Number(stopRes.rows[0].id);

  return { routeRunId, routeRunStopId };
}

/**
 * Remove everything created by a fixture and any downstream test writes.
 * Order matters: child rows before parents. Most FKs cascade from core.visits
 * and route_runs, but we delete explicitly to be safe and resilient against
 * partial writes when a test fails mid-way.
 */
export async function cleanupFixture(client: PoolClient, f: RouteRunFixture): Promise<void> {
  // stop_photos: FK to route_run_stops ON DELETE CASCADE — but delete explicitly
  // so we tolerate a future schema change.
  await client.query(`DELETE FROM stop_photos WHERE route_run_stop_id = $1`, [f.routeRunStopId]);
  // core.evidence: FK to core.visits ON DELETE CASCADE — cascaded with visit delete.
  // core.observations: FK to core.visits ON DELETE CASCADE — cascaded with visit delete.
  // Delete visits for this stop (cascades evidence + observations).
  await client.query(
    `DELETE FROM core.visits
     WHERE client_visit_id = $1`,
    [deriveClientVisitIdLocal(f.routeRunStopId)]
  );
  // Belt-and-suspenders: any visit accidentally created with a different
  // client_visit_id but same primary_asset_id+org via a stray write would
  // leak — these tests do not create those, so a stop-scoped delete is enough.

  // Assignments: scoped by source_ref = routeRunId
  await client.query(
    `DELETE FROM core.assignments
     WHERE source_system = 'route_runs' AND source_ref = $1::text`,
    [f.routeRunId]
  );

  // route_run_stops: FK from stop_photos already deleted, hazards/infra are nullable.
  // route_runs delete cascades route_run_stops.
  await client.query(`DELETE FROM route_runs WHERE id = $1`, [f.routeRunId]);
}

// Local copy of deriveClientVisitId — tests should not depend on src/ implementation
// being stable, but the UUIDv5 derivation is part of the canonical contract under test.
import { v5 as uuidv5 } from "uuid";
const ROUTE_RUN_STOP_NAMESPACE = "4c5e1b10-1f0a-4ce4-9a6b-3b9b6a0f8b9c";
export function deriveClientVisitIdLocal(routeRunStopId: number): string {
  return uuidv5(`route-run-stop:${routeRunStopId}`, ROUTE_RUN_STOP_NAMESPACE);
}

// Minimal test framework — no external deps. Each test file calls test()
// to register, and tests/run.ts calls runAll().
type TestCase = { name: string; fn: () => Promise<void> };
const REGISTRY: TestCase[] = [];

export function test(name: string, fn: () => Promise<void>): void {
  REGISTRY.push({ name, fn });
}

export async function runAll(): Promise<number> {
  let passed = 0;
  let failed = 0;
  const failures: { name: string; err: unknown }[] = [];

  for (const t of REGISTRY) {
    try {
      await t.fn();
      console.log(`  ✓ ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${t.name}`);
      console.log(`      ${(err as Error).stack ?? err}`);
      failures.push({ name: t.name, err });
      failed++;
    }
  }

  console.log("");
  console.log(`${passed} passed, ${failed} failed (${REGISTRY.length} total)`);

  return failed === 0 ? 0 : 1;
}

export function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

export function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
