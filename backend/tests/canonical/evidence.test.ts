import {
  pool,
  test,
  assert,
  assertEqual,
  createRouteRunFixture,
  cleanupFixture,
  deriveClientVisitIdLocal,
  FIXTURE_ACTOR_OID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";
import { createStopPhotos } from "../../src/domains/routeRunStop/stopPhotosService";

// Tier 1 — Evidence done-criteria

test("evidence: createStopPhotos writes one core.evidence row per photo", async () => {
  const { client, f } = await acquireRouteRunFixture();
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
    await releaseFixture(client, f);
  }
});

test("evidence (ISSUE-031 Stage 2): createStopPhotos no longer writes the stop_photos mirror, but the OID still lands in the grant-walled sidecar", async () => {
  // The public.stop_photos mirror INSERT was clipped. A photo capture must now
  // write ONLY canonical: zero stop_photos rows, one core.evidence row, and the
  // capture OID into core.evidence_actor_audit (never the adapter column).
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    const key = `tests/canonical/${f.routeRunStopId}-c.jpg`;
    await createStopPhotos(client, {
      routeRunStopId: f.routeRunStopId,
      userOid: FIXTURE_ACTOR_OID,
      s3Keys: [key],
      kind: "completion",
    });

    const sp = await client.query(
      `SELECT id FROM stop_photos WHERE route_run_stop_id = $1`,
      [f.routeRunStopId]
    );
    assertEqual(sp.rowCount, 0, "stop_photos mirror NOT written (clipped)");

    const ev = await client.query(
      `SELECT id FROM core.evidence WHERE visit_id = $1 AND storage_key = $2`,
      [visitId, key]
    );
    assertEqual(ev.rowCount, 1, "canonical core.evidence row written");

    const aud = await client.query(
      `SELECT actor_ref FROM core.evidence_actor_audit WHERE evidence_id = $1`,
      [ev.rows[0].id]
    );
    assertEqual(aud.rowCount, 1, "capture OID written to the grant-walled sidecar");
    assertEqual(
      aud.rows[0].actor_ref,
      FIXTURE_ACTOR_OID,
      "sidecar carries the real capture OID"
    );
  } finally {
    await releaseFixture(client, f);
  }
});

test("evidence: createStopPhotos does NOT create a visit row when called before stop-start", async () => {
  const { client, f } = await acquireRouteRunFixture();
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

    // And the evidence write is skipped (logged warning), not errored.
    const ev = await client.query(
      `SELECT id FROM core.evidence
       WHERE storage_key = $1`,
      [`tests/canonical/${f.routeRunStopId}-pre.jpg`]
    );
    assertEqual(ev.rowCount, 0, "evidence skipped when no visit exists");
  } finally {
    await releaseFixture(client, f);
  }
});

// Q-D (ISSUE-031 §3) — the evidence write path is one transaction.

test("evidence (Q-D): pool-handed path commits evidence + sidecar atomically (no stop_photos mirror)", async () => {
  // Passing the bare pool (the production /photos route path) exercises the
  // BEGIN/COMMIT ownership branch. Post-Stage-2 clip, the two canonical tables
  // (core.evidence + the sidecar) must land together; the stop_photos mirror is
  // no longer written.
  const { client: setup, f } = await acquireRouteRunFixture();
  try {
    await ensureVisitForRouteRunStop(setup, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
  } finally {
    setup.release(); // release before handing the pool so the tx gets its own conn
  }
  try {
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
      assertEqual(sp.rowCount, 0, "stop_photos mirror NOT written (clipped)");

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
  // Inject a failure on the 2nd key's core.evidence insert. The 1st key's
  // evidence and sidecar rows are written inside the transaction but uncommitted;
  // a labor-safe-by-structure system must not leave any of them — least of all an
  // orphan identity-audit row — once the unit fails. (Pre-Stage-2 this injected on
  // the stop_photos mirror insert, which no longer exists; the evidence insert is
  // now the first canonical write per key.)
  // Same acquire-guard shape as acquireRouteRunFixture: this setup block ran
  // with NO try at all, so a fixture/visit throw stranded the `setup` client.
  const { client: setup, f } = await acquireRouteRunFixture();
  try {
    await ensureVisitForRouteRunStop(setup, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
  } finally {
    setup.release();
  }

  const key1 = `tests/canonical/${f.routeRunStopId}-qd-rollback-1.jpg`;
  const key2 = `tests/canonical/${f.routeRunStopId}-qd-rollback-2.jpg`;

  // A fake "pool": no .release() method → createStopPhotos owns the transaction.
  // Its checked-out client throws on the 2nd core.evidence INSERT. The
  // "core.evidence (" match (open paren) excludes the sidecar insert into
  // core.evidence_actor_audit, which shares the "core.evidence" prefix.
  const realClient = await pool.connect();
  let evidenceInserts = 0;
  const fakePool = {
    connect: async () => ({
      query: (text: any, params?: any) => {
        if (typeof text === "string" && text.includes("INSERT INTO core.evidence (")) {
          evidenceInserts++;
          if (evidenceInserts === 2) {
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
    await releaseFixture(verify, f);
  }
});

test("evidence: empty s3Keys list is a no-op", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    await createStopPhotos(client, {
      routeRunStopId: f.routeRunStopId,
      userOid: FIXTURE_ACTOR_OID,
      s3Keys: [],
    });
    const ev = await client.query(
      `SELECT COUNT(*)::int AS n FROM core.evidence WHERE visit_id = $1`,
      [visitId]
    );
    assertEqual(ev.rows[0].n, 0, "no canonical evidence rows written for empty list");
  } finally {
    await releaseFixture(client, f);
  }
});
