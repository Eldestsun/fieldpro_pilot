import {
  pool,
  test,
  assert,
  assertEqual,
  deriveClientVisitIdLocal,
  FIXTURE_ACTOR_OID,
  FIXTURE_CREATED_BY_OID,
  FIXTURE_ORG_ID,
  FIXTURE_LOCATION_ID,
  FIXTURE_ASSET_ID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import {
  ensureVisitForRouteRunStop,
  closeVisitForRouteRunStop,
  deriveClientVisitId,
} from "../../src/domains/visit/visitService";

// Tier 1 — Visit lifecycle done-criteria

test("visits: ensureVisitForRouteRunStop creates exactly one visit with started_at", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    assert(Number(visitId) > 0, "visit id returned");

    const rows = await client.query(
      `SELECT id, started_at, ended_at, primary_asset_id, location_id, org_id
       FROM core.visits WHERE client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)]
    );
    assertEqual(rows.rowCount, 1, "exactly one visit row");
    assert(rows.rows[0].started_at !== null, "started_at is set");
    assertEqual(rows.rows[0].ended_at, null, "ended_at not yet set");
    assertEqual(Number(rows.rows[0].primary_asset_id), FIXTURE_ASSET_ID, "asset");
    assertEqual(Number(rows.rows[0].location_id), FIXTURE_LOCATION_ID, "location");
    assertEqual(Number(rows.rows[0].org_id), FIXTURE_ORG_ID, "org");
  } finally {
    await releaseFixture(client, f);
  }
});

test("visits: deriveClientVisitId is deterministic (UUIDv5 idempotency contract)", async () => {
  const a = deriveClientVisitId(424242);
  const b = deriveClientVisitId(424242);
  assertEqual(a, b, "same id same uuid");
  const c = deriveClientVisitId(424243);
  assert(a !== c, "different ids → different uuids");
});

test("visits: calling ensureVisitForRouteRunStop twice produces no duplicate", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const id1 = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    const id2 = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    assertEqual(id1, id2, "same visit id");

    const count = await client.query(
      `SELECT COUNT(*)::int AS n FROM core.visits WHERE client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)]
    );
    assertEqual(count.rows[0].n, 1, "no duplicate row");
  } finally {
    await releaseFixture(client, f);
  }
});

test("visits: closeVisitForRouteRunStop writes outcome='completed' on complete", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    const closedId = await closeVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      outcome: "completed",
    });
    assert(closedId !== null, "close returned id");

    const row = await client.query(
      `SELECT outcome, reason_code, ended_at FROM core.visits WHERE client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)]
    );
    assertEqual(row.rows[0].outcome, "completed", "outcome");
    assertEqual(row.rows[0].reason_code, null, "no reason_code on completion");
    assert(row.rows[0].ended_at !== null, "ended_at set");
  } finally {
    await releaseFixture(client, f);
  }
});

test("visits: closeVisitForRouteRunStop writes outcome='skipped' + reason_code on skip", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    await closeVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      outcome: "skipped",
      reasonCode: "violence",
    });

    const row = await client.query(
      `SELECT outcome, reason_code FROM core.visits WHERE client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)]
    );
    assertEqual(row.rows[0].outcome, "skipped", "outcome");
    assertEqual(row.rows[0].reason_code, "violence", "reason_code");
  } finally {
    await releaseFixture(client, f);
  }
});

test("visits: closeVisitForRouteRunStop returns null when no open visit exists", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const result = await closeVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      outcome: "completed",
    });
    assertEqual(result, null, "no visit → null, no error");
  } finally {
    await releaseFixture(client, f);
  }
});

// Avoid unused-import warning under strict.
void FIXTURE_CREATED_BY_OID;
