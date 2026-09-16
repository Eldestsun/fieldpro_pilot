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
 *   - WRITE-CLIP PROOF (now structural): public.infrastructure_issues was
 *     physically dropped in ISSUE-037, so a completed stop carrying infra issues
 *     cannot write the mirror at all — the table is gone.
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
    // ── WRITE-CLIP PROOF, now STRUCTURAL (Stage 2 → ISSUE-037 Stage 3): the mirror
    //    is not merely un-written — public.infrastructure_issues was physically
    //    dropped, so a completion cannot write it at all.
    const mirrorGone = await client.query(`SELECT to_regclass('public.infrastructure_issues') AS reg`);
    assertEqual(
      mirrorGone.rows[0].reg,
      null,
      "public.infrastructure_issues dropped (ISSUE-037) — no adapter mirror possible",
    );

    // ── Drive the live write path with all 8 infra issue types.
    const completed = await completeStop(client, f.routeRunStopId, {
      user_id: 999999, // worker identity — must NOT surface anywhere
      duration_minutes: 5,
      infraIssues: INFRA_INPUTS,
      actorOid: FIXTURE_ACTOR_OID,
    });
    assert(completed !== null, "completeStop returned null (stop not found)");

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

    // ── Detail-carry: per-issue-type cause/component reach the observation payload
    // (additive). ISSUE-072: the free-text `notes` no longer rides in payload — it
    // lands once in core.visit_notes (category='infra'); see visitNotesGrain.test.
    for (const row of obs.rows) {
      const p = row.payload || {};
      assert(
        typeof p.cause === "string" && typeof p.component === "string",
        `observation ${row.observation_type} must carry cause/component in payload (got ${JSON.stringify(p)})`,
      );
      // ISSUE-072: notes moved to core.visit_notes — never replicated per-observation.
      assert(!("notes" in p), `observation ${row.observation_type} payload must NOT carry a replicated notes key (ISSUE-072)`);
      // severity intentionally absent — KCM does not grade infra magnitude.
      assert(!("severity" in p), `observation ${row.observation_type} payload must NOT invent a severity`);
      // needs_facilities intentionally dropped — never carried to canonical.
      assert(!("needs_facilities" in p), `observation ${row.observation_type} must NOT carry needs_facilities`);
    }

    // ── ISSUE-072: the single infra free-text note landed once in core.visit_notes,
    // not replicated across the 8 observations.
    const vn = await client.query(
      `SELECT category, note FROM core.visit_notes WHERE visit_id = $1`,
      [visitId],
    );
    assertEqual(vn.rows.length, 1, "exactly one infra visit_notes row (collapsed from 8 replicated entries)");
    assertEqual(vn.rows[0].category, "infra", "the note is categorized infra");
  } finally {
    await releaseFixture(client, f);
  }
});
