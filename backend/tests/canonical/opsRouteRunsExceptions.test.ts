import type { AddressInfo } from "net";
import type { Server } from "http";
import type { PoolClient } from "pg";
process.env.DEV_AUTH_BYPASS = "true";

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
import { emitObservationsForStop } from "../../src/domains/observation/observationService";

// ============================================================================
// SEAM-A A2 — /ops/route-runs returns per-RUN exception counts: hazard_count
// (canonical SAFETY presence via the SEAM-C spine), skipped_count (status='skipped'),
// emergency_count (origin_type <> 'planned', displayed "unplanned"). Attach to the run,
// never a worker. Absence ⇒ 0 (no manufactured state). No identity in the payload.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);

async function planAssignment(client: PoolClient, routeRunId: number): Promise<void> {
  await client.query(
    `INSERT INTO core.assignments
       (org_id, assignment_type, status, location_id, primary_asset_id,
        planned_for_date, source_system, source_ref, meta)
     SELECT a.org_id, 'transit_stop_clean', 'planned', loc.location_id,
            s.asset_id, CURRENT_DATE, 'route_runs', $1::text, '{}'::jsonb
     FROM route_run_stops rrs
     JOIN public.stops s ON s.stop_id = rrs.stop_id
     JOIN public.assets a ON a.id = rrs.asset_id
     LEFT JOIN core.v_locations_transit loc ON loc.stop_id = rrs.stop_id
     WHERE rrs.route_run_id = $1::bigint ON CONFLICT DO NOTHING`,
    [routeRunId],
  );
}

async function runRow(baseUrl: string, runId: number): Promise<any> {
  const res = await fetch(`${baseUrl}/api/ops/route-runs?page=1&pageSize=200`, {
    headers: {
      "X-Dev-User-Oid": "seam-a-a2-suite-dispatch",
      "X-Dev-User-Roles": "Dispatch",
      "X-Dev-User-Org-Id": ORG,
    },
  });
  assertEqual(res.status, 200, "/ops/route-runs returns 200 for Dispatch");
  const body = await res.json();
  const row = body.route_runs.find((r: any) => Number(r.id) === Number(runId));
  assert(row != null, `run ${runId} present in /ops/route-runs`);
  return row;
}

test("SEAM-A A2: per-run exception counts — absence⇒0, then seeded hazard/skip/unplanned⇒1, no identity", async () => {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const { client, f } = await acquireRouteRunFixture();
  try {
    // ── Absence: a fresh run has no exceptions — counts are explicit 0 (no manufactured state).
    const before = await runRow(baseUrl, f.routeRunId);
    assertEqual(before.hazard_count, 0, "hazard_count 0 by absence");
    assertEqual(before.skipped_count, 0, "skipped_count 0 by absence");
    assertEqual(before.emergency_count, 0, "emergency_count (unplanned) 0 by absence");

    // No identity fields in the list payload.
    for (const k of ["user_id", "assigned_user_oid", "created_by_oid", "display_name", "email"]) {
      assert(!(k in before), `list row must not carry identity field "${k}"`);
    }

    // ── Seed: one SAFETY presence on the run's visit; mark the stop skipped + unplanned.
    await planAssignment(client, f.routeRunId);
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload: { safetyConcern: true, safetyHazards: ["encampment"] },
      client,
    });
    await client.query(
      `UPDATE route_run_stops SET status = 'skipped', origin_type = 'emergency' WHERE id = $1`,
      [f.routeRunStopId],
    );

    const after = await runRow(baseUrl, f.routeRunId);
    assertEqual(after.hazard_count, 1, "hazard_count counts the SAFETY presence on this run's visit");
    assertEqual(after.skipped_count, 1, "skipped_count counts the skipped stop");
    assertEqual(after.emergency_count, 1, "emergency_count counts the unplanned-origin stop");
  } finally {
    await releaseFixture(client, f);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
