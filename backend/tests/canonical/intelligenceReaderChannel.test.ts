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
  "public.route_runs",
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
