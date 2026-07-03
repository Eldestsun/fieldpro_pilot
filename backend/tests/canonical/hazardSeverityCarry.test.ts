import {
  pool,
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
import { emitObservationsForStop, StopUiPayload } from "../../src/domains/observation/observationService";

// ============================================================================
// CANON-NORM-2 — write-side hazard severity carry.
//
// Proves the WRITE PATH (emitObservationsForStop -> submitObservations ->
// normalizeObservation -> INSERT) threads the worker's hazard severity into
// payload.severity as a NUMBER (via the shared toNumericSeverity scale) so the
// existing §4.2 normalizer carries it into core.observations.norm_severity.
//
// This is the missing half that CANON-NORM-1 (the receiver/pipe) left open: the
// pipe existed, but the write path never put a numeric severity into the payload.
// It exercises the REAL chain end-to-end against the live registry + live DB.
//
// Phase guard: no severity value is authored here. "high" -> 3 is the adapter's
// pre-existing toNumericSeverity scale, the SAME number public.hazards.severity
// stores — a mechanical passthrough, asserted to match the adapter.
// ============================================================================

async function setupVisit(client: any, routeRunStopId: number): Promise<number> {
  return await ensureVisitForRouteRunStop(client, {
    routeRunStopId,
    actorOid: FIXTURE_ACTOR_OID,
    visitType: "service",
  });
}

async function readPresence(client: any, visitId: number, observationType: string) {
  const res = await client.query(
    `SELECT obs_kind, norm_status, norm_severity, payload, severity
       FROM core.observations
      WHERE visit_id = $1 AND observation_type = $2`,
    [visitId, observationType]
  );
  return res.rows[0];
}

test("hazard severity carry: payload severity 'high' -> norm_severity = 3 in core.observations", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);

    const uiPayload: StopUiPayload = {
      safetyConcern: true,
      safetyHazards: ["biohazard"],
      hazard_severity: "high", // adapter scale: high -> 3
      hazard_notes: "needles by bench",
    };

    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload,
      client,
    });

    const row = await readPresence(client, visitId, "biohazard_present");
    assert(row != null, "biohazard_present observation was written");
    assertEqual(row.obs_kind, "presence", "obs_kind = presence");
    // The numeric magnitude is threaded into payload and carried into norm_severity.
    assertEqual(Number(row.payload.severity), 3, "payload.severity = 3 (numeric, threaded by write path)");
    assertEqual(row.norm_severity, 3, "norm_severity = 3 (carried by the §4.2 normalizer)");
    assertEqual(row.norm_status, null, "norm_status stays NULL (presence is never graded)");
    // Legacy text severity column is preserved additively.
    assertEqual(row.severity, "high", "legacy severity text column unchanged ('high')");
  } finally {
    await releaseFixture(client, f);
  }
});

test("hazard severity carry: worker reported NO severity -> norm_severity NULL (no manufactured magnitude)", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);

    const uiPayload: StopUiPayload = {
      safetyConcern: true,
      safetyHazards: ["encampment"],
      // hazard_severity intentionally absent
    };

    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload,
      client,
    });

    const row = await readPresence(client, visitId, "encampment_present");
    assert(row != null, "encampment_present observation was written");
    assertEqual(row.obs_kind, "presence", "obs_kind = presence");
    assert(row.payload.severity === undefined, "no severity threaded into payload when worker gave none");
    assertEqual(row.norm_severity, null, "norm_severity NULL — canonical does not manufacture a magnitude (§4.4)");
  } finally {
    await releaseFixture(client, f);
  }
});

test("hazard severity carry: numeric severity passes through unchanged (3 -> 3)", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);

    const uiPayload: StopUiPayload = {
      safetyConcern: true,
      safetyHazards: ["fire"],
      hazard_severity: 3, // already numeric — toNumericSeverity is a no-op
    };

    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload,
      client,
    });

    const row = await readPresence(client, visitId, "fire_present");
    assertEqual(row.norm_severity, 3, "numeric severity 3 carried into norm_severity unchanged");
  } finally {
    await releaseFixture(client, f);
  }
});
