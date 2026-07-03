import {
  pool,
  test,
  assert,
  assertEqual,
  FIXTURE_ORG_ID,
  FIXTURE_STOP_ID,
  FIXTURE_ASSET_ID,
  FIXTURE_POOL_ID,
} from "../setup";
import { populate } from "../../src/scripts/populateEamBridge";

// ── S1-7: EAM Bridge Route Log integration tests ──────────────────────────

test("eam_bridge_route_log: table has no worker identity columns", async () => {
  const client = await pool.connect();
  try {
    const res = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'eam_bridge_route_log'
         AND column_name IN (
           'actor_oid', 'captured_by_oid', 'user_id',
           'assigned_user_oid', 'created_by_oid'
         )`
    );
    assertEqual(
      res.rowCount ?? 0,
      0,
      `eam_bridge_route_log must have zero worker identity columns — found: ${
        res.rows.map((r) => r.column_name).join(", ") || "none"
      }`
    );
  } finally {
    try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort */ }
    client.release();
  }
});

test("eam_bridge_route_log: populate inserts correct stop_count and exception_count", async () => {
  const client = await pool.connect();
  let routeRunId: number | null = null;
  let hazardId: number | null = null;
  let savedWatermark: Date | null = null;

  try {
    // ISSUE-057 (bucket B): the route_runs pool-invariant trigger reads
    // route_pools as invoker — under fail-closed RLS a context-less session
    // cannot SEE TEST_POOL (it exists; this is visibility, not absence).
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(FIXTURE_ORG_ID)]);
    // Save current watermark so we can restore after test.
    const wmRes = await client.query<{ watermark: Date }>(
      "SELECT watermark FROM eam_bridge_populate_state WHERE id = 1"
    );
    savedWatermark = wmRes.rows[0].watermark;

    // Seed: completed route_run.
    const runRes = await client.query<{ id: number }>(
      `INSERT INTO route_runs (route_pool_id, run_date, status, org_id, finished_at)
       VALUES ($1, CURRENT_DATE, 'completed', $2, NOW())
       RETURNING id`,
      [FIXTURE_POOL_ID, FIXTURE_ORG_ID]
    );
    routeRunId = Number(runRes.rows[0].id);

    // 3 stops — all same fixture stop (acceptable for test isolation).
    const s1 = await client.query<{ id: number }>(
      `INSERT INTO route_run_stops (route_run_id, stop_id, asset_id, sequence, status, org_id)
       VALUES ($1, $2, $3, 0, 'done', $4) RETURNING id`,
      [routeRunId, FIXTURE_STOP_ID, FIXTURE_ASSET_ID, FIXTURE_ORG_ID]
    );
    const s2 = await client.query<{ id: number }>(
      `INSERT INTO route_run_stops (route_run_id, stop_id, asset_id, sequence, status, org_id)
       VALUES ($1, $2, $3, 1, 'done', $4) RETURNING id`,
      [routeRunId, FIXTURE_STOP_ID, FIXTURE_ASSET_ID, FIXTURE_ORG_ID]
    );
    const s3 = await client.query<{ id: number }>(
      `INSERT INTO route_run_stops (route_run_id, stop_id, asset_id, sequence, status, org_id)
       VALUES ($1, $2, $3, 2, 'done', $4) RETURNING id`,
      [routeRunId, FIXTURE_STOP_ID, FIXTURE_ASSET_ID, FIXTURE_ORG_ID]
    );
    const stop3Id = Number(s3.rows[0].id);

    // Seed a hazard on stop3 — marks it as an exception in the bridge summary.
    const hRes = await client.query<{ id: number }>(
      `INSERT INTO hazards (stop_id, route_run_stop_id, hazard_type, severity, details, org_id)
       VALUES ($1, $2, 'graffiti', 2, '{"source": "eam-bridge-test"}', $3)
       RETURNING id`,
      [FIXTURE_STOP_ID, stop3Id, FIXTURE_ORG_ID]
    );
    hazardId = Number(hRes.rows[0].id);
    await client.query(
      `UPDATE route_run_stops SET hazard_id = $1 WHERE id = $2`,
      [hazardId, stop3Id]
    );

    // Push watermark back so the populate script sees the new run.
    await client.query(
      `UPDATE eam_bridge_populate_state
       SET watermark = NOW() - INTERVAL '1 minute'
       WHERE id = 1`
    );

    // Run the populate script.
    const result = await populate(FIXTURE_ORG_ID);
    assert(
      result.inserted >= 1,
      `populate must insert at least 1 row, got ${result.inserted}`
    );

    // Assert the bridge row.
    const bridgeRes = await client.query(
      `SELECT org_id, route_run_id, completed_at,
              stop_count, exception_count, canonical_summary, logged_at
       FROM eam_bridge_route_log
       WHERE route_run_id = $1`,
      [routeRunId]
    );
    assertEqual(bridgeRes.rowCount ?? 0, 1, "exactly one bridge row for the seeded route_run");
    const row = bridgeRes.rows[0];
    assertEqual(Number(row.org_id), FIXTURE_ORG_ID, "org_id matches fixture org");
    assertEqual(Number(row.route_run_id), routeRunId, "route_run_id matches");
    assertEqual(row.stop_count, 3, "stop_count = 3");
    assertEqual(row.exception_count, 1, "exception_count = 1 (stop3 has hazard)");
    assert(row.canonical_summary !== null, "canonical_summary is present");
    assert(
      Array.isArray(row.canonical_summary.stops),
      "canonical_summary.stops is an array"
    );
    assertEqual(
      row.canonical_summary.stops.length,
      3,
      "canonical_summary.stops contains all 3 stops"
    );
    assert(row.logged_at !== null, "logged_at is set");

    // Confirm no worker identity in the returned row.
    assert(!("actor_oid" in row), "no actor_oid in bridge row");
    assert(!("captured_by_oid" in row), "no captured_by_oid in bridge row");
    assert(!("user_id" in row), "no user_id in bridge row");
  } finally {
    // Cleanup in dependency order.
    if (routeRunId !== null) {
      await client.query(
        `DELETE FROM eam_bridge_route_log WHERE route_run_id = $1`,
        [routeRunId]
      );
    }
    // Deleting hazard sets route_run_stops.hazard_id = NULL via ON DELETE SET NULL.
    if (hazardId !== null) {
      await client.query(`DELETE FROM hazards WHERE id = $1`, [hazardId]);
    }
    // Deleting route_run cascades to route_run_stops.
    if (routeRunId !== null) {
      await client.query(`DELETE FROM route_runs WHERE id = $1`, [routeRunId]);
    }
    // Restore watermark.
    if (savedWatermark !== null) {
      await client.query(
        `UPDATE eam_bridge_populate_state SET watermark = $1 WHERE id = 1`,
        [savedWatermark]
      );
    }
    try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort */ }
    client.release();
  }
});

test("eam_bridge_route_log: populate is idempotent (ON CONFLICT DO NOTHING)", async () => {
  const client = await pool.connect();
  let routeRunId: number | null = null;
  let savedWatermark: Date | null = null;

  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(FIXTURE_ORG_ID)]);
    const wmRes = await client.query<{ watermark: Date }>(
      "SELECT watermark FROM eam_bridge_populate_state WHERE id = 1"
    );
    savedWatermark = wmRes.rows[0].watermark;

    const runRes = await client.query<{ id: number }>(
      `INSERT INTO route_runs (route_pool_id, run_date, status, org_id, finished_at)
       VALUES ($1, CURRENT_DATE, 'completed', $2, NOW())
       RETURNING id`,
      [FIXTURE_POOL_ID, FIXTURE_ORG_ID]
    );
    routeRunId = Number(runRes.rows[0].id);

    await client.query(
      `INSERT INTO route_run_stops (route_run_id, stop_id, asset_id, sequence, status, org_id)
       VALUES ($1, $2, $3, 0, 'done', $4)`,
      [routeRunId, FIXTURE_STOP_ID, FIXTURE_ASSET_ID, FIXTURE_ORG_ID]
    );

    // First populate run.
    await client.query(
      `UPDATE eam_bridge_populate_state
       SET watermark = NOW() - INTERVAL '1 minute' WHERE id = 1`
    );
    const first = await populate(FIXTURE_ORG_ID);
    assert(first.inserted >= 1, "first populate inserts a row");

    // Reset watermark to force the run back into scope.
    await client.query(
      `UPDATE eam_bridge_populate_state
       SET watermark = NOW() - INTERVAL '1 minute' WHERE id = 1`
    );

    // Second populate run — NOT EXISTS prevents re-insertion.
    const second = await populate(FIXTURE_ORG_ID);
    assertEqual(
      second.inserted,
      0,
      "second populate inserts 0 rows (run already logged)"
    );

    // Exactly one bridge row regardless of how many times we run.
    const countRes = await client.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM eam_bridge_route_log WHERE route_run_id = $1`,
      [routeRunId]
    );
    assertEqual(
      Number(countRes.rows[0].cnt),
      1,
      "exactly one bridge row after two populate runs"
    );
  } finally {
    if (routeRunId !== null) {
      await client.query(
        `DELETE FROM eam_bridge_route_log WHERE route_run_id = $1`,
        [routeRunId]
      );
      await client.query(`DELETE FROM route_runs WHERE id = $1`, [routeRunId]);
    }
    if (savedWatermark !== null) {
      await client.query(
        `UPDATE eam_bridge_populate_state SET watermark = $1 WHERE id = 1`,
        [savedWatermark]
      );
    }
    try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort */ }
    client.release();
  }
});
