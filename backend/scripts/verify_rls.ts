/**
 * RLS verification — Tier 7 (core.*) + Phase 1 (public.* tables with org_id).
 *
 * Creates two ephemeral organizations, inserts test rows for each org across
 * verified tables, then proves that querying under each org's context returns
 * only that org's rows.
 *
 * Run after every migration that touches canonical tables:
 *   pnpm --filter backend exec ts-node scripts/verify_rls.ts
 *
 * Exits 0 on PASS, 1 on FAIL.
 */

import { pool, withOrgContext } from "../src/db";

const TEST_ORG_A_NAME = "__rls_verify_org_a__";
const TEST_ORG_B_NAME = "__rls_verify_org_b__";
const P1_POOL_A_ID = "rls-p1-pool-a";
const P1_POOL_B_ID = "rls-p1-pool-b";
const P1_STOP_A_ID = "rls-p1-stop-a";
const P1_STOP_B_ID = "rls-p1-stop-b";

async function cleanup(orgAId?: number, orgBId?: number): Promise<void> {
  // Cleanup runs without org context (migration-bypass) so it can see and
  // delete both orgs' rows.
  const client = await pool.connect();
  try {
    // Phase 1 public table cleanup
    await client.query(
      `DELETE FROM public.transit_stops WHERE stop_id IN ($1, $2)`,
      [P1_STOP_A_ID, P1_STOP_B_ID]
    );
    await client.query(
      `DELETE FROM public.route_pools WHERE id IN ($1, $2)`,
      [P1_POOL_A_ID, P1_POOL_B_ID]
    );
    // Tier 7 core.locations cleanup
    if (orgAId !== undefined) {
      await client.query(`DELETE FROM core.locations WHERE org_id = $1`, [orgAId]);
    }
    if (orgBId !== undefined) {
      await client.query(`DELETE FROM core.locations WHERE org_id = $1`, [orgBId]);
    }
    await client.query(
      `DELETE FROM organizations WHERE name IN ($1, $2)`,
      [TEST_ORG_A_NAME, TEST_ORG_B_NAME]
    );
  } finally {
    client.release();
  }
}

async function verifyRLS(): Promise<boolean> {
  let orgAId: number | undefined;
  let orgBId: number | undefined;

  try {
    // ---- Setup (migration-bypass: no org context set) ----
    const setupClient = await pool.connect();
    try {
      // Ensure no stale rows from a previous failed run.
      await setupClient.query(
        `DELETE FROM core.locations WHERE org_id IN (
           SELECT id FROM organizations WHERE name IN ($1, $2)
         )`,
        [TEST_ORG_A_NAME, TEST_ORG_B_NAME]
      );
      await setupClient.query(
        `DELETE FROM organizations WHERE name IN ($1, $2)`,
        [TEST_ORG_A_NAME, TEST_ORG_B_NAME]
      );

      const a = await setupClient.query(
        `INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`,
        [TEST_ORG_A_NAME]
      );
      const b = await setupClient.query(
        `INSERT INTO organizations (name, slug) VALUES ($1, $1) RETURNING id`,
        [TEST_ORG_B_NAME]
      );
      orgAId = a.rows[0].id;
      orgBId = b.rows[0].id;

      await setupClient.query(
        `INSERT INTO core.locations (org_id, location_type, label)
         VALUES ($1, 'transit_stop', 'rls-verify-A')`,
        [orgAId]
      );
      await setupClient.query(
        `INSERT INTO core.locations (org_id, location_type, label)
         VALUES ($1, 'transit_stop', 'rls-verify-B')`,
        [orgBId]
      );

      // ---- Phase 1: public.route_pools ----
      await setupClient.query(
        `DELETE FROM public.transit_stops WHERE stop_id IN ($1, $2)`,
        [P1_STOP_A_ID, P1_STOP_B_ID]
      );
      await setupClient.query(
        `DELETE FROM public.route_pools WHERE id IN ($1, $2)`,
        [P1_POOL_A_ID, P1_POOL_B_ID]
      );
      await setupClient.query(
        `INSERT INTO public.route_pools (id, label, active, org_id)
         VALUES ($1, 'RLS P1 Verify A', true, $2)`,
        [P1_POOL_A_ID, orgAId]
      );
      await setupClient.query(
        `INSERT INTO public.route_pools (id, label, active, org_id)
         VALUES ($1, 'RLS P1 Verify B', true, $2)`,
        [P1_POOL_B_ID, orgBId]
      );

      // ---- Phase 1: public.transit_stops ----
      await setupClient.query(
        `INSERT INTO public.transit_stops
           (stop_id, on_street_name, intersection_loc, trf_district_code, org_id)
         VALUES ($1, 'RLS P1 St A', 'RLS & Ave A', 'RLS-P1', $2)`,
        [P1_STOP_A_ID, orgAId]
      );
      await setupClient.query(
        `INSERT INTO public.transit_stops
           (stop_id, on_street_name, intersection_loc, trf_district_code, org_id)
         VALUES ($1, 'RLS P1 St B', 'RLS & Ave B', 'RLS-P1', $2)`,
        [P1_STOP_B_ID, orgBId]
      );
    } finally {
      setupClient.release();
    }

    // ---- Check A: under org A context, must see only A's row ----
    const aSeenForA = await withOrgContext(orgAId!, async (c) => {
      const res = await c.query(
        `SELECT COUNT(*)::int AS n FROM core.locations WHERE label LIKE 'rls-verify-%'`
      );
      return res.rows[0].n as number;
    });
    const bSeenForA = await withOrgContext(orgAId!, async (c) => {
      const res = await c.query(
        `SELECT COUNT(*)::int AS n FROM core.locations WHERE org_id = $1`,
        [orgBId]
      );
      return res.rows[0].n as number;
    });

    // ---- Check B: under org B context, must see only B's row ----
    const bSeenForB = await withOrgContext(orgBId!, async (c) => {
      const res = await c.query(
        `SELECT COUNT(*)::int AS n FROM core.locations WHERE label LIKE 'rls-verify-%'`
      );
      return res.rows[0].n as number;
    });
    const aSeenForB = await withOrgContext(orgBId!, async (c) => {
      const res = await c.query(
        `SELECT COUNT(*)::int AS n FROM core.locations WHERE org_id = $1`,
        [orgAId]
      );
      return res.rows[0].n as number;
    });

    // ---- Check C: WITH CHECK blocks cross-tenant inserts ----
    let writeBlocked = false;
    try {
      await withOrgContext(orgAId!, async (c) => {
        await c.query(
          `INSERT INTO core.locations (org_id, location_type, label)
           VALUES ($1, 'transit_stop', 'rls-verify-cross-write')`,
          [orgBId]
        );
      });
    } catch (err) {
      writeBlocked = true;
    }

    // ---- Check D: migration-bypass (no context) sees both rows ----
    const adminClient = await pool.connect();
    let bypassSeesBoth = 0;
    try {
      const res = await adminClient.query(
        `SELECT COUNT(*)::int AS n FROM core.locations WHERE label LIKE 'rls-verify-%'`
      );
      bypassSeesBoth = res.rows[0].n as number;
    } finally {
      adminClient.release();
    }

    // ---- Phase 1 checks: public.route_pools ----
    const p1PoolsVisibleToA = await withOrgContext(orgAId!, async (c) => {
      const res = await c.query(
        `SELECT COUNT(*)::int AS n FROM public.route_pools WHERE id IN ($1, $2)`,
        [P1_POOL_A_ID, P1_POOL_B_ID]
      );
      return res.rows[0].n as number;
    });
    const p1PoolsVisibleToB = await withOrgContext(orgBId!, async (c) => {
      const res = await c.query(
        `SELECT COUNT(*)::int AS n FROM public.route_pools WHERE id IN ($1, $2)`,
        [P1_POOL_A_ID, P1_POOL_B_ID]
      );
      return res.rows[0].n as number;
    });

    // ---- Phase 1 checks: public.transit_stops ----
    const p1StopsVisibleToA = await withOrgContext(orgAId!, async (c) => {
      const res = await c.query(
        `SELECT COUNT(*)::int AS n FROM public.transit_stops WHERE stop_id IN ($1, $2)`,
        [P1_STOP_A_ID, P1_STOP_B_ID]
      );
      return res.rows[0].n as number;
    });
    const p1StopsVisibleToB = await withOrgContext(orgBId!, async (c) => {
      const res = await c.query(
        `SELECT COUNT(*)::int AS n FROM public.transit_stops WHERE stop_id IN ($1, $2)`,
        [P1_STOP_A_ID, P1_STOP_B_ID]
      );
      return res.rows[0].n as number;
    });

    const checks: Array<[string, boolean, unknown]> = [
      // Tier 7: core.locations
      ["[T7] org A sees exactly 1 verify row",       aSeenForA === 1,       aSeenForA],
      ["[T7] org A sees 0 rows from org B",          bSeenForA === 0,       bSeenForA],
      ["[T7] org B sees exactly 1 verify row",       bSeenForB === 1,       bSeenForB],
      ["[T7] org B sees 0 rows from org A",          aSeenForB === 0,       aSeenForB],
      ["[T7] cross-tenant INSERT blocked by RLS",    writeBlocked === true, writeBlocked],
      ["[T7] migration-bypass sees both rows",       bypassSeesBoth === 2,  bypassSeesBoth],
      // Phase 1: public.route_pools
      ["[P1] route_pools: org A sees only A's pool", p1PoolsVisibleToA === 1, p1PoolsVisibleToA],
      ["[P1] route_pools: org B sees only B's pool", p1PoolsVisibleToB === 1, p1PoolsVisibleToB],
      // Phase 1: public.transit_stops
      ["[P1] transit_stops: org A sees only A's stop", p1StopsVisibleToA === 1, p1StopsVisibleToA],
      ["[P1] transit_stops: org B sees only B's stop", p1StopsVisibleToB === 1, p1StopsVisibleToB],
    ];

    let allPass = true;
    for (const [name, ok, observed] of checks) {
      const tag = ok ? "PASS" : "FAIL";
      console.log(`  [${tag}] ${name} (observed=${JSON.stringify(observed)})`);
      if (!ok) allPass = false;
    }

    return allPass;
  } finally {
    await cleanup(orgAId, orgBId);
  }
}

(async () => {
  console.log("RLS verification — Tier 7 (core.*) + Phase 1 (public.*)");
  let ok = false;
  try {
    ok = await verifyRLS();
  } catch (err) {
    console.error("verify_rls: unexpected error:", err);
    ok = false;
  } finally {
    await pool.end();
  }
  if (ok) {
    console.log("\nRLS verification: PASS");
    process.exit(0);
  } else {
    console.error("\nRLS verification: FAIL");
    process.exit(1);
  }
})();
