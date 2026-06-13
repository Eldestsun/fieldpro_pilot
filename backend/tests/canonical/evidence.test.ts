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

// Q-D (ISSUE-031 §3) — the evidence write path is one transaction.

test("evidence (Q-D): pool-handed path commits stop_photos + evidence + sidecar atomically", async () => {
  // Passing the bare pool (the production /photos route path) exercises the
  // BEGIN/COMMIT ownership branch. All three tables must land together.
  const setup = await pool.connect();
  const f = await createRouteRunFixture(setup);
  try {
    await ensureVisitForRouteRunStop(setup, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    setup.release(); // release before handing the pool so the tx gets its own conn

    const key = `tests/canonical/${f.routeRunStopId}-qd-commit.jpg`;
    await createStopPhotos(pool, {
      routeRunStopId: f.routeRunStopId,
      userOid: FIXTURE_ACTOR_OID,
      s3Keys: [key],
      kind: "completion",
    });

    const verify = await pool.connect();
    try {
      const sp = await verify.query(
        `SELECT id FROM stop_photos WHERE s3_key = $1`,
        [key]
      );
      assertEqual(sp.rowCount, 1, "stop_photos committed via pool path");

      const ev = await verify.query(
        `SELECT id FROM core.evidence WHERE storage_key = $1`,
        [key]
      );
      assertEqual(ev.rowCount, 1, "core.evidence committed via pool path");

      const aud = await verify.query(
        `SELECT evidence_id FROM core.evidence_actor_audit WHERE evidence_id = $1`,
        [ev.rows[0].id]
      );
      assertEqual(aud.rowCount, 1, "identity sidecar committed alongside evidence");
    } finally {
      verify.release();
    }
  } finally {
    const cleanup = await pool.connect();
    try {
      await cleanupFixture(cleanup, f);
    } finally {
      cleanup.release();
    }
  }
});

test("evidence (Q-D): a mid-write failure rolls the whole unit back — no orphan rows", async () => {
  // Inject a failure on the 2nd stop_photos insert. The 1st key's stop_photos,
  // evidence, and sidecar rows are written inside the transaction but uncommitted;
  // a labor-safe-by-structure system must not leave any of them — least of all an
  // orphan identity-audit row — once the unit fails.
  const setup = await pool.connect();
  const f = await createRouteRunFixture(setup);
  await ensureVisitForRouteRunStop(setup, {
    routeRunStopId: f.routeRunStopId,
    actorOid: FIXTURE_ACTOR_OID,
    visitType: "service",
  });
  setup.release();

  const key1 = `tests/canonical/${f.routeRunStopId}-qd-rollback-1.jpg`;
  const key2 = `tests/canonical/${f.routeRunStopId}-qd-rollback-2.jpg`;

  // A fake "pool": no .release() method → createStopPhotos owns the transaction.
  // Its checked-out client throws on the 2nd stop_photos INSERT.
  const realClient = await pool.connect();
  let photoInserts = 0;
  const fakePool = {
    connect: async () => ({
      query: (text: any, params?: any) => {
        if (typeof text === "string" && text.includes("INSERT INTO stop_photos")) {
          photoInserts++;
          if (photoInserts === 2) {
            throw new Error("injected mid-transaction failure");
          }
        }
        return realClient.query(text, params);
      },
      release: () => realClient.release(),
    }),
  };

  let threw = false;
  try {
    await createStopPhotos(fakePool, {
      routeRunStopId: f.routeRunStopId,
      userOid: FIXTURE_ACTOR_OID,
      s3Keys: [key1, key2],
      kind: "completion",
    });
  } catch {
    threw = true;
  }
  assert(threw, "createStopPhotos propagated the injected failure");

  const verify = await pool.connect();
  try {
    const sp = await verify.query(
      `SELECT id FROM stop_photos WHERE s3_key = ANY($1)`,
      [[key1, key2]]
    );
    assertEqual(sp.rowCount, 0, "no stop_photos rows survive the rollback");

    const ev = await verify.query(
      `SELECT id FROM core.evidence WHERE storage_key = ANY($1)`,
      [[key1, key2]]
    );
    assertEqual(ev.rowCount, 0, "no core.evidence rows survive the rollback");

    const aud = await verify.query(
      `SELECT eaa.evidence_id
       FROM core.evidence_actor_audit eaa
       JOIN core.evidence e ON e.id = eaa.evidence_id
       WHERE e.storage_key = ANY($1)`,
      [[key1, key2]]
    );
    assertEqual(aud.rowCount, 0, "no orphan identity-audit rows survive the rollback");
  } finally {
    await cleanupFixture(verify, f);
    verify.release();
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
