import {
  pool,
  test,
  assert,
  assertEqual,
  FIXTURE_ORG_ID,
  FIXTURE_STOP_ID,
  FIXTURE_ASSET_ID,
} from "../setup";
import { loadRouteRunById } from "../../src/domains/routeRun/loaders/loadRouteRunById";

// Cross-tenant fail-closed proof for loadRouteRunById.
//
// Scenario:
//   Org A = FIXTURE_ORG_ID (1, KCM — the dev fixture org).
//   Org B = a synthetic second org created for the test.
//   A route_run is inserted under org B, with one route_run_stop also in org B.
//
// Expectations:
//   loadRouteRunById(orgBRouteRunId, FIXTURE_ORG_ID) -> null    (fail-closed)
//   loadRouteRunById(orgBRouteRunId, orgBId)         -> non-null and matches
//
// Why this matters:
//   route_runs has the Phase 2 "unset = bypass" RLS policy; before this fix,
//   loadRouteRunById ran on a bare pool connection (app.current_org_id unset)
//   and would have returned org B's row to a caller in org A. After the fix,
//   the loader runs inside withOrgContext(orgId) and RLS scopes the read to
//   the caller's org. A cross-tenant request returns null, not a leak.

const TEST_SLUG_PREFIX = "test-load-rr-orgb";

async function createOrgB(): Promise<number> {
  // Unique slug + tenant_uuid per test run to avoid collisions in repeated runs.
  const tag = `${TEST_SLUG_PREFIX}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  // ISSUE-057: other tests seed organizations with EXPLICIT ids (98/99, 44, 7)
  // which never advance the sequence — a nextval-based insert can collide, and
  // healing the sequence needs an UPDATE privilege the app role rightly lacks.
  // Use an explicit clock-derived id instead (unique per run, no sequence).
  const explicitId = String(Date.now());
  const res = await pool.query<{ id: number }>(
    `INSERT INTO organizations (id, name, slug, tenant_uuid)
     VALUES ($2, $1, $1, $3)
     RETURNING id`,
    [tag, explicitId, tag],
  );
  return Number(res.rows[0].id);
}

async function deleteOrgB(orgId: number): Promise<void> {
  await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
}

async function createOrgBRouteRunFixture(orgBId: number): Promise<{
  routeRunId: number;
  stopId: string;
}> {
  // Unique per-run stop_id so re-running the test does not collide with
  // any prior fixture left over from a crashed run.
  const stopId = `test-orgb-stop-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const client = await pool.connect();
  try {
    // ISSUE-057 (bucket B): this fixture was written against the pre-MT-2
    // fail-OPEN policies ("unset = bypass"). RLS is now fail-CLOSED — the
    // writes must run WITH org B's context set, exactly as an org-B session
    // would. The org_id column values below stay explicit and must agree with
    // the session context (WITH CHECK enforces it).
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(orgBId)]);

    // Seed a transit_stops row in org B so the loader's
    //   JOIN stops s ON s.stop_id = rrs.stop_id
    // can find a row when scoped to org B's RLS context.
    await client.query(
      `INSERT INTO transit_stops (stop_id, org_id, is_hotspot, compactor, has_trash)
       VALUES ($1, $2, false, false, false)`,
      [stopId, orgBId],
    );

    // route_pool_id intentionally omitted: a trigger enforces
    // route_runs.org_id == route_pools.org_id, and we do not want to seed a
    // synthetic pool in org B for this test. The loader does not require a
    // pool to be present.
    const runRes = await client.query<{ id: number }>(
      `INSERT INTO route_runs (run_date, status, org_id)
       VALUES (CURRENT_DATE, 'planned', $1)
       RETURNING id`,
      [orgBId],
    );
    const routeRunId = Number(runRes.rows[0].id);

    await client.query(
      `INSERT INTO route_run_stops (route_run_id, stop_id, asset_id, sequence, org_id)
       VALUES ($1, $2, $3, 0, $4)`,
      [routeRunId, stopId, FIXTURE_ASSET_ID, orgBId],
    );

    return { routeRunId, stopId };
  } finally {
    // Clear any session-leaked GUC just in case.
    try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort */ }
    client.release();
  }
}

async function cleanupOrgBRouteRun(orgBId: number, routeRunId: number, stopId: string): Promise<void> {
  // route_runs CASCADEs to route_run_stops; transit_stops must be cleaned
  // up explicitly. Stop deletion follows route_run_stops removal because
  // of the FK. Fail-closed RLS: deletes need org B's context too.
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(orgBId)]);
    await client.query(`DELETE FROM route_runs WHERE id = $1`, [routeRunId]);
    await client.query(`DELETE FROM transit_stops WHERE stop_id = $1`, [stopId]);
  } finally {
    try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort */ }
    client.release();
  }
}

test("loadRouteRunById: cross-tenant request returns null (fail-closed)", async () => {
  const orgBId = await createOrgB();
  let routeRunId: number | null = null;
  let stopId: string | null = null;
  try {
    ({ routeRunId, stopId } = await createOrgBRouteRunFixture(orgBId));

    // Caller is org A (FIXTURE_ORG_ID). Target row belongs to org B. RLS on
    // route_runs (and on the identity_directory JOIN) must filter it out.
    const crossTenant = await loadRouteRunById(routeRunId, FIXTURE_ORG_ID);
    assertEqual(crossTenant, null, "cross-tenant load must return null, not the foreign row");

    // Sanity: caller in org B can see its own row. Returns non-null and id matches.
    const sameTenant = await loadRouteRunById(routeRunId, orgBId);
    assert(sameTenant !== null, "same-tenant load must return the row");
    assertEqual(Number(sameTenant!.id), routeRunId, "same-tenant load returns the correct route_run id");

    // D5 guardrail tripwire (ISSUE-031): the live route-detail payload must not
    // carry per-stop service timing. Per-stop completed_at (or any actual
    // per-stop duration) on a single-assignee route re-identifies the worker by
    // adjacency — the schema-layer non-attribution guarantee defeated at the
    // presentation layer. planned_* (OSRM estimates) and run-level aggregates
    // are sanctioned; deep-scan every stop row for the forbidden keys.
    const forbiddenStopKeys = ["completed_at", "started_at", "ended_at", "duration_s", "service_time_s"];
    for (const stop of (sameTenant as any).stops) {
      for (const key of forbiddenStopKeys) {
        assert(
          !(key in stop),
          `D5 guardrail: per-stop '${key}' must not appear in the live route-detail payload (found on stop ${stop.stop_id})`
        );
      }
    }
  } finally {
    if (routeRunId !== null && stopId !== null) {
      await cleanupOrgBRouteRun(orgBId, routeRunId, stopId);
    }
    await deleteOrgB(orgBId);
  }
});

// ISSUE-035 item 4 — the route-detail spot-check events/photoKeys now source
// from core.evidence (bridged by client_visit_id), NOT the frozen
// public.stop_photos adapter. This was the last live public.stop_photos reader
// gating the Stage-3 DROP (ISSUE-037); its sibling was ISSUE-036.
import {
  acquireRouteRunFixture,
  releaseFixture,
  FIXTURE_LOCATION_ID,
  FIXTURE_ACTOR_OID,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";

test("ISSUE-035: loadRouteRunById surfaces spot-check photoKeys from core.evidence (not stop_photos)", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    // A spot_check observation + a completion evidence row on the SAME visit —
    // core.evidence is the new source; public.stop_photos gets nothing.
    await client.query(
      `INSERT INTO core.observations
         (org_id, visit_id, location_id, asset_id, observation_type, obs_kind, payload, observed_at)
       VALUES ($1, $2, $3, $4, 'spot_check', 'action', '{}'::jsonb, NOW())`,
      [FIXTURE_ORG_ID, visitId, FIXTURE_LOCATION_ID, FIXTURE_ASSET_ID],
    );
    await client.query(
      `INSERT INTO core.evidence (org_id, visit_id, observation_id, kind, storage_key)
       VALUES ($1, $2, NULL, 'completion', $3)`,
      [FIXTURE_ORG_ID, visitId, "test/issue035-spotcheck-evidence.png"],
    );

    const run: any = await loadRouteRunById(f.routeRunId, FIXTURE_ORG_ID);
    assert(run !== null, "run loads");
    const stop = run.stops.find((s: any) => String(s.route_run_stop_id) === String(f.routeRunStopId));
    assert(stop, "seeded stop present in payload");
    const spot = (stop.events || []).find((e: any) => e.type === "spot_check");
    assert(spot, "spot_check event surfaced");
    assert(
      spot.photoKeys.includes("test/issue035-spotcheck-evidence.png"),
      "photoKeys sourced from core.evidence.storage_key (repointed off stop_photos)",
    );
  } finally {
    await releaseFixture(client, f);
  }
});
