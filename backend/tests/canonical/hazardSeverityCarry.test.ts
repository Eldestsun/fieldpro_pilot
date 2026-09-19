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

// ============================================================================
// CB-SEVERITY-CAPTURE (2026-09-18) — per-hazard severity grain.
//
// The capture surface now asks a magnitude PER HAZARD (hazard_severities map);
// each hazard observation in one report carries its own number. The old
// report-level hazard_severity survives only as a fallback for legacy clients
// and queued offline replays created before the change.
// ============================================================================

test("per-hazard severity: each hazard in one report carries its own magnitude; unrated hazard stays NULL", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);

    const uiPayload: StopUiPayload = {
      safetyConcern: true,
      safetyHazards: ["fire", "biohazard", "encampment"],
      hazard_severities: { fire: "high", biohazard: "low" },
      // encampment deliberately unrated — worker skipped its picker
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

    const fire = await readPresence(client, visitId, "fire_present");
    assertEqual(fire.norm_severity, 3, "fire carries its own magnitude (high -> 3)");
    assertEqual(fire.severity, "high", "fire legacy text column = 'high'");

    const bio = await readPresence(client, visitId, "biohazard_present");
    assertEqual(bio.norm_severity, 1, "biohazard carries its own magnitude (low -> 1)");
    assertEqual(bio.severity, "low", "biohazard legacy text column = 'low'");

    const camp = await readPresence(client, visitId, "encampment_present");
    assertEqual(camp.norm_severity, null, "unrated hazard stays NULL — no magnitude manufactured (§4.4)");
    assert(camp.payload.severity === undefined, "no severity threaded into unrated hazard's payload");
    assertEqual(camp.severity, null, "unrated hazard's legacy text column stays NULL");
  } finally {
    await releaseFixture(client, f);
  }
});

test("per-hazard severity: report-level hazard_severity is the fallback ONLY for hazards without a per-hazard entry", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);

    const uiPayload: StopUiPayload = {
      safetyConcern: true,
      safetyHazards: ["fire", "biohazard"],
      hazard_severities: { fire: "low" },
      hazard_severity: "high", // legacy report-level — must NOT override fire's own entry
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

    const fire = await readPresence(client, visitId, "fire_present");
    assertEqual(fire.norm_severity, 1, "per-hazard entry wins over the report-level fallback (low -> 1)");

    const bio = await readPresence(client, visitId, "biohazard_present");
    assertEqual(bio.norm_severity, 3, "hazard without a per-hazard entry falls back to report-level (high -> 3)");
  } finally {
    await releaseFixture(client, f);
  }
});
