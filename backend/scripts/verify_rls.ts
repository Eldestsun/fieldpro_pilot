/**
 * Tier 7 — RLS verification.
 *
 * Creates two ephemeral organizations, inserts one core.locations row for
 * each, then proves that querying under org A's context returns only org
 * A's row (and zero rows from org B). Repeats the check under org B.
 *
 * Run after every migration that touches canonical tables:
 *   pnpm --filter backend exec ts-node scripts/verify_rls.ts
 *
 * Exits 0 on PASS, 1 on FAIL.
 */

import { pool, withOrgContext } from "../src/db";

const TEST_ORG_A_NAME = "__rls_verify_org_a__";
const TEST_ORG_B_NAME = "__rls_verify_org_b__";

async function cleanup(orgAId?: number, orgBId?: number): Promise<void> {
  // Cleanup runs without org context (migration-bypass) so it can see and
  // delete both orgs' rows.
  const client = await pool.connect();
  try {
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

    const checks: Array<[string, boolean, unknown]> = [
      ["org A sees exactly 1 verify row",       aSeenForA === 1,                aSeenForA],
      ["org A sees 0 rows from org B",          bSeenForA === 0,                bSeenForA],
      ["org B sees exactly 1 verify row",       bSeenForB === 1,                bSeenForB],
      ["org B sees 0 rows from org A",          aSeenForB === 0,                aSeenForB],
      ["cross-tenant INSERT blocked by RLS",    writeBlocked === true,          writeBlocked],
      ["migration-bypass sees both rows",       bypassSeesBoth === 2,           bypassSeesBoth],
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
  console.log("Tier 7 — RLS verification");
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
