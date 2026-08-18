import "dotenv/config";
import {
  pool,
  test,
  assert,
  assertEqual,
  FIXTURE_ORG_ID,
} from "../setup";
import { getIntelligencePool, withIntelligenceOrgContext } from "../../src/db";
import { rebuildStopRiskSnapshot } from "../../src/intelligence/riskMapService";

// ISSUE-018 — the intelligence channel boundary tests (PILOT-GATE, labor-safety)
//
// The claim being made runtime-binding: "labor-safe by structure, not policy."
// Before this wiring, the sidecar no-grant wall existed at the DB but the app
// read everything as fieldpro — the wall bound nothing at runtime. These tests
// prove the wall now binds ON THE RUNNING CONNECTION:
//   • the channel connects as intelligence_reader;
//   • every identity-bearing object is PERMISSION DENIED at the DB — sidecars,
//     identity_directory, route_runs — regardless of what future code does;
//   • the risk job executes end-to-end under the constrained role;
//   • RLS binds on the channel (NOBYPASSRLS + org context).

const IDENTITY_OBJECTS = [
  "core.visit_actor_audit",
  "core.observation_actor_audit",
  "core.evidence_actor_audit",
  "core.assignment_actor_audit",
  "public.identity_directory",
  // ISSUE-062: route_runs is now the identity-free operational frame (zero
  // identity columns — asserted below). It stays denied here deliberately:
  // granting the frame to intelligence_reader is a future, explicit
  // P4-Reporting decision, not a side effect of the extraction.
  "public.route_runs",
  // ISSUE-062: the app-only assignment sidecar — the plaintext worker↔route
  // store. Permanently walled from the intelligence channel.
  "public.route_run_assignment",
];

test("ISSUE-018: intelligence_reader grant posture — canonical reads + derived-output DML, NOBYPASSRLS", async () => {
  const reads = [
    "core.observations", "core.visits", "core.assignments", "core.evidence",
    "core.locations", "core.location_external_ids", "core.v_observation_normalized",
    "public.transit_stops", "public.stop_effort_history", "public.stop_risk_snapshot",
  ];
  for (const t of reads) {
    const r = await pool.query(`SELECT has_table_privilege('intelligence_reader', $1, 'SELECT') AS ok`, [t]);
    assert(r.rows[0].ok === true, `intelligence_reader must hold SELECT on ${t}`);
  }
  const dml = await pool.query(
    `SELECT has_table_privilege('intelligence_reader', 'public.stop_risk_snapshot', 'INSERT,DELETE') AS snap,
            has_table_privilege('intelligence_reader', 'public.stop_condition_history', 'INSERT') AS hist`,
  );
  assert(dml.rows[0].snap === true, "intelligence_reader must hold INSERT+DELETE on its own stop_risk_snapshot output");
  assert(dml.rows[0].hist === true, "intelligence_reader must hold INSERT on stop_condition_history");

  const role = await pool.query(`SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname='intelligence_reader'`);
  assert(role.rows[0].rolbypassrls === false && role.rows[0].rolsuper === false,
    "intelligence_reader must be NOBYPASSRLS / non-super — org isolation binds on the channel");
});

test("ISSUE-018: the wall is RUNTIME-BINDING — every identity object is permission-denied on the live channel", async () => {
  await withIntelligenceOrgContext(FIXTURE_ORG_ID, async (intel) => {
    const who = await intel.query(`SELECT current_user AS u`);
    assertEqual(who.rows[0].u, "intelligence_reader", "channel must connect as intelligence_reader");

    for (const obj of IDENTITY_OBJECTS) {
      let denied = false;
      try {
        await intel.query(`SELECT * FROM ${obj} LIMIT 1`);
      } catch (err: any) {
        // 42501 = insufficient_privilege — the structural denial we exist to prove
        denied = err?.code === "42501";
        if (!denied) throw err;
        // the failed statement aborts nothing (no open tx), continue probing
      }
      assert(denied, `intelligence channel must be PERMISSION DENIED on ${obj} — got a result instead`);
    }
  });
});

test("ISSUE-018: risk-map rebuild executes end-to-end under the constrained role", async () => {
  // The job itself sources the intelligence pool internally (no app-pool arg).
  const count = await rebuildStopRiskSnapshot(FIXTURE_ORG_ID);
  assert(typeof count === "number" && count >= 0, `rebuild returns a row count (got ${count})`);

  // And what it wrote is visible under org context on the same channel.
  const seen = await withIntelligenceOrgContext(FIXTURE_ORG_ID, async (intel) => {
    const r = await intel.query(`SELECT COUNT(*)::int AS n FROM stop_risk_snapshot`);
    return r.rows[0].n;
  });
  assertEqual(seen, count, "org-scoped channel read sees exactly the rebuilt snapshot rows");
});

test("ISSUE-018: RLS binds on the channel — context-less snapshot read sees zero rows", async () => {
  const bare = await getIntelligencePool().connect();
  try {
    const r = await bare.query(`SELECT COUNT(*)::int AS n FROM stop_risk_snapshot`);
    assertEqual(r.rows[0].n, 0, "no org context ⇒ zero rows (FORCE RLS, NOBYPASSRLS — PATTERN-001 is the contract)");
  } finally {
    bare.release();
  }
});

test("ISSUE-062: route_runs is the identity-free operational frame — zero identity columns", async () => {
  // The extraction's schema guarantee: reporting can be pointed at the frame
  // without an identity review, because there is nothing identity-shaped on it.
  const r = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'route_runs'
       AND (column_name IN ('assigned_user_oid', 'created_by_oid', 'user_id',
                            'actor_oid', 'captured_by_oid')
            OR column_name LIKE '%\\_oid')`,
  );
  assertEqual(
    r.rowCount ?? 0, 0,
    `route_runs must carry zero identity columns — found: ${
      r.rows.map((x: any) => x.column_name).join(", ") || "none"}`,
  );
});

test("ISSUE-062: no reporting-granted relation projects an identity column", async () => {
  // Sweep every relation intelligence_reader can SELECT: none may expose an
  // OID-shaped or user-id column. Converts the labor-safety claim from
  // review-time promise to red-PR-if-violated.
  const r = await pool.query(`
    SELECT g.table_schema || '.' || g.table_name AS rel, c.column_name
    FROM information_schema.role_table_grants g
    JOIN information_schema.columns c
      ON c.table_schema = g.table_schema AND c.table_name = g.table_name
    WHERE g.grantee = 'intelligence_reader' AND g.privilege_type = 'SELECT'
      AND (c.column_name LIKE '%\\_oid' OR c.column_name = 'oid'
           OR c.column_name = 'user_id' OR c.column_name = 'actor_ref')
  `);
  assertEqual(
    r.rowCount ?? 0, 0,
    `reporting-granted relation(s) project identity column(s): ${
      r.rows.map((x: any) => `${x.rel}.${x.column_name}`).join(", ") || "none"}`,
  );
});

test("ISSUE-018: fail-closed plumbing — missing orgId throws, never defaults", async () => {
  let threw = false;
  try {
    await withIntelligenceOrgContext("", async () => null);
  } catch (err: any) {
    threw = true;
    assert(/orgId is required/.test(String(err?.message)), "error names the missing orgId");
  }
  assert(threw, "withIntelligenceOrgContext must throw on empty orgId");
});
