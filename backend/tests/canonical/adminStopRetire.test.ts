import { test, assert, assertEqual, pool, FIXTURE_ORG_ID } from "../setup";
import { listStops, updateStop } from "../../src/services/adminStopService";
import { getCandidateStopsForPoolWithRisk } from "../../src/domains/routeRun/routeRunService";

// ============================================================================
// T2-A2 — stop retirement (transit_stops.active).
//
// Contract enforced here:
//  - updateStop accepts `active` (and the row-level flags that were silently
//    unhandled before this card — PATCH {is_hotspot} used to fall through to
//    the fields.length===0 null → 404 path).
//  - listStops HIDES retired stops by default; include_retired=true opts in.
//  - The pool-candidate planner query never returns a retired stop, even when
//    its stop_pool_memberships row is still active.
//
// Self-cleaning: a synthetic stop T2A2_RETIRE_X is created per run and
// hard-deleted (with its membership row) in the finally block.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);
const STOP_ID = "T2A2_RETIRE_X";
const POOL_ID = "TEST_POOL";

async function withOrgClient<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    return await fn(client);
  } finally {
    await client.query(`SELECT set_config('app.current_org_id', '', false)`).catch(() => {});
    client.release();
  }
}

async function createFixtureStop(client: any): Promise<void> {
  await client.query(
    `INSERT INTO public.transit_stops
       (stop_id, on_street_name, intersection_loc, lon, lat, active, org_id)
     VALUES ($1, 'T2A2 Test St', 'Far side', -122.30, 47.61, true, $2)
     ON CONFLICT (stop_id) DO UPDATE SET active = true`,
    [STOP_ID, FIXTURE_ORG_ID],
  );
  await client.query(
    `INSERT INTO public.stop_pool_memberships (stop_id, pool_id, org_id, active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (stop_id, pool_id) DO UPDATE SET active = true`,
    [STOP_ID, POOL_ID, FIXTURE_ORG_ID],
  );
}

async function cleanupFixtureStop(client: any): Promise<void> {
  await client.query(`DELETE FROM public.stop_pool_memberships WHERE stop_id = $1`, [STOP_ID]);
  await client.query(`DELETE FROM public.transit_stops WHERE stop_id = $1`, [STOP_ID]);
}

test("T2-A2: updateStop accepts active; retire hides from default list, include_retired reveals", async () => {
  await withOrgClient(async (client) => {
    try {
      await createFixtureStop(client);

      // Retire via the service (the exact path the PATCH handler uses).
      const retired = await updateStop(STOP_ID, { active: false }, client);
      assert(retired !== null, "updateStop must handle { active } (was the silent-404 gap)");
      assertEqual(retired!.active, false, "RETURNING must carry the new active value");

      // Default list: hidden.
      const defaultList = await listStops({ page: 1, pageSize: 5, q: STOP_ID }, client);
      assertEqual(defaultList.total, 0, "retired stop must be hidden from the default list");

      // include_retired: visible, active=false in the payload.
      const withRetired = await listStops(
        { page: 1, pageSize: 5, q: STOP_ID, include_retired: true },
        client,
      );
      assertEqual(withRetired.total, 1, "include_retired=true must reveal the retired stop");
      assertEqual(withRetired.items[0].active, false, "listStops payload must carry active");

      // Reactivate: back in the default list.
      const reactivated = await updateStop(STOP_ID, { active: true }, client);
      assertEqual(reactivated!.active, true, "reactivate must flip active back");
      const backAgain = await listStops({ page: 1, pageSize: 5, q: STOP_ID }, client);
      assertEqual(backAgain.total, 1, "reactivated stop must reappear in the default list");
    } finally {
      await cleanupFixtureStop(client);
    }
  });
});

test("T2-A2: retired stop never surfaces as a pool-planning candidate (membership still active)", async () => {
  await withOrgClient(async (client) => {
    try {
      await createFixtureStop(client);

      const before = await getCandidateStopsForPoolWithRisk(POOL_ID, 200, client);
      assert(
        before.some((s: any) => s.stop_id === STOP_ID),
        "active fixture stop should be a candidate (membership active)",
      );

      await updateStop(STOP_ID, { active: false }, client);

      const after = await getCandidateStopsForPoolWithRisk(POOL_ID, 200, client);
      assert(
        !after.some((s: any) => s.stop_id === STOP_ID),
        "retired stop must be excluded from planning candidates",
      );
    } finally {
      await cleanupFixtureStop(client);
    }
  });
});

test("T2-A2: row-level flag PATCH is no longer a silent 404 (is_hotspot via updateStop)", async () => {
  await withOrgClient(async (client) => {
    try {
      await createFixtureStop(client);

      const updated = await updateStop(STOP_ID, { is_hotspot: true }, client);
      assert(updated !== null, "updateStop must handle single-flag patches");
      assertEqual(updated!.is_hotspot, true, "flag must round-trip");
    } finally {
      await cleanupFixtureStop(client);
    }
  });
});
