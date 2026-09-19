import type { AddressInfo } from "net";
import type { Server } from "http";
// Dev-bypass must be opted-in before app.ts is required.
process.env.DEV_AUTH_BYPASS = "true";

import { test, assert, assertEqual, pool, FIXTURE_ORG_ID } from "../setup";

// ============================================================================
// ISSUE-050 — POST /route-runs/:id/stops (add stop to a live run).
//
// Founder rulings enforced here (2026-09-18):
//  - APPEND-ONLY: the new stop lands at sequence MAX+1; existing stops and
//    their sequences are untouched.
//  - origin_type 'emergency' ONLY; 'ul_ad_hoc' is reserved (400).
//  - Dispatch/Admin only (Specialist → 403).
//  - Terminal runs (finished/completed) reject with 409; duplicates 409.
//  - Q-C: the injected stop gets its own core.assignments row + encrypted
//    actor-audit sidecar, atomically with the stop row.
//
// Drives the REAL endpoint in-process (adhocRouteRuns pattern): fake OSRM for
// leg costs, real DB for everything else. Runs are built from the seed-owned
// picker stops SEAMD_ADHOC_A/B (seed.sql §11) and SEAMD_ADHOC_C is injected.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);
const STOP_A = "SEAMD_ADHOC_A";
const STOP_B = "SEAMD_ADHOC_B";
const STOP_C = "SEAMD_ADHOC_C";

function devHeaders(persona: string = "dispatch"): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Dev-Persona": persona,
  };
}

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function createAdhocRun(baseUrl: string): Promise<number> {
  const res = await fetch(`${baseUrl}/api/route-runs`, {
    method: "POST",
    headers: devHeaders(),
    body: JSON.stringify({
      pool_id: "TEST_POOL",
      base_id: "SOUTH",
      stop_ids: [STOP_A, STOP_B],
      is_adhoc: true,
    }),
  });
  assert(res.ok, `fixture run creation succeeded (got ${res.status})`);
  const body = await res.json();
  return Number(body.route_run_id);
}

async function addStop(
  baseUrl: string,
  runId: number,
  stopId: string,
  extra: Record<string, unknown> = {},
  persona: string = "dispatch",
): Promise<Response> {
  return fetch(`${baseUrl}/api/route-runs/${runId}/stops`, {
    method: "POST",
    headers: devHeaders(persona),
    body: JSON.stringify({ stop_id: stopId, ...extra }),
  });
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

test("ISSUE-050: append lands at MAX+1 with origin_type='emergency', asset resolved, totals bumped", async () => {
  const { server, baseUrl } = await startServer();
  const runIds: number[] = [];
  try {
    const runId = await createAdhocRun(baseUrl);
    runIds.push(runId);

    const before = await withOrg(async (client) => {
      const r = await client.query(
        `SELECT total_distance_m, total_duration_s FROM route_runs WHERE id = $1`, [runId]);
      const s = await client.query(
        `SELECT stop_id, sequence FROM route_run_stops WHERE route_run_id = $1 ORDER BY sequence`, [runId]);
      return { totals: r.rows[0], stops: s.rows };
    });
    assertEqual(before.stops.length, 2, "fixture run starts with 2 stops");

    const res = await addStop(baseUrl, runId, STOP_C);
    assertEqual(res.status, 200, "add-stop returns 200");
    const body = await res.json();
    assert(body.ok === true, "response ok=true");
    assert(Array.isArray(body.route_run.stops) && body.route_run.stops.length === 3,
      "reloaded run has 3 stops");

    const after = await withOrg(async (client) => {
      const r = await client.query(
        `SELECT total_distance_m, total_duration_s FROM route_runs WHERE id = $1`, [runId]);
      const s = await client.query(
        `SELECT id, stop_id, sequence, status, origin_type, asset_id, planned_distance_m, planned_duration_s
           FROM route_run_stops WHERE route_run_id = $1 ORDER BY sequence`, [runId]);
      return { totals: r.rows[0], stops: s.rows };
    });

    const injected = after.stops.find((s: any) => s.stop_id === STOP_C);
    assert(injected != null, "injected stop row exists");
    const maxPrior = Math.max(...before.stops.map((s: any) => Number(s.sequence)));
    assertEqual(Number(injected.sequence), maxPrior + 1, "sequence = prior MAX + 1 (append)");
    assertEqual(injected.status, "pending", "status = pending");
    assertEqual(injected.origin_type, "emergency", "origin_type = emergency");
    assertEqual(String(injected.asset_id), "987654323", "asset_id resolved from public.stops");
    assert(Number(injected.planned_distance_m) > 0, "leg distance computed (> 0)");

    // Append-only invariant: the pre-existing stops kept their sequences.
    for (const prior of before.stops) {
      const still = after.stops.find((s: any) => s.stop_id === prior.stop_id);
      assertEqual(Number(still.sequence), Number(prior.sequence),
        `pre-existing stop ${prior.stop_id} sequence untouched`);
    }

    // Totals bumped by the new leg (tolerance: double-precision addition).
    const distDelta = Number(after.totals.total_distance_m) - Number(before.totals.total_distance_m);
    assert(
      Math.abs(distDelta - Number(injected.planned_distance_m)) < 0.001,
      `run total_distance_m += new leg (delta ${distDelta} vs leg ${injected.planned_distance_m})`
    );

    // Q-C: the injected stop got its own assignment + encrypted actor sidecar.
    const qc = await withOrg(async (client) => {
      const a = await client.query(
        `SELECT a.id, a.primary_asset_id, aud.actor_ref, aud.actor_ref_ciphertext
           FROM core.assignments a
           LEFT JOIN core.assignment_actor_audit aud ON aud.assignment_id = a.id
          WHERE a.source_system = 'route_runs' AND a.source_ref = $1::text
            AND a.primary_asset_id = 987654323`,
        [runId],
      );
      return a.rows;
    });
    assertEqual(qc.length, 1, "exactly one core.assignments row for the injected stop");
    assertEqual(qc[0].actor_ref, "encrypted", "actor sidecar carries the non-identifying sentinel");
    assert(qc[0].actor_ref_ciphertext != null, "actor sidecar ciphertext present");
  } finally {
    await cleanupRuns(runIds);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("ISSUE-050: duplicate stop 409; terminal run 409; unknown stop 400; ul_ad_hoc reserved 400; Specialist 403", async () => {
  const { server, baseUrl } = await startServer();
  const runIds: number[] = [];
  try {
    const runId = await createAdhocRun(baseUrl);
    runIds.push(runId);

    // Duplicate: STOP_A is already on the run.
    const dup = await addStop(baseUrl, runId, STOP_A);
    assertEqual(dup.status, 409, "duplicate stop rejected with 409");

    // Reserved origin value.
    const reserved = await addStop(baseUrl, runId, STOP_C, { origin_type: "ul_ad_hoc" });
    assertEqual(reserved.status, 400, "origin_type 'ul_ad_hoc' rejected (reserved)");

    // Unknown stop.
    const unknown = await addStop(baseUrl, runId, "NO_SUCH_STOP_050");
    assertEqual(unknown.status, 400, "unknown stop rejected with 400");

    // Role gate: Specialist may not add stops.
    const forbidden = await addStop(baseUrl, runId, STOP_C, {}, "specialist");
    assertEqual(forbidden.status, 403, "Specialist rejected with 403");

    // Terminal run: force-complete then try to add.
    await withOrg((client) =>
      client.query(`UPDATE route_runs SET status = 'completed' WHERE id = $1`, [runId]));
    const terminal = await addStop(baseUrl, runId, STOP_C);
    assertEqual(terminal.status, 409, "completed run rejected with 409");

    // Nothing was written by any of the rejected attempts.
    const count = await withOrg(async (client) => {
      const r = await client.query(
        `SELECT COUNT(*)::int AS n FROM route_run_stops WHERE route_run_id = $1`, [runId]);
      return r.rows[0].n;
    });
    assertEqual(count, 2, "run still has exactly its 2 original stops");
  } finally {
    await cleanupRuns(runIds);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
