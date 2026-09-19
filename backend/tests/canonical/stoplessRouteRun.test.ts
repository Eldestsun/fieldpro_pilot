import type { AddressInfo } from "net";
import type { Server } from "http";
// Dev-bypass must be opted-in before app.ts is required.
process.env.DEV_AUTH_BYPASS = "true";

import { test, assert, assertEqual, pool, FIXTURE_ORG_ID } from "../setup";

// ============================================================================
// ISSUE-015 — a stopless route run is a LEGITIMATE state, not a 404.
//
// Founder ruling 2026-09-19 (Option A): the detail loader LEFT JOINs stops and
// returns the run with `stops: []`; the Dispatch UI renders an empty state
// pointing at the ISSUE-050 Add-stop control. The old INNER JOIN made real
// runs vanish — a 404 on an existing run is exactly the silent wrong answer
// the system must never give. No write-time ≥1 constraint: creation already
// enforces the OSRM ≥2 floor, so stopless runs cannot recur normally.
//
// This suite locks the chosen behavior in: stopless run → 200 + empty stops.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);
const STOP_A = "SEAMD_ADHOC_A";
const STOP_B = "SEAMD_ADHOC_B";

function devHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Dev-Persona": "dispatch",
  };
}

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function withOrg<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    return await fn(client);
  } finally {
    try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* reset */ }
    client.release();
  }
}

async function cleanupRuns(runIds: number[]): Promise<void> {
  await withOrg(async (client) => {
    for (const id of runIds) {
      await client.query(
        `DELETE FROM core.assignments WHERE source_system = 'route_runs' AND source_ref = $1::text`,
        [id],
      );
      await client.query(`DELETE FROM route_runs WHERE id = $1`, [id]);
    }
  });
}

test("ISSUE-015: stopless route run returns 200 with stops: [] (never a false 404)", async () => {
  const { server, baseUrl } = await startServer();
  const runIds: number[] = [];
  try {
    // Build a real run, then hollow it out — reproducing the May-era stopless
    // shape (route_runs row present, zero route_run_stops rows).
    const createRes = await fetch(`${baseUrl}/api/route-runs`, {
      method: "POST",
      headers: devHeaders(),
      body: JSON.stringify({
        pool_id: "TEST_POOL",
        base_id: "SOUTH",
        stop_ids: [STOP_A, STOP_B],
        is_adhoc: true,
      }),
    });
    assert(createRes.ok, `fixture run created (got ${createRes.status})`);
    const runId = Number((await createRes.json()).route_run_id);
    runIds.push(runId);

    await withOrg(async (client) => {
      await client.query(
        `DELETE FROM core.assignments WHERE source_system = 'route_runs' AND source_ref = $1::text`,
        [runId],
      );
      await client.query(`DELETE FROM route_run_stops WHERE route_run_id = $1`, [runId]);
    });

    const res = await fetch(`${baseUrl}/api/lead/route-runs/${runId}`, {
      headers: devHeaders(),
    });
    assertEqual(res.status, 200, "stopless run answers 200, not 404");
    const body = await res.json();
    const run = body.route_run ?? body;
    assertEqual(Number(run.id), runId, "the run itself is returned");
    assert(Array.isArray(run.stops), "stops is an array");
    assertEqual(run.stops.length, 0, "stops: [] — the honest empty list");
    assertEqual(run.status, "planned", "run-level fields intact on the stopless payload");
  } finally {
    await cleanupRuns(runIds);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("ISSUE-015: a truly missing run still 404s (the fix widened stopless, not nonexistent)", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/lead/route-runs/999999999`, {
      headers: devHeaders(),
    });
    assertEqual(res.status, 404, "nonexistent run remains a 404");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
