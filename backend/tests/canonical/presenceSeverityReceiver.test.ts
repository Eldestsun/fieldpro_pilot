import {
  pool,
  test,
  assert,
  assertEqual,
  createRouteRunFixture,
  cleanupFixture,
  FIXTURE_ACTOR_OID,
  FIXTURE_ORG_ID,
  FIXTURE_LOCATION_ID,
  FIXTURE_ASSET_ID,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";
import { loadRegistryRules, normalizeObservation } from "../../src/domains/observation/observationNormalizer";

// ============================================================================
// CANON-NORM-1 — presence-type severity RECEIVER (the PIPE).
//
// Proves the migration 20260617_canon_norm_p1_presence_severity_passthrough.sql
// opens the passthrough: a presence observation whose payload carries a numeric
// `severity` field has that magnitude carried into core.observations.norm_severity
// by the EXISTING write-time normalizer, with NO normalizer code change. A
// presence payload WITHOUT a severity field still normalizes to NULL (no error).
//
// This exercises the real chain: live registry rule (loadRegistryRules) ->
// real normalizer (normalizeObservation/evaluateSeverityMap) -> the actual
// core.observations.norm_severity column (INSERT + read-back). It does NOT
// author any severity value or assert a scale — it asserts only that a synthetic
// magnitude flows through unchanged.
// ============================================================================

const PRESENCE_KEY = "graffiti_present"; // any obs_kind='presence' type

async function setupVisit(client: any, routeRunStopId: number): Promise<number> {
  return await ensureVisitForRouteRunStop(client, {
    routeRunStopId,
    actorOid: FIXTURE_ACTOR_OID,
    visitType: "service",
  });
}

test("presence severity receiver: registry rule carries the {field:severity} passthrough", async () => {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(FIXTURE_ORG_ID)]);
    const rules = await loadRegistryRules(client, FIXTURE_ORG_ID, [PRESENCE_KEY]);
    const rule = rules.get(PRESENCE_KEY);
    assert(rule != null, `registry rule exists for ${PRESENCE_KEY}`);
    assertEqual(rule!.obs_kind, "presence", "type is presence kind");
    assertEqual(
      JSON.stringify(rule!.severity_map),
      JSON.stringify({ field: "severity" }),
      "severity_map is the {field:severity} passthrough"
    );
    // Presence rows carry NO ok_rule — existence is the signal, never graded.
    assertEqual(rule!.ok_rule, null, "ok_rule stays NULL on presence");
  } finally {
    client.release();
  }
});

test("presence severity receiver: payload WITH severity:3 -> norm_severity = 3 lands in core.observations", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);

    // Inject a synthetic presence payload carrying a magnitude (what the P2
    // picker UI will eventually emit). Normalize via the real normalizer using
    // the live registry rule, then INSERT exactly as insertObservations does.
    const rules = await loadRegistryRules(client, FIXTURE_ORG_ID, [PRESENCE_KEY]);
    const payload = { severity: 3 };
    const norm = normalizeObservation(rules.get(PRESENCE_KEY), PRESENCE_KEY, payload);
    assertEqual(norm.norm_severity, 3, "normalizer carries payload.severity into norm_severity");
    assertEqual(norm.obs_kind, "presence", "obs_kind = presence");
    assertEqual(norm.norm_status, null, "norm_status stays NULL (presence is not graded)");

    const ins = await client.query(
      `INSERT INTO core.observations
         (org_id, visit_id, location_id, asset_id, observation_type, payload,
          obs_kind, norm_status, norm_severity, intervention, type_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        FIXTURE_ORG_ID,
        visitId,
        FIXTURE_LOCATION_ID,
        FIXTURE_ASSET_ID,
        PRESENCE_KEY,
        payload,
        norm.obs_kind,
        norm.norm_status,
        norm.norm_severity,
        norm.intervention,
        norm.type_id,
      ]
    );

    const read = await client.query(
      `SELECT norm_severity FROM core.observations WHERE id = $1`,
      [ins.rows[0].id]
    );
    assertEqual(read.rows[0].norm_severity, 3, "norm_severity = 3 persisted in core.observations");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});

test("presence severity receiver: payload WITHOUT severity -> norm_severity IS NULL (not an error)", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client);
  try {
    const visitId = await setupVisit(client, f.routeRunStopId);

    const rules = await loadRegistryRules(client, FIXTURE_ORG_ID, [PRESENCE_KEY]);
    const payload = {}; // presence row with no magnitude — today's normal case
    const norm = normalizeObservation(rules.get(PRESENCE_KEY), PRESENCE_KEY, payload);
    assertEqual(norm.norm_severity, null, "no severity field -> norm_severity NULL");

    const ins = await client.query(
      `INSERT INTO core.observations
         (org_id, visit_id, location_id, asset_id, observation_type, payload,
          obs_kind, norm_status, norm_severity, intervention, type_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        FIXTURE_ORG_ID,
        visitId,
        FIXTURE_LOCATION_ID,
        FIXTURE_ASSET_ID,
        PRESENCE_KEY,
        payload,
        norm.obs_kind,
        norm.norm_status,
        norm.norm_severity,
        norm.intervention,
        norm.type_id,
      ]
    );

    const read = await client.query(
      `SELECT norm_severity FROM core.observations WHERE id = $1`,
      [ins.rows[0].id]
    );
    assertEqual(read.rows[0].norm_severity, null, "norm_severity IS NULL persisted (no error)");
  } finally {
    await cleanupFixture(client, f);
    client.release();
  }
});
