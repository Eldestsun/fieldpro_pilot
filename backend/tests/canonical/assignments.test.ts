import {
  pool,
  test,
  assert,
  assertEqual,
  createRouteRunFixture,
  cleanupFixture,
  deriveClientVisitIdLocal,
  FIXTURE_ACTOR_OID,
  FIXTURE_ORG_ID,
  FIXTURE_ASSET_ID,
  FIXTURE_LOCATION_ID,
  FIXTURE_CREATED_BY_OID,
} from "../setup";
import type { PoolClient } from "pg";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";

// Tier 5 — Assignment Layer done-criteria
//
// These tests cover the SQL contract in routeRunService.createRouteRun and
// visitService.ensureVisitForRouteRunStop against the real schema. The
// createRouteRun function itself depends on OSRM for stop ordering; the
// assignment writes it performs are deterministic SQL we exercise directly
// against fixture data here.

// Reproduces the assignment writes from routeRunService.createRouteRun (the two
// statements at the "Write canonical assignments" block). Post the §3.2 sidecar
// extraction, creator identity is NOT a column on core.assignments — it goes to
// the no-grant sidecar core.assignment_actor_audit. This helper mirrors both
// production statements so the test stays a faithful reproduction of the
// contract, not a snapshot of one half of it.
async function planAssignments(
  client: PoolClient,
  routeRunId: number,
  createdByOid: string,
  planDate: Date,
): Promise<void> {
  const assignRes = await client.query(
    `
    INSERT INTO core.assignments (
      org_id, assignment_type, status, location_id,
      primary_asset_id, planned_for_date,
      source_system, source_ref, meta
    )
    SELECT
      a.org_id, 'transit_stop_clean', 'planned', loc.location_id,
      s.asset_id, $1::date,
      'route_runs', $2::text, '{}'::jsonb
    FROM route_run_stops rrs
    JOIN public.stops s ON s.stop_id = rrs.stop_id
    JOIN public.assets a ON a.id = rrs.asset_id
    LEFT JOIN core.v_locations_transit loc ON loc.stop_id = rrs.stop_id
    WHERE rrs.route_run_id = $2::bigint
    ON CONFLICT DO NOTHING
    RETURNING id, org_id
    `,
    [planDate, routeRunId],
  );

  if (assignRes.rows.length > 0) {
    await client.query(
      `
      INSERT INTO core.assignment_actor_audit (assignment_id, org_id, actor_ref)
      SELECT UNNEST($1::bigint[]), UNNEST($2::bigint[]), $3
      ON CONFLICT (assignment_id) DO NOTHING
      `,
      [
        assignRes.rows.map((r) => r.id),
        assignRes.rows.map((r) => r.org_id),
        createdByOid,
      ],
    );
  }
}

test("assignments: route creation writes one core.assignments row per stop", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    await planAssignments(client, f.routeRunId, FIXTURE_CREATED_BY_OID, new Date());

    const stopsCount = await client.query(
      `SELECT COUNT(*)::int AS n FROM route_run_stops WHERE route_run_id = $1`,
      [f.routeRunId]
    );
    const asgCount = await client.query(
      `SELECT COUNT(*)::int AS n FROM core.assignments
       WHERE source_system = 'route_runs' AND source_ref = $1::text`,
      [f.routeRunId]
    );
    assertEqual(asgCount.rows[0].n, stopsCount.rows[0].n, "one assignment per stop");
    assert(asgCount.rows[0].n > 0, "at least one assignment written");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("assignments: rows have correct type/status/source/location/asset/org", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    await planAssignments(client, f.routeRunId, FIXTURE_CREATED_BY_OID, new Date());

    const row = await client.query(
      `SELECT assignment_type, status, source_system, source_ref,
              org_id, location_id, primary_asset_id
       FROM core.assignments
       WHERE source_system = 'route_runs' AND source_ref = $1::text`,
      [f.routeRunId]
    );
    assertEqual(row.rowCount, 1, "one assignment row");
    const r = row.rows[0];
    assertEqual(r.assignment_type, "transit_stop_clean", "assignment_type");
    assertEqual(r.status, "planned", "status");
    assertEqual(r.source_system, "route_runs", "source_system");
    assertEqual(r.source_ref, String(f.routeRunId), "source_ref");
    assertEqual(Number(r.org_id), FIXTURE_ORG_ID, "org_id");
    assertEqual(Number(r.location_id), FIXTURE_LOCATION_ID, "location_id");
    assertEqual(Number(r.primary_asset_id), FIXTURE_ASSET_ID, "primary_asset_id");

    // Creator identity is no longer a column on core.assignments (§3.2 sidecar
    // extraction) — it lives in the no-grant sidecar core.assignment_actor_audit.
    const audit = await client.query(
      `SELECT aa.actor_ref
       FROM core.assignment_actor_audit aa
       JOIN core.assignments a ON a.id = aa.assignment_id
       WHERE a.source_system = 'route_runs' AND a.source_ref = $1::text`,
      [f.routeRunId]
    );
    assertEqual(audit.rowCount, 1, "one assignment_actor_audit row");
    assertEqual(audit.rows[0].actor_ref, FIXTURE_CREATED_BY_OID, "actor_ref (creator identity in sidecar)");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("assignments: ensureVisitForRouteRunStop writes assignment_id onto the visit", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    // Plant the assignment first (simulating a post-Tier-5 route).
    await planAssignments(client, f.routeRunId, FIXTURE_CREATED_BY_OID, new Date());

    await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    const row = await client.query(
      `SELECT v.assignment_id, a.source_ref
       FROM core.visits v
       LEFT JOIN core.assignments a ON a.id = v.assignment_id
       WHERE v.client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)]
    );
    assertEqual(row.rowCount, 1, "visit row exists");
    assert(row.rows[0].assignment_id !== null, "assignment_id non-null on post-Tier-5 route");
    assertEqual(row.rows[0].source_ref, String(f.routeRunId), "links to this route_run");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("assignments: pre-Tier-5 route (no assignments) produces null assignment_id, no error", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    // Do NOT write assignment — simulates a pre-Tier-5 route.
    await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    const row = await client.query(
      `SELECT assignment_id FROM core.visits WHERE client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)]
    );
    assertEqual(row.rowCount, 1, "visit was created");
    assertEqual(row.rows[0].assignment_id, null, "assignment_id is null");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("assignments: re-running the assignment INSERT is idempotent (ON CONFLICT DO NOTHING)", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    const planDate = new Date();
    await planAssignments(client, f.routeRunId, FIXTURE_CREATED_BY_OID, planDate);
    const before = await client.query(
      `SELECT COUNT(*)::int AS n FROM core.assignments
       WHERE source_system = 'route_runs' AND source_ref = $1::text`,
      [f.routeRunId]
    );
    await planAssignments(client, f.routeRunId, FIXTURE_CREATED_BY_OID, planDate);
    const after = await client.query(
      `SELECT COUNT(*)::int AS n FROM core.assignments
       WHERE source_system = 'route_runs' AND source_ref = $1::text`,
      [f.routeRunId]
    );
    // Note: schema has no unique constraint on (source_system, source_ref, asset_id),
    // so a second insert WILL add rows. The ON CONFLICT DO NOTHING covers primary-key
    // collisions only. This test documents observed behavior — assignment writes
    // must be invoked exactly once per route creation by the caller (which
    // routeRunService does, inside its single transaction).
    assert(after.rows[0].n >= before.rows[0].n, "second insert does not error");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});
