import {
  test,
  assert,
  assertEqual,
  FIXTURE_ACTOR_OID,
  FIXTURE_ORG_ID,
  FIXTURE_LOCATION_ID,
  FIXTURE_ASSET_ID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";
import { emitSpotCheckObservation } from "../../src/domains/observation/observationService";

// ============================================================================
// ISSUE-066 — the spot check is a GRADED stop-level positive anchor.
//
// §3.5: a spot check is a condition row asserting "assessed, no work needed" —
// the anchor that makes component-level silence on a completed visit readable
// as benign (§4.4). Before ISSUE-066 it landed norm_status = NULL (registry
// ok_rule NULL + payload '{}'), so the anchor carried no grade. This test
// proves the REAL chain (emitSpotCheckObservation -> normalizeObservation
// against the LIVE registry row) now writes the §3.5 target shape:
//   payload     = {"scope":"stop","result":"no_work_needed"}
//   obs_kind    = 'condition'
//   norm_status = 'ok'
// ============================================================================

test("ISSUE-066: spot check writes §3.5 payload and grades norm_status = 'ok'", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    await emitSpotCheckObservation({
      client,
      visitId,
      orgId: FIXTURE_ORG_ID,
      locationId: FIXTURE_LOCATION_ID,
      assetId: FIXTURE_ASSET_ID,
      actorOid: FIXTURE_ACTOR_OID,
    });

    const res = await client.query(
      `SELECT obs_kind, norm_status, norm_severity, intervention, type_id, payload
         FROM core.observations
        WHERE visit_id = $1 AND observation_type = 'spot_check'`,
      [visitId]
    );
    assertEqual(res.rows.length, 1, "exactly one spot_check row written");
    const row = res.rows[0];

    assertEqual(row.obs_kind, "condition", "spot check is kind=condition (§3.5 — NOT presence)");
    assertEqual(row.norm_status, "ok", "norm_status graded 'ok' by the live registry ok_rule");
    assertEqual(row.payload.scope, "stop", "payload.scope = 'stop' (§3.5 target shape)");
    assertEqual(row.payload.result, "no_work_needed", "payload.result = 'no_work_needed'");
    assertEqual(row.norm_severity, null, "no severity on a positive anchor");
    assertEqual(row.intervention, null, "a spot check is not an intervention (§3.5)");
    assert(row.type_id != null, "type_id FK resolved from the registry");
  } finally {
    await releaseFixture(client, f);
  }
});
