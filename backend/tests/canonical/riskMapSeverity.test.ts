import {
  pool,
  test,
  assert,
  assertEqual,
  FIXTURE_ACTOR_OID,
  FIXTURE_ORG_ID,
  FIXTURE_LOCATION_ID,
  FIXTURE_ASSET_ID,
  FIXTURE_STOP_ID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";
import { emitObservationsForStop, StopUiPayload } from "../../src/domains/observation/observationService";
import { rebuildStopRiskSnapshot } from "../../src/intelligence/riskMapService";

// ============================================================================
// CANON-NORM-3 — riskMapService reads REAL norm_severity magnitude.
//
// Proves the READER repoint: the hazard CTE now reads severity from the
// normalized read seam (core.v_observation_normalized.norm_severity) as an
// OPAQUE magnitude instead of synthesizing a flat 1.0. The two guarantees the
// card pins:
//   1. Real magnitude flows into safety_score — a high (norm_severity=3) hazard
//      scores proportionally higher than the presence floor, instead of every
//      hazard being a flat 1.0.
//   2. NULL handling — a present hazard with NULL norm_severity STILL COUNTS as
//      a hazard (presence floor = the multiplicative identity 1); it is never
//      silently zeroed or dropped.
//
// Phase guard: this test asserts no severity scale or weight. It asserts the
// RATIO (magnitude 3 -> 3x the presence floor), which is encoding-independent:
// HAZARD_BASE_WEIGHT and the recency decay are identical between the two
// rebuilds, so the ratio isolates exactly the magnitude the column carried.
// The fixture stop 31150 is base-eligible (pool_id set, has_trash), and asset 2
// -> location 1 -> external_id '31150', so a hazard on it lands in the snapshot.
// ============================================================================

async function setupVisit(client: any, routeRunStopId: number): Promise<number> {
  return await ensureVisitForRouteRunStop(client, {
    routeRunStopId,
    actorOid: FIXTURE_ACTOR_OID,
    visitType: "service",
  });
}

async function readSnapshot(client: any, stopId: string) {
  const res = await client.query(
    `SELECT last_hazard_severity, safety_score
       FROM stop_risk_snapshot
      WHERE stop_id = $1`,
    [stopId]
  );
  return res.rows[0];
}

test("riskMap CANON-NORM-3: safety_score reads the REAL norm_severity magnitude, and a NULL-magnitude hazard still counts", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);

    // Seed an in-window hazard carrying a REAL high magnitude. The CANON-NORM-2
    // write chain threads "high" -> norm_severity = 3 (the same number the adapter
    // stores); observed_at defaults to now() so it is inside HAZARD_WINDOW_DAYS.
    const uiPayload: StopUiPayload = {
      safetyConcern: true,
      safetyHazards: ["biohazard"],
      hazard_severity: "high",
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

    const seeded = await client.query(
      `SELECT norm_severity FROM core.observations
        WHERE visit_id = $1 AND observation_type = 'biohazard_present'`,
      [visitId]
    );
    assertEqual(seeded.rows[0].norm_severity, 3, "precondition: seeded hazard has norm_severity = 3");

    // --- Rebuild with the REAL magnitude present ---
    await rebuildStopRiskSnapshot(pool, FIXTURE_ORG_ID);
    const hi = await readSnapshot(client, FIXTURE_STOP_ID);
    assert(hi != null, "base-eligible stop appears in the snapshot");
    assertEqual(
      Number(hi.last_hazard_severity),
      3,
      "last_hazard_severity reads the REAL magnitude 3 (was a synthesized 1.0 before CANON-NORM-3)"
    );
    const hiScore = Number(hi.safety_score);
    assert(hiScore > 0, "safety_score is non-zero for a present hazard");

    // --- Drop the magnitude to NULL (hazard present, no recorded severity) ---
    await client.query(
      `UPDATE core.observations SET norm_severity = NULL
        WHERE visit_id = $1 AND observation_type = 'biohazard_present'`,
      [visitId]
    );
    await rebuildStopRiskSnapshot(pool, FIXTURE_ORG_ID);
    const nul = await readSnapshot(client, FIXTURE_STOP_ID);
    assert(nul != null, "stop still in the snapshot with a NULL-magnitude hazard");
    assertEqual(
      Number(nul.last_hazard_severity),
      1,
      "NULL norm_severity floors to the multiplicative identity 1 (presence, no magnitude multiplier)"
    );
    const nulScore = Number(nul.safety_score);
    assert(
      nulScore > 0,
      "a NULL-magnitude hazard STILL COUNTS as a hazard (safety_score > 0 — not zeroed, not dropped)"
    );

    // The magnitude actually scales the score. Same hazard, same recency: the only
    // difference between the two rebuilds is the magnitude (3 vs the presence floor),
    // so the ratio is exactly 3. This is the whole repoint — the score reflects real
    // magnitude instead of a flat 1.0.
    assert(hiScore > nulScore, "magnitude-3 hazard scores higher than a presence-floor hazard");
    assertEqual(hiScore, 3 * nulScore, "safety_score scales linearly with the real magnitude (3x the presence floor)");
  } finally {
    await releaseFixture(client, f);
  }
});
