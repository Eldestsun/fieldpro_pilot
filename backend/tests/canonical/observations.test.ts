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
  FIXTURE_LOCATION_ID,
  FIXTURE_ASSET_ID,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";
import { emitObservationsForStop } from "../../src/domains/observation/observationService";

// Tier 1 — Observation done-criteria

async function setupVisit(client: any, routeRunStopId: number): Promise<number> {
  return await ensureVisitForRouteRunStop(client, {
    routeRunStopId,
    actorOid: FIXTURE_ACTOR_OID,
    visitType: "service",
  });
}

test("observations: submit phase writes washed_can=true observation", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);
    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload: { washed_can: true },
      client,
    });

    const rows = await client.query(
      `SELECT payload FROM core.observations
       WHERE visit_id = $1 AND observation_type = 'washed_can'`,
      [visitId]
    );
    assertEqual(rows.rowCount, 1, "exactly one washed_can observation");
    assertEqual(rows.rows[0].payload.value, true, "payload.value = true");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("observations: submit phase writes washed_can=false observation", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);
    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload: { washed_can: false },
      client,
    });

    const rows = await client.query(
      `SELECT payload FROM core.observations
       WHERE visit_id = $1 AND observation_type = 'washed_can'`,
      [visitId]
    );
    assertEqual(rows.rowCount, 1, "one washed_can row even when false");
    assertEqual(rows.rows[0].payload.value, false, "payload.value = false");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("observations: submit phase does NOT write washed_can when field is absent", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);
    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload: { picked_up_litter: true }, // no washed_can
      client,
    });

    const rows = await client.query(
      `SELECT 1 FROM core.observations
       WHERE visit_id = $1 AND observation_type = 'washed_can'`,
      [visitId]
    );
    assertEqual(rows.rowCount, 0, "no washed_can observation when flag absent");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("observations: arrival phase writes ground_condition (defaults path)", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);
    // No stopId → uses arrivalObservationDefaults, which emits ground_condition=dirty.
    await emitObservationsForStop({
      phase: "arrival",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      client,
    });

    const rows = await client.query(
      `SELECT observation_type FROM core.observations
       WHERE visit_id = $1 AND observation_type = 'ground_condition'`,
      [visitId]
    );
    assert(rows.rowCount! >= 1, "ground_condition observation emitted");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("observations: write inside the visit transaction (atomic with stop completion)", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  let aborted = false;
  try {
    await client.query("BEGIN");
    const visitId = await setupVisit(client, f.routeRunStopId);
    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload: { washed_can: true },
      client,
    });
    await client.query("ROLLBACK");
    aborted = true;

    // After rollback the observation and visit are both gone.
    const obs = await client.query(
      `SELECT 1 FROM core.observations WHERE visit_id = $1`,
      [visitId]
    );
    assertEqual(obs.rowCount, 0, "observation rolled back with visit");
    const v = await client.query(
      `SELECT 1 FROM core.visits WHERE client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)]
    );
    assertEqual(v.rowCount, 0, "visit rolled back");
  } finally {
    if (!aborted) await client.query("ROLLBACK").catch(() => {});
    await cleanupFixture(client, f);
    client.release();
  }
});
