import type { AddressInfo } from "net";
import type { Server } from "http";
// Dev-bypass must be opted-in before app.ts is required.
process.env.DEV_AUTH_BYPASS = "true";

import { test, assert, assertEqual, pool, FIXTURE_ORG_ID } from "../setup";

// ============================================================================
// SEAM-D D3a — route_runs.is_adhoc write path.
//
// Operator rulings enforced here:
//  - is_adhoc is an EXPLICIT body flag; the server never infers it.
//  - is_adhoc=true REQUIRES stop_ids[] (min 2 — the existing OSRM floor).
//  - stop_ids[] WITHOUT the flag stays legal and UNTAGGED (legacy primitive).
//  - Run-level tag only; stop-level origin_type semantics untouched.
//
// The persist tests drive the REAL endpoint (in-process app + live OSRM) with
// the two SEED-OWNED picker fixture stops (tests/fixtures/seed.sql §11:
// SEAMD_ADHOC_A/B — coordinate-bearing, asset-linked), then read
// route_runs.is_adhoc back under org context. The stops live in seed.sql,
// not here: the asset_id write needs the elevated ISSUE-024 trigger toggle,
// and CI has no runtime provisioner credential by design — this suite runs
// on the suite pool ONLY. Tests create and clean up their own RUNS.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);
// Seed-owned picker fixture stops — see tests/fixtures/seed.sql §11.
const STOP_A = "SEAMD_ADHOC_A";
const STOP_B = "SEAMD_ADHOC_B";

function devHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Dev-User-Oid": "seam-d-adhoc-suite-dispatch",
    "X-Dev-User-Roles": "Dispatch",
    "X-Dev-User-Org-Id": ORG,
  };
}

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function postRouteRun(baseUrl: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${baseUrl}/api/route-runs`, {
    method: "POST",
    headers: devHeaders(),
    body: JSON.stringify(body),
  });
}

// Per-test state is RUNS ONLY — the fixture stops/assets are permanent
// seed-owned reference rows (seed.sql §11) and are never deleted here.
async function cleanupRuns(runIds: number[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    for (const id of runIds) {
      await client.query(
        `DELETE FROM core.assignments WHERE source_system = 'route_runs' AND source_ref = $1::text`,
        [id],
      );
      await client.query(`DELETE FROM route_runs WHERE id = $1`, [id]);
    }
    await client.query(`SELECT set_config('app.current_org_id', '', false)`);
  } finally {
    client.release();
  }
}

async function readIsAdhoc(runId: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    const r = await client.query(`SELECT is_adhoc FROM route_runs WHERE id = $1`, [runId]);
    assert(r.rowCount === 1, `route_run ${runId} readable under org context`);
    return r.rows[0].is_adhoc;
  } finally {
    try {
      await client.query(`SELECT set_config('app.current_org_id', '', false)`);
    } finally {
      client.release();
    }
  }
}

test("SEAM-D D3a: schema — route_runs.is_adhoc is boolean NOT NULL DEFAULT false (additive, backfill-free)", async () => {
  const r = await pool.query(
    `SELECT data_type, column_default, is_nullable
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'route_runs' AND column_name = 'is_adhoc'`,
  );
  assertEqual(r.rowCount, 1, "is_adhoc column exists");
  assertEqual(r.rows[0].data_type, "boolean", "boolean type");
  assertEqual(r.rows[0].column_default, "false", "DEFAULT false");
  assertEqual(r.rows[0].is_nullable, "NO", "NOT NULL");
});

test("SEAM-D D3a: is_adhoc=true without stop_ids is rejected (400); non-boolean is_adhoc rejected", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const noStops = await postRouteRun(baseUrl, { pool_id: "TEST_POOL", is_adhoc: true });
    assertEqual(noStops.status, 400, "ad-hoc without stop_ids → 400");
    const body = await noStops.json();
    assert(/stop_ids/.test(body.error), "error names the missing stop_ids");

    const oneStop = await postRouteRun(baseUrl, { pool_id: "TEST_POOL", is_adhoc: true, stop_ids: [STOP_A] });
    assertEqual(oneStop.status, 400, "ad-hoc with a single stop → 400 (min 2, the OSRM floor)");

    const nonBool = await postRouteRun(baseUrl, { pool_id: "TEST_POOL", is_adhoc: "yes", stop_ids: [STOP_A, STOP_B] });
    assertEqual(nonBool.status, 400, "non-boolean is_adhoc → 400 (no coercion)");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("SEAM-D D3a: ad-hoc run persists is_adhoc=true; untagged explicit-stop run stays false", async () => {
  const { server, baseUrl } = await startServer();
  const createdRunIds: number[] = [];
  try {
    // Explicit flag → tagged.
    const adhocRes = await postRouteRun(baseUrl, {
      pool_id: "TEST_POOL",
      base_id: "SOUTH",
      stop_ids: [STOP_A, STOP_B],
      is_adhoc: true,
    });
    assertEqual(adhocRes.status, 200, "ad-hoc create → 200 (live OSRM plan)");
    const adhocBody = await adhocRes.json();
    assert(adhocBody.route_run_id, "ad-hoc create returns route_run_id");
    createdRunIds.push(adhocBody.route_run_id);
    assertEqual(await readIsAdhoc(adhocBody.route_run_id), true, "route_runs.is_adhoc persisted TRUE");

    // Same stops, NO flag → the legacy primitive stays legal and UNTAGGED —
    // the server never infers ad-hoc from stop_ids[] presence.
    const untaggedRes = await postRouteRun(baseUrl, {
      pool_id: "TEST_POOL",
      base_id: "SOUTH",
      stop_ids: [STOP_A, STOP_B],
    });
    assertEqual(untaggedRes.status, 200, "untagged explicit-stop create → 200");
    const untaggedBody = await untaggedRes.json();
    createdRunIds.push(untaggedBody.route_run_id);
    assertEqual(await readIsAdhoc(untaggedBody.route_run_id), false, "untagged run defaults is_adhoc FALSE");
  } finally {
    await cleanupRuns(createdRunIds);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
