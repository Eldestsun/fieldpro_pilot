import type { AddressInfo } from "net";
import type { Server } from "http";
import type { PoolClient } from "pg";
// Dev-bypass must be opted-in before app.ts is required.
process.env.DEV_AUTH_BYPASS = "true";

import { test, assert, assertEqual, pool, FIXTURE_ORG_ID } from "../setup";

// ============================================================================
// PATTERN-001 regression — POST /api/route-runs/preview (pool_id branch).
//
// Bug: the pool_id branch passed the bare module `pool` to
// getCandidateStopsForPoolWithRisk. Its candidate query reads public.stops
// (a view over transit_stops) JOINed with stop_pool_memberships — both FORCE
// ROW LEVEL SECURITY. With no app.current_org_id on the connection, RLS
// fail-closes to 0 rows, so a fully-authorized Dispatch request got
// 400 "Not enough stops found in pool '<id>'" for a pool that actually has
// stops. Fix scopes the read through withOrgContext(resolveNumericOrgId(req),
// ...), matching the sibling Option A / /routes/plan call sites in the file.
//
// This drives the REAL endpoint (in-process app; routing goes to the OSRM-only
// stub — tests/fakeOsrm.ts). The seed fixture cannot exercise this path
// (stop_pool_memberships is unseeded and TEST_POOL has a single stop), so the
// test creates a throwaway org-1 pool with two eligible stops under org
// context on the suite pool and removes it afterward. The companion assertion
// pins the bug's mechanism: the same candidate read WITHOUT org context
// returns 0 rows (fail-closed), which is exactly what the pre-fix bare-pool
// path did.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);
const POOL = "PREVIEW_RLS_TEST_POOL";
const S1 = "PREVIEW_RLS_STOP_1";
const S2 = "PREVIEW_RLS_STOP_2";

function devHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Dev-User-Oid": "preview-rls-suite-dispatch",
    "X-Dev-User-Roles": "Dispatch",
    "X-Dev-User-Org-Id": ORG,
  };
}

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
}

async function withOrg<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    return await fn(client);
  } finally {
    try {
      await client.query(`SELECT set_config('app.current_org_id', '', false)`);
    } catch { /* best-effort reset */ }
    client.release();
  }
}

// Two coordinate-bearing, pool-eligible stops (asset_id NULL — the ISSUE-024
// asset-sync trigger is a no-op for NULL, so the suite role can insert without
// the elevated toggle the seed needs for asset-linked stops).
async function seedPool(): Promise<void> {
  await withOrg(async (c) => {
    await c.query(
      `INSERT INTO public.route_pools (id, label, org_id)
       VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [POOL, "Preview RLS Regression Pool", ORG],
    );
    await c.query(
      `INSERT INTO public.transit_stops
         (stop_id, org_id, pool_id, lon, lat, on_street_name, bearing_code, has_trash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (stop_id) DO NOTHING`,
      [S1, ORG, POOL, -122.300, 47.500, "Preview RLS 1", "N"],
    );
    await c.query(
      `INSERT INTO public.transit_stops
         (stop_id, org_id, pool_id, lon, lat, on_street_name, bearing_code, has_trash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (stop_id) DO NOTHING`,
      [S2, ORG, POOL, -122.310, 47.510, "Preview RLS 2", "S"],
    );
    await c.query(
      `INSERT INTO public.stop_pool_memberships (stop_id, pool_id, org_id, active)
       VALUES ($1, $3, $4, true), ($2, $3, $4, true)
       ON CONFLICT (stop_id, pool_id) DO NOTHING`,
      [S1, S2, POOL, ORG],
    );
  });
}

async function cleanupPool(): Promise<void> {
  await withOrg(async (c) => {
    await c.query(`DELETE FROM public.stop_pool_memberships WHERE pool_id = $1`, [POOL]);
    await c.query(`DELETE FROM public.transit_stops WHERE stop_id = ANY($1::text[])`, [[S1, S2]]);
    await c.query(`DELETE FROM public.route_pools WHERE id = $1`, [POOL]);
  });
}

test("PATTERN-001: /route-runs/preview pool_id branch resolves org context (200 + eligible stops), not fail-closed 400", async () => {
  await cleanupPool(); // idempotent pre-clean in case a prior run aborted mid-test
  await seedPool();
  const { server, baseUrl } = await startServer();
  try {
    // Bug mechanism, pinned: the candidate read WITHOUT org context is
    // fail-closed to 0 rows — exactly what the pre-fix bare-pool path saw,
    // which produced the spurious 400. A context leak (nonzero here) would
    // itself be a regression worth catching.
    const noCtx = await pool.query(
      `SELECT count(*)::int AS n
         FROM public.stops s
         JOIN public.stop_pool_memberships spm
           ON spm.stop_id = s.stop_id AND spm.pool_id = $1 AND spm.active = true`,
      [POOL],
    );
    assertEqual(noCtx.rows[0].n, 0, "context-less candidate read is fail-closed (0 rows) — the bug's mechanism");

    const res = await fetch(`${baseUrl}/api/route-runs/preview`, {
      method: "POST",
      headers: devHeaders(),
      body: JSON.stringify({ pool_id: POOL }),
    });
    assertEqual(res.status, 200, "preview with a populated pool returns 200 (org context restored)");
    const body = await res.json();
    assert(body.ok === true, "ok:true");
    assertEqual(body.total_stops, 2, "both eligible pool stops returned (not fail-closed to <2)");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await cleanupPool();
  }
});
