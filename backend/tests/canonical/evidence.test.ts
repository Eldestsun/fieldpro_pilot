import {
  pool,
  test,
  assert,
  assertEqual,
  createRouteRunFixture,
  cleanupFixture,
  deriveClientVisitIdLocal,
  FIXTURE_ACTOR_OID,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";
import { createStopPhotos } from "../../src/domains/routeRunStop/stopPhotosService";

// Tier 1 — Evidence done-criteria

test("evidence: createStopPhotos writes one core.evidence row per photo", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    const keys = [
      `tests/canonical/${f.routeRunStopId}-a.jpg`,
      `tests/canonical/${f.routeRunStopId}-b.jpg`,
    ];
    await createStopPhotos(client, {
      routeRunStopId: f.routeRunStopId,
      userOid: FIXTURE_ACTOR_OID,
      s3Keys: keys,
      kind: "completion",
    });

    const ev = await client.query(
      `SELECT id, kind, storage_key FROM core.evidence WHERE visit_id = $1 ORDER BY id`,
      [visitId]
    );
    assertEqual(ev.rowCount, keys.length, "one evidence row per photo");
    for (const r of ev.rows) {
      assertEqual(r.kind, "completion", "evidence kind preserved");
      assert(keys.includes(r.storage_key), `storage_key recorded: ${r.storage_key}`);
    }
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("evidence: createStopPhotos still writes stop_photos rows (no regression)", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    await createStopPhotos(client, {
      routeRunStopId: f.routeRunStopId,
      userOid: FIXTURE_ACTOR_OID,
      s3Keys: [`tests/canonical/${f.routeRunStopId}-c.jpg`],
      kind: "completion",
    });

    const sp = await client.query(
      `SELECT s3_key, kind FROM stop_photos WHERE route_run_stop_id = $1`,
      [f.routeRunStopId]
    );
    assertEqual(sp.rowCount, 1, "stop_photos row created");
    assertEqual(sp.rows[0].kind, "completion", "stop_photos kind preserved");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("evidence: createStopPhotos does NOT create a visit row when called before stop-start", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    // No ensureVisitForRouteRunStop call — simulating photo upload before stop-start.
    await createStopPhotos(client, {
      routeRunStopId: f.routeRunStopId,
      userOid: FIXTURE_ACTOR_OID,
      s3Keys: [`tests/canonical/${f.routeRunStopId}-pre.jpg`],
      kind: "completion",
    });

    const v = await client.query(
      `SELECT id FROM core.visits WHERE client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)]
    );
    assertEqual(v.rowCount, 0, "no visit row created by photo upload");

    // And evidence/stop_photos writes are skipped (logged warning), not errored.
    const ev = await client.query(
      `SELECT id FROM core.evidence
       WHERE storage_key = $1`,
      [`tests/canonical/${f.routeRunStopId}-pre.jpg`]
    );
    assertEqual(ev.rowCount, 0, "evidence skipped when no visit exists");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("evidence: empty s3Keys list is a no-op", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    await createStopPhotos(client, {
      routeRunStopId: f.routeRunStopId,
      userOid: FIXTURE_ACTOR_OID,
      s3Keys: [],
    });
    const sp = await client.query(
      `SELECT COUNT(*)::int AS n FROM stop_photos WHERE route_run_stop_id = $1`,
      [f.routeRunStopId]
    );
    assertEqual(sp.rows[0].n, 0, "no rows written for empty list");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});
