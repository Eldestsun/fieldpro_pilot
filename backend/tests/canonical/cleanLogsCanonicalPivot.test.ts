import {
  pool,
  test,
  assert,
  assertEqual,
  createRouteRunFixture,
  cleanupFixture,
  deriveClientVisitIdLocal,
  FIXTURE_ACTOR_OID,
  FIXTURE_STOP_ID,
} from "../setup";
import type { PoolClient } from "pg";
import { completeStop } from "../../src/domains/routeRunStop/cleanLogService";
import {
  buildCleanLogsCanonicalQueries,
  CLEAN_ACTION_KEYS,
} from "../../src/domains/observation/cleanLogsCanonicalQuery";
import { REQUIRED_COLUMNS } from "./cleanLogsIdentity.test";

/**
 * ISSUE-031 P1 — clean-logs Layer 3 read repoint: LOSSLESS regression.
 *
 * The clean-logs list endpoints now read the 5 action booleans from canonical
 * core.observations action rows (absence ⇒ false) instead of public.clean_logs.
 * This is the named regression that the pivot is LOSSLESS: it drives the live
 * write path (completeStop, which still dual-writes clean_logs AND canonical
 * observations — the write clip is a separate later card), then asserts the
 * canonical pivot reproduces the clean_logs booleans EXACTLY for the same visit,
 * including the `false` ones produced by ABSENCE of an action row.
 *
 * The boolean set under test is deliberately mixed (3 true, 2 false) so the
 * not-done actions (washed_shelter, washed_can) exercise the absence ⇒ false path
 * — the exact place a "map only the rows that exist" pivot would silently drop a
 * value to null/missing.
 */

// Mixed boolean set. washed_shelter + washed_can are FALSE: no observation row is
// written for them, so the pivot must synthesize `false` from absence.
const ACTIONS = {
  picked_up_litter: true,
  emptied_trash: true,
  washed_shelter: false,
  washed_pad: true,
  washed_can: false,
} as const;

// Mirror of routeRunService.createRouteRun's assignment write (the canonical link
// the repointed read joins through: visit.assignment_id → route_run). Without it
// the visit has a null assignment_id and the canonical read cannot reach the
// route_run / route_run_stop spine — the same post-Tier-5 contract the live path
// relies on.
async function planAssignment(client: PoolClient, routeRunId: number): Promise<void> {
  await client.query(
    `
    INSERT INTO core.assignments (
      org_id, assignment_type, status, location_id,
      primary_asset_id, planned_for_date, source_system, source_ref, meta
    )
    SELECT a.org_id, 'transit_stop_clean', 'planned', loc.location_id,
           s.asset_id, CURRENT_DATE, 'route_runs', $1::text, '{}'::jsonb
    FROM route_run_stops rrs
    JOIN public.stops s ON s.stop_id = rrs.stop_id
    JOIN public.assets a ON a.id = rrs.asset_id
    LEFT JOIN core.v_locations_transit loc ON loc.stop_id = rrs.stop_id
    WHERE rrs.route_run_id = $1::bigint
    ON CONFLICT DO NOTHING
    `,
    [routeRunId],
  );
}

test("clean-logs canonical pivot: 5 booleans match clean_logs exactly (incl. false-by-absence), row count matches", async () => {
  const client = await pool.connect();
  const f = await createRouteRunFixture(client); // sets app.current_org_id, run_date = CURRENT_DATE
  try {
    await planAssignment(client, f.routeRunId);

    // ── Drive the live write path: writes clean_logs (legacy/BEFORE) AND canonical
    //    observation action rows (AFTER) in one transaction.
    const completed = await completeStop(client, f.routeRunStopId, {
      user_id: 999999, // worker identity — must NOT surface in either read
      duration_minutes: 5,
      picked_up_litter: ACTIONS.picked_up_litter,
      emptied_trash: ACTIONS.emptied_trash,
      washed_shelter: ACTIONS.washed_shelter,
      washed_pad: ACTIONS.washed_pad,
      washed_can: ACTIONS.washed_can,
      actorOid: FIXTURE_ACTOR_OID,
    });
    assert(completed !== null, "completeStop returned null (stop not found)");

    const visitRow = await client.query(
      `SELECT id FROM core.visits WHERE client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)],
    );
    assertEqual(visitRow.rowCount, 1, "exactly one visit for the fixture stop");
    const visitId = Number(visitRow.rows[0].id);

    const today = (await client.query(`SELECT CURRENT_DATE::text AS d`)).rows[0].d as string;

    // ── BEFORE: the legacy source of truth — public.clean_logs booleans.
    const before = await client.query(
      `SELECT picked_up_litter, emptied_trash, washed_shelter, washed_pad, washed_can
       FROM clean_logs WHERE visit_id = $1`,
      [visitId],
    );
    assertEqual(before.rowCount, 1, "exactly one clean_logs row for the visit");
    const cl = before.rows[0];

    // ── AFTER: the repointed canonical read (the real builder both endpoints use),
    //    scoped to this stop + today so it isolates the fixture visit.
    const { query, countQuery, queryValues, countValues } = buildCleanLogsCanonicalQueries({
      stop_id: FIXTURE_STOP_ID,
      run_date: today,
      pageSize: 200,
      offset: 0,
    });
    const after = await client.query(query, queryValues);
    const count = await client.query(countQuery, countValues);

    // Row count parity: one clean_logs row ⇒ one canonical row; total matches.
    assertEqual(after.rowCount, 1, "canonical read returns exactly one row for stop/date");
    assertEqual(
      parseInt(count.rows[0].total, 10),
      1,
      "canonical count(total) matches the single clean_logs row",
    );

    const row = after.rows[0];
    assertEqual(Number(row.id), visitId, "canonical row id is the visit id");

    // Shape parity: every consumer-read column survives the repoint.
    const rowKeys = Object.keys(row);
    for (const col of REQUIRED_COLUMNS) {
      assert(rowKeys.includes(col), `canonical read missing required column "${col}" (keys: ${rowKeys.join(", ")})`);
    }

    // The one correctness requirement: every one of the 5 KNOWN keys matches the
    // clean_logs boolean EXACTLY — including the two false ones synthesized from
    // absence. A null/undefined here is the pivot bug the task warns about.
    for (const key of CLEAN_ACTION_KEYS) {
      const got = row[key];
      assert(
        typeof got === "boolean",
        `pivot key "${key}" is not an explicit boolean (got ${JSON.stringify(got)}) — absence must yield false, not null/missing`,
      );
      assertEqual(got, cl[key], `pivot boolean "${key}" must equal clean_logs.${key}`);
      assertEqual(got, ACTIONS[key], `pivot boolean "${key}" must equal the written action value`);
    }

    // Prove the two false booleans came from ABSENCE, not from a stored false:
    // there is genuinely NO action observation row for them, yet the pivot is false.
    const presentKeys = await client.query(
      `SELECT intervention FROM core.observations
       WHERE visit_id = $1 AND obs_kind = 'action'`,
      [visitId],
    );
    const present = new Set(presentKeys.rows.map((r) => r.intervention as string));
    assert(!present.has("washed_shelter"), "no washed_shelter action row should exist");
    assert(!present.has("washed_can"), "no washed_can action row should exist");
    assertEqual(row.washed_shelter, false, "washed_shelter is false via absence");
    assertEqual(row.washed_can, false, "washed_can is false via absence");

    // Runtime identity proof: the canonical read shape carries no worker identity.
    const keys = Object.keys(row);
    for (const idCol of ["user_id", "worker_id", "employee_id"]) {
      assert(!keys.includes(idCol), `canonical read leaked identity column "${idCol}" (keys: ${keys.join(", ")})`);
    }
  } finally {
    // completeStop's clean_logs / trash_volume_logs rows are SET NULL (not cascaded)
    // on visit delete — remove them explicitly by route_run_stop_id before the
    // fixture teardown so no orphaned row pollutes the DB.
    await client.query(`DELETE FROM clean_logs WHERE route_run_stop_id = $1`, [f.routeRunStopId]);
    await client.query(`DELETE FROM trash_volume_logs WHERE route_run_stop_id = $1`, [f.routeRunStopId]);
    await cleanupFixture(client, f); // cascades visit → observations / effort_history
    client.release();
  }
});
