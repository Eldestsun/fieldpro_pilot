import {
  pool,
  test,
  assert,
  assertEqual,
  deriveClientVisitIdLocal,
  FIXTURE_ACTOR_OID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import { completeStop } from "../../src/domains/routeRunStop/cleanLogService";
import type { InfraIssueInput } from "../../src/domains/routeRunStop/infrastructureIssueService";

/**
 * ISSUE-031 Stage 2 — infrastructure_issues write-clip (the LAST of the five
 * living-table clips). Proves the dual-write to public.infrastructure_issues is
 * gone and that an infra-issue stop completion now writes ONLY canonical:
 *
 *   - WRITE-CLIP PROOF: a completed stop carrying infra issues produces a ZERO
 *     row-delta on public.infrastructure_issues (the mirror is frozen).
 *   - CANONICAL-INTACT PROOF: all 8 disjoint infra *_present observation types
 *     still emit to core.observations for the visit, with cause/component/notes
 *     threaded into the observation payload — independent of the removed mirror.
 *
 * needs_facilities is intentionally NOT carried (ISSUE-034 founder decision —
 * always-true-when-row-exists, zero information). infra severity is intentionally
 * NULL in canonical (KCM does not grade infra magnitude). reported_by was a
 * constant 0 transit-adapter field carrying no worker identity.
 */

// One input per distinct infra *_present canonical type. The issue_type strings are
// the UI keys that mapInfraIssue() normalizes; each maps to a distinct canonical type.
const INFRA_INPUTS: InfraIssueInput[] = [
  { issue_type: "glass_damage",         cause: "vandalism", component: "shelter_glass", notes: "n1" },
  { issue_type: "graffiti",             cause: "vandalism", component: "panel",         notes: "n2" },
  { issue_type: "receptacle_damage",    cause: "wear",      component: "can",           notes: "n3" },
  { issue_type: "shelter_panel_damage", cause: "impact",    component: "panel",         notes: "n4" },
  { issue_type: "lighting_failure",     cause: "electrical", component: "light",        notes: "n5" },
  { issue_type: "landscape_obstruction", cause: "growth",   component: "approach",      notes: "n6" },
  { issue_type: "structural_damage",    cause: "impact",    component: "frame",         notes: "n7" },
  { issue_type: "other_infra_issue",    cause: "unknown",   component: "misc",          notes: "n8" },
];

// The 8 disjoint canonical observation_type values the inputs above must produce.
const EXPECTED_CANONICAL_TYPES = [
  "glass_damage_present",
  "graffiti_present",
  "receptacle_damage_present",
  "shelter_panel_damage_present",
  "lighting_failure_present",
  "access_obstructed_by_landscape",
  "structural_damage_present",
  "other_infrastructure_issue_present",
].sort();

test("infra write-clip: completeStop writes 0 infrastructure_issues rows; all 8 infra *_present observations still emit canonically", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    // ── BEFORE: global mirror row count (RLS-free table; count is stable across the
    //    transaction except for any write completeStop itself would make).
    const before = await client.query(`SELECT count(*)::int AS n FROM public.infrastructure_issues`);
    const beforeCount = before.rows[0].n as number;

    // ── Drive the live write path with all 8 infra issue types.
    const completed = await completeStop(client, f.routeRunStopId, {
      user_id: 999999, // worker identity — must NOT surface anywhere
      duration_minutes: 5,
      infraIssues: INFRA_INPUTS,
      actorOid: FIXTURE_ACTOR_OID,
    });
    assert(completed !== null, "completeStop returned null (stop not found)");

    // ── WRITE-CLIP PROOF: zero new rows in the frozen mirror.
    const after = await client.query(`SELECT count(*)::int AS n FROM public.infrastructure_issues`);
    assertEqual(
      after.rows[0].n as number,
      beforeCount,
      "completeStop must write ZERO public.infrastructure_issues rows (Stage-2 clip)",
    );

    // ── Resolve the canonical visit.
    const visitRow = await client.query(
      `SELECT id FROM core.visits WHERE client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)],
    );
    assertEqual(visitRow.rowCount, 1, "exactly one visit for the fixture stop");
    const visitId = Number(visitRow.rows[0].id);

    // ── CANONICAL-INTACT PROOF: all 8 distinct infra *_present types emitted.
    const obs = await client.query(
      `SELECT observation_type, payload
       FROM core.observations
       WHERE visit_id = $1
         AND observation_type = ANY($2::text[])`,
      [visitId, EXPECTED_CANONICAL_TYPES],
    );
    const gotTypes = obs.rows.map((r) => r.observation_type).sort();
    assertEqual(
      JSON.stringify(gotTypes),
      JSON.stringify(EXPECTED_CANONICAL_TYPES),
      `all 8 infra *_present types must emit to core.observations (got: ${gotTypes.join(", ")})`,
    );

    // ── Detail-carry: cause/component/notes reach the observation payload (additive).
    for (const row of obs.rows) {
      const p = row.payload || {};
      assert(
        typeof p.cause === "string" && typeof p.component === "string" && typeof p.notes === "string",
        `observation ${row.observation_type} must carry cause/component/notes in payload (got ${JSON.stringify(p)})`,
      );
      // severity intentionally absent — KCM does not grade infra magnitude.
      assert(!("severity" in p), `observation ${row.observation_type} payload must NOT invent a severity`);
      // needs_facilities intentionally dropped — never carried to canonical.
      assert(!("needs_facilities" in p), `observation ${row.observation_type} must NOT carry needs_facilities`);
    }
  } finally {
    await releaseFixture(client, f);
  }
});
