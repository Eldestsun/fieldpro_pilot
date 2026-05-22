import {
  pool,
  test,
  assert,
  assertEqual,
  FIXTURE_ORG_ID,
  FIXTURE_STOP_ID,
  FIXTURE_ASSET_ID,
} from "../setup";
import { loadRouteRunById } from "../../src/domains/routeRun/loaders/loadRouteRunById";

// Cross-tenant fail-closed proof for loadRouteRunById.
//
// Scenario:
//   Org A = FIXTURE_ORG_ID (1, KCM — the dev fixture org).
//   Org B = a synthetic second org created for the test.
//   A route_run is inserted under org B, with one route_run_stop also in org B.
//
// Expectations:
//   loadRouteRunById(orgBRouteRunId, FIXTURE_ORG_ID) -> null    (fail-closed)
//   loadRouteRunById(orgBRouteRunId, orgBId)         -> non-null and matches
//
// Why this matters:
//   route_runs has the Phase 2 "unset = bypass" RLS policy; before this fix,
//   loadRouteRunById ran on a bare pool connection (app.current_org_id unset)
//   and would have returned org B's row to a caller in org A. After the fix,
//   the loader runs inside withOrgContext(orgId) and RLS scopes the read to
//   the caller's org. A cross-tenant request returns null, not a leak.

const TEST_SLUG_PREFIX = "test-load-rr-orgb";

async function createOrgB(): Promise<number> {
  // Unique slug + tenant_uuid per test run to avoid collisions in repeated runs.
  const tag = `${TEST_SLUG_PREFIX}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const res = await pool.query<{ id: number }>(
    `INSERT INTO organizations (name, slug, tenant_uuid)
     VALUES ($1, $1, $2)
     RETURNING id`,
    [tag, tag],
  );
  return Number(res.rows[0].id);
}

async function deleteOrgB(orgId: number): Promise<void> {
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
}

async function createOrgBRouteRunFixture(orgBId: number): Promise<{
  routeRunId: number;
  stopId: string;
}> {
  // Unique per-run stop_id so re-running the test does not collide with
  // any prior fixture left over from a crashed run.
  const stopId = `test-orgb-stop-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const client = await pool.connect();
  try {
    // route_runs, route_run_stops, and transit_stops all have the Phase 1/2
    // "unset = bypass" policy. Leaving app.current_org_id unset on this
    // connection lets the migration-style writes through. We set org_id to
    // orgBId on each row explicitly so they belong to org B.

    // Seed a transit_stops row in org B so the loader's
    //   JOIN stops s ON s.stop_id = rrs.stop_id
    // can find a row when scoped to org B's RLS context.
    await client.query(
      `INSERT INTO transit_stops (stop_id, org_id, is_hotspot, compactor, has_trash)
       VALUES ($1, $2, false, false, false)`,
      [stopId, orgBId],
    );

    // route_pool_id intentionally omitted: a trigger enforces
    // route_runs.org_id == route_pools.org_id, and we do not want to seed a
    // synthetic pool in org B for this test. The loader does not require a
    // pool to be present.
    const runRes = await client.query<{ id: number }>(
      `INSERT INTO route_runs (run_date, status, org_id)
       VALUES (CURRENT_DATE, 'planned', $1)
       RETURNING id`,
      [orgBId],
    );
    const routeRunId = Number(runRes.rows[0].id);

    await client.query(
      `INSERT INTO route_run_stops (route_run_id, stop_id, asset_id, sequence, org_id)
       VALUES ($1, $2, $3, 0, $4)`,
      [routeRunId, stopId, FIXTURE_ASSET_ID, orgBId],
    );

    return { routeRunId, stopId };
  } finally {
    // Clear any session-leaked GUC just in case.
    try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort */ }
    client.release();
  }
}

async function cleanupOrgBRouteRun(routeRunId: number, stopId: string): Promise<void> {
  // route_runs CASCADEs to route_run_stops; transit_stops must be cleaned
  // up explicitly. Stop deletion follows route_run_stops removal because
  // of the FK.
  await pool.query(`DELETE FROM route_runs WHERE id = $1`, [routeRunId]);
  await pool.query(`DELETE FROM transit_stops WHERE stop_id = $1`, [stopId]);
}

test("loadRouteRunById: cross-tenant request returns null (fail-closed)", async () => {
  const orgBId = await createOrgB();
  let routeRunId: number | null = null;
  let stopId: string | null = null;
  try {
    ({ routeRunId, stopId } = await createOrgBRouteRunFixture(orgBId));

    // Caller is org A (FIXTURE_ORG_ID). Target row belongs to org B. RLS on
    // route_runs (and on the identity_directory JOIN) must filter it out.
    const crossTenant = await loadRouteRunById(routeRunId, FIXTURE_ORG_ID);
    assertEqual(crossTenant, null, "cross-tenant load must return null, not the foreign row");

    // Sanity: caller in org B can see its own row. Returns non-null and id matches.
    const sameTenant = await loadRouteRunById(routeRunId, orgBId);
    assert(sameTenant !== null, "same-tenant load must return the row");
    assertEqual(Number(sameTenant!.id), routeRunId, "same-tenant load returns the correct route_run id");
  } finally {
    if (routeRunId !== null && stopId !== null) {
      await cleanupOrgBRouteRun(routeRunId, stopId);
    }
    await deleteOrgB(orgBId);
  }
});
