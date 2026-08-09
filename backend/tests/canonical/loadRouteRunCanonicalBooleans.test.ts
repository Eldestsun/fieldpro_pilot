import type { PoolClient } from "pg";
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
import { loadRouteRunById } from "../../src/domains/routeRun/loaders/loadRouteRunById";

// ============================================================================
// SEAM-C ITEM 2 — loadRouteRunById's 5 cleaning booleans derive from canonical
// action observations, not the clipped public.clean_logs adapter.
//
// The pivot resolves each stop's visit via the canonical spine (visit →
// assignment.source_ref = route_run, visit.location → stop_id) and BOOL_ORs
// obs_kind='action' rows. Absence ⇒ false (no manufactured state). This FAILS
// against the old clean_logs LEFT JOIN: completeStop/emit no longer writes
// clean_logs (Stage-2 clip), so the old join yielded all-false for post-clip visits.
// ============================================================================

// Mirror of routeRunService.createRouteRun's assignment write, so the visit gets a
// non-null assignment_id and the canonical spine resolves (post-Tier-5 contract).
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
     WHERE rrs.route_run_id = $1::bigint
     ON CONFLICT DO NOTHING`,
    [routeRunId],
  );
}

function stopOf(run: any, routeRunStopId: number): any {
  const s = run.stops.find((x: any) => Number(x.route_run_stop_id) === Number(routeRunStopId));
  assert(s != null, `stop ${routeRunStopId} present in loadRouteRunById result`);
  return s;
}

test("loadRouteRunById (SEAM-C): cleaning booleans reflect canonical actions; done⇒true, absent⇒false", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    await planAssignment(client, f.routeRunId);
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    // Two of five actions performed via the real write path.
    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload: { picked_up_litter: true, washed_can: true },
      client,
    });

    const run = await loadRouteRunById(f.routeRunId, FIXTURE_ORG_ID);
    assert(run != null, "loadRouteRunById returned the run");
    const stop = stopOf(run, f.routeRunStopId);

    assertEqual(stop.picked_up_litter, true, "picked_up_litter true (canonical action recorded)");
    assertEqual(stop.washed_can, true, "washed_can true (canonical action recorded)");
    // Absence ⇒ explicit false, never null/undefined (no manufactured state).
    assertEqual(stop.emptied_trash, false, "emptied_trash false by absence");
    assertEqual(stop.washed_shelter, false, "washed_shelter false by absence");
    assertEqual(stop.washed_pad, false, "washed_pad false by absence");
  } finally {
    await releaseFixture(client, f);
  }
});

test("loadRouteRunById (SEAM-C): a stop with no visit renders all booleans false (absence = clean)", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    await planAssignment(client, f.routeRunId);
    // No visit, no observations for this stop.
    const run = await loadRouteRunById(f.routeRunId, FIXTURE_ORG_ID);
    assert(run != null, "loadRouteRunById returned the run");
    const stop = stopOf(run, f.routeRunStopId);
    for (const key of ["picked_up_litter", "emptied_trash", "washed_shelter", "washed_pad", "washed_can"]) {
      assertEqual(stop[key], false, `${key} is explicit false (no visit ⇒ no manufactured state)`);
    }
  } finally {
    await releaseFixture(client, f);
  }
});
