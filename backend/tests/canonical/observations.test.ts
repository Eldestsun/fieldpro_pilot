import {
  pool,
  test,
  assert,
  assertEqual,
  deriveClientVisitIdLocal,
  FIXTURE_ACTOR_OID,
  FIXTURE_ORG_ID,
  FIXTURE_LOCATION_ID,
  FIXTURE_ASSET_ID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";
import { emitObservationsForStop, emitSpotCheckObservation } from "../../src/domains/observation/observationService";
import { decrypt } from "../../src/lib/oidCipher";

// Tier 1 — Observation done-criteria

async function setupVisit(client: any, routeRunStopId: number): Promise<number> {
  return await ensureVisitForRouteRunStop(client, {
    routeRunStopId,
    actorOid: FIXTURE_ACTOR_OID,
    visitType: "service",
  });
}

test("observations: submit phase writes washed_can=true observation (action row, empty payload)", async () => {
  const { client, f } = await acquireRouteRunFixture();
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
    assertEqual(
      Object.keys(rows.rows[0].payload).length,
      0,
      "payload is empty (intervention identified by observation_type)"
    );
  } finally {
    await releaseFixture(client, f);
  }
});

test("observations: submit phase does NOT write washed_can when false (no-manufactured-fact)", async () => {
  const { client, f } = await acquireRouteRunFixture();
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
      `SELECT 1 FROM core.observations
       WHERE visit_id = $1 AND observation_type = 'washed_can'`,
      [visitId]
    );
    assertEqual(
      rows.rowCount,
      0,
      "no washed_can row when the act did not happen (canonical state layer §2 invariant #5)"
    );
  } finally {
    await releaseFixture(client, f);
  }
});

test("observations: submit phase does NOT write washed_can when field is absent", async () => {
  const { client, f } = await acquireRouteRunFixture();
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
    await releaseFixture(client, f);
  }
});

test("observations: write inside the visit transaction (atomic with stop completion)", async () => {
  const { client, f } = await acquireRouteRunFixture();
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
    await releaseFixture(client, f);
  }
});

// ── ISSUE-058: observation identity sidecar encrypted at rest ────────────────

const DECRYPT_REQ = {
  user: { oid: "test-oid-cipher-suite", tid: "00000000-0000-0000-0000-000000000099" },
};

test("observations (ISSUE-058): main insert writes sentinel actor_ref + recoverable ciphertext", async () => {
  const { client, f } = await acquireRouteRunFixture();
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

    const aud = await client.query(
      `SELECT oaa.actor_ref, oaa.actor_ref_ciphertext, oaa.actor_ref_key_id
       FROM core.observation_actor_audit oaa
       JOIN core.observations o ON o.id = oaa.observation_id
       WHERE o.visit_id = $1
       LIMIT 1`,
      [visitId]
    );
    assertEqual(aud.rowCount, 1, "observation_actor_audit row exists");
    assertEqual(aud.rows[0].actor_ref, "encrypted", "actor_ref is the sentinel, not the OID");
    assert(aud.rows[0].actor_ref_ciphertext !== null, "actor_ref_ciphertext populated");
    const recovered = await decrypt(
      aud.rows[0].actor_ref_ciphertext,
      aud.rows[0].actor_ref_key_id,
      "test: observation sidecar roundtrip",
      DECRYPT_REQ
    );
    assertEqual(recovered, FIXTURE_ACTOR_OID, "decrypt(ciphertext) recovers the real actor OID");
  } finally {
    await releaseFixture(client, f);
  }
});

test("observations (ISSUE-058): spot-check path writes sentinel actor_ref + recoverable ciphertext", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);
    await emitSpotCheckObservation({
      client,
      visitId,
      orgId: FIXTURE_ORG_ID,
      locationId: FIXTURE_LOCATION_ID,
      assetId: FIXTURE_ASSET_ID,
      actorOid: FIXTURE_ACTOR_OID,
    });

    const aud = await client.query(
      `SELECT oaa.actor_ref, oaa.actor_ref_ciphertext, oaa.actor_ref_key_id
       FROM core.observation_actor_audit oaa
       JOIN core.observations o ON o.id = oaa.observation_id
       WHERE o.visit_id = $1 AND o.observation_type = 'spot_check'
       LIMIT 1`,
      [visitId]
    );
    assertEqual(aud.rowCount, 1, "spot_check observation_actor_audit row exists");
    assertEqual(aud.rows[0].actor_ref, "encrypted", "actor_ref is the sentinel, not the OID");
    assert(aud.rows[0].actor_ref_ciphertext !== null, "actor_ref_ciphertext populated");
    const recovered = await decrypt(
      aud.rows[0].actor_ref_ciphertext,
      aud.rows[0].actor_ref_key_id,
      "test: spot-check sidecar roundtrip",
      DECRYPT_REQ
    );
    assertEqual(recovered, FIXTURE_ACTOR_OID, "decrypt(ciphertext) recovers the real actor OID");
  } finally {
    await releaseFixture(client, f);
  }
});
