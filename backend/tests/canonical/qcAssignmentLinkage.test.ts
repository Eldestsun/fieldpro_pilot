import {
  pool,
  test,
  assert,
  assertEqual,
  FIXTURE_ORG_ID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import type { PoolClient } from "pg";

// Q-C (ISSUE-031) — run↔visit linkage hardening regression tests
// (migration-sequence Phase 3, Step 3.1)
//
// The linkage contract these tests pin down:
//   • core.assignments ↔ route_runs is a STRING translation
//     (source_system='route_runs' + source_ref = run id) — never an FK from
//     canonical into a vertical table.
//   • The linkage is deliberately 1:N run→assignments (one assignment PER
//     STOP); the unique unit is (source_system, source_ref, location).
//     [Surfaced: the migration-sequence artifact's "1:1" wording holds at
//     this grain, not run grain — see the Q-C changelog.]
//   • idx_core_assignments_source_linkage makes createRouteRun's
//     ON CONFLICT DO NOTHING a real idempotency guarantee (it was inert
//     before the index existed — nothing could conflict).

// Mirrors the createRouteRun assignment INSERT (the production statement this
// contract governs), minus the sidecar half exercised by assignments.test.ts.
async function insertLinkageAssignments(client: PoolClient, routeRunId: number) {
  return client.query(
    `
    INSERT INTO core.assignments (
      org_id, assignment_type, status, location_id,
      primary_asset_id, planned_for_date,
      source_system, source_ref, meta
    )
    SELECT
      a.org_id, 'transit_stop_clean', 'planned', loc.location_id,
      s.asset_id, CURRENT_DATE,
      'route_runs', $1::text, '{}'::jsonb
    FROM route_run_stops rrs
    JOIN public.stops s ON s.stop_id = rrs.stop_id
    JOIN public.assets a ON a.id = rrs.asset_id
    LEFT JOIN core.v_locations_transit loc ON loc.stop_id = rrs.stop_id
    WHERE rrs.route_run_id = $1::bigint
    ON CONFLICT DO NOTHING
    RETURNING id, location_id
    `,
    [routeRunId],
  );
}

test("Q-C: linkage index exists, is UNIQUE, and covers (source_system, source_ref) prefix", async () => {
  const res = await pool.query(
    `SELECT indexdef FROM pg_indexes
     WHERE schemaname = 'core' AND tablename = 'assignments'
       AND indexname = 'idx_core_assignments_source_linkage'`,
  );
  assertEqual(res.rowCount, 1, "idx_core_assignments_source_linkage must exist on core.assignments");
  const def = res.rows[0].indexdef as string;
  assert(/CREATE UNIQUE INDEX/i.test(def), "linkage index must be UNIQUE");
  assert(
    def.includes("source_system") && def.includes("source_ref") && def.includes("COALESCE"),
    `linkage index must cover (source_system, source_ref, COALESCE(location_id, -1)) — got: ${def}`,
  );
});

test("Q-C: ON CONFLICT DO NOTHING is now a real idempotency guarantee (second insert = 0 rows)", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const first = await insertLinkageAssignments(client, f.routeRunId);
    assertEqual(first.rowCount, 1, "first linkage insert writes one assignment for the one-stop fixture run");

    const second = await insertLinkageAssignments(client, f.routeRunId);
    assertEqual(
      second.rowCount, 0,
      "re-running the linkage insert must insert ZERO rows — the unique index arbitrates ON CONFLICT",
    );

    const total = await client.query(
      `SELECT COUNT(*)::int AS n FROM core.assignments
       WHERE source_system = 'route_runs' AND source_ref = $1::text`,
      [String(f.routeRunId)],
    );
    assertEqual(total.rows[0].n, 1, "exactly one assignment per run×location after the double-fire");
  } finally {
    await releaseFixture(client, f);
  }
});

test("Q-C: every route_runs assignment resolves to exactly one same-org run (string linkage integrity)", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    await insertLinkageAssignments(client, f.routeRunId);

    // Dangling: assignment whose source_ref matches no route_run. Must be zero.
    const dangling = await client.query(
      `SELECT COUNT(*)::int AS n FROM core.assignments a
       WHERE a.source_system = 'route_runs'
         AND NOT EXISTS (SELECT 1 FROM route_runs rr WHERE rr.id::text = a.source_ref)`,
    );
    assertEqual(dangling.rows[0].n, 0, "no assignment may carry a source_ref that resolves to zero route_runs");

    // Resolution multiplicity: source_ref → route_runs is exactly 1 (pkey),
    // and the resolved run shares the assignment's org.
    const crossOrg = await client.query(
      `SELECT COUNT(*)::int AS n FROM core.assignments a
       JOIN route_runs rr ON rr.id::text = a.source_ref
       WHERE a.source_system = 'route_runs' AND rr.org_id <> a.org_id`,
    );
    assertEqual(crossOrg.rows[0].n, 0, "a linkage must never resolve across orgs");
  } finally {
    await releaseFixture(client, f);
  }
});

test("Q-C: canonical never FKs into the vertical — no FK from core.assignments to route_runs", async () => {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM pg_constraint c
     JOIN pg_class src ON src.oid = c.conrelid
     JOIN pg_namespace srcns ON srcns.oid = src.relnamespace
     JOIN pg_class tgt ON tgt.oid = c.confrelid
     WHERE c.contype = 'f'
       AND srcns.nspname = 'core' AND src.relname = 'assignments'
       AND tgt.relname = 'route_runs'`,
  );
  assertEqual(
    res.rows[0].n, 0,
    "core.assignments must not FK into public.route_runs — the linkage stays a string translation (Q-C hard rule)",
  );
});
