/**
 * Seed stop_pool_memberships for the four dev test pools.
 *
 * AGENT-SMOKE-1 finding #5 (escalated 2026-09-01): the test pools
 * (TEST_POOL, TEST_POOL_1/2/3) were created against the deprecated
 * transit_stops.pool_id cache and never received rows in
 * stop_pool_memberships — the authoritative junction the route planner
 * reads (routeRunService.getCandidateStopsForPoolWithRisk). Result: every
 * pool-based route creation from a test pool failed with "Not enough
 * stops found in pool".
 *
 * This script gives each test pool a deterministic, disjoint slice of the
 * org's transit stops (ordered by length(stop_id), stop_id — stable across
 * runs), sized to the pool's Easy/Medium/Heavy intent. TEST_POOL also
 * force-includes stop 31150 so the historical run #4188 (TEST_POOL,
 * stop 31150) is coherent with its pool.
 *
 * Idempotent: ON CONFLICT (stop_id, pool_id) DO NOTHING; re-running is a
 * no-op. Dev fixture only — refuses to run in production.
 *
 * Run: pnpm seed:test-pools   (PGHOST override applies as usual)
 */
import { pool, withOrgContext } from "../db";

interface PoolSeed {
  poolId: string;
  count: number;
  offset: number;
  forceInclude?: string[];
}

const SEEDS: PoolSeed[] = [
  { poolId: "TEST_POOL",   count: 5,  offset: 0,  forceInclude: ["31150"] },
  { poolId: "TEST_POOL_1", count: 5,  offset: 5 },
  { poolId: "TEST_POOL_2", count: 10, offset: 10 },
  { poolId: "TEST_POOL_3", count: 20, offset: 20 },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seedTestPoolMemberships is a dev fixture — refusing to run in production.");
  }

  // route_pools is FORCE RLS (PATTERN-001): a bare pool.query returns zero
  // rows. organizations carries no RLS — enumerate orgs, then resolve the
  // test pools under each org's context.
  const orgsRes = await pool.query(`SELECT id FROM organizations ORDER BY id`);
  const orgByPool = new Map<string, number>();
  for (const orgRow of orgsRes.rows) {
    const orgId = Number(orgRow.id);
    const rows = await withOrgContext(orgId, (client) =>
      client
        .query(`SELECT id FROM route_pools WHERE id = ANY($1::text[]) AND org_id = $2`, [
          SEEDS.map(s => s.poolId),
          orgId,
        ])
        .then(r => r.rows),
    );
    for (const r of rows) orgByPool.set(r.id, orgId);
  }

  for (const seed of SEEDS) {
    const orgId = orgByPool.get(seed.poolId);
    if (orgId === undefined) {
      console.warn(`[seed] pool '${seed.poolId}' not found — skipped`);
      continue;
    }

    const inserted = await withOrgContext(orgId, async (client) => {
      const res = await client.query(
        `WITH slice AS (
           SELECT stop_id FROM transit_stops
           WHERE org_id = $4
           ORDER BY length(stop_id), stop_id
           OFFSET $2 LIMIT $3
         ), wanted AS (
           SELECT stop_id FROM slice
           UNION
           SELECT unnest($5::text[])
         )
         INSERT INTO stop_pool_memberships (stop_id, pool_id, org_id, shift_type, active)
         SELECT w.stop_id, $1, $4, NULL, true
         FROM wanted w
         WHERE EXISTS (SELECT 1 FROM transit_stops t WHERE t.stop_id = w.stop_id)
         ON CONFLICT (stop_id, pool_id) DO NOTHING`,
        [seed.poolId, seed.offset, seed.count, orgId, seed.forceInclude ?? []],
      );
      return res.rowCount ?? 0;
    });

    console.log(`[seed] ${seed.poolId}: +${inserted} membership rows`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
