import {
  test,
  assert,
  assertEqual,
  FIXTURE_ACTOR_OID,
  FIXTURE_ORG_ID,
  FIXTURE_LOCATION_ID,
  FIXTURE_ASSET_ID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";
import { emitObservationsForStop, StopUiPayload } from "../../src/domains/observation/observationService";

// ============================================================================
// ISSUE-072 — free-text notes land in core.visit_notes at (visit, category)
// grain, NOT replicated into per-observation payload.
//
// Proves the real write chain (emitObservationsForStop -> insertVisitNotes):
//   1. a safety note + an infra note each produce exactly ONE visit_notes row,
//      at the correct category, with the exact text;
//   2. the note is NOT stamped into any observation.payload (the denormalization
//      this card removed);
//   3. per-issue-type cause/component ARE still on the infra observation payload
//      (only the free-text note moved);
//   4. re-running the same submission updates in place (offline-replay idempotent),
//      never duplicating the (visit, category) row.
// ============================================================================

async function readVisitNotes(client: any, visitId: number) {
  const res = await client.query(
    `SELECT category, note FROM core.visit_notes WHERE visit_id = $1 ORDER BY category`,
    [visitId]
  );
  return res.rows as Array<{ category: string; note: string }>;
}

const SAFETY_NOTE = "test-note safety: encampment adjacent, serviced with caution";
const INFRA_NOTE = "test-note infra: cracked glass lower-left panel";

function payload(): StopUiPayload {
  return {
    safetyConcern: true,
    safetyHazards: ["encampment", "biohazard"],
    hazard_severity: "high",
    hazard_notes: SAFETY_NOTE,
    infrastructurePresent: true,
    // the capture UI replicates the single infra note across every entry;
    // the write path must collapse that to ONE visit_notes row.
    infraIssueDetails: [
      { issue_type: "glass_damage", cause: "vandalism", component: "glass", notes: INFRA_NOTE },
      { issue_type: "graffiti", cause: "vandalism", component: "graffiti", notes: INFRA_NOTE },
    ],
  };
}

test("ISSUE-072: safety + infra notes each land as ONE visit_notes row at correct grain", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload: payload(),
      client,
    });

    const notes = await readVisitNotes(client, visitId);
    assertEqual(notes.length, 2, "exactly two visit_notes rows (one safety, one infra)");
    assertEqual(notes[0].category, "infra", "infra row present (alpha-ordered first)");
    assertEqual(notes[0].note, INFRA_NOTE, "infra note text exact — collapsed from 2 replicated entries to 1");
    assertEqual(notes[1].category, "safety", "safety row present");
    assertEqual(notes[1].note, SAFETY_NOTE, "safety note text exact");

    // The denormalization is gone: no observation.payload carries 'notes'.
    const withNotes = await client.query(
      `SELECT count(*)::int AS n FROM core.observations WHERE visit_id = $1 AND payload ? 'notes'`,
      [visitId]
    );
    assertEqual(withNotes.rows[0].n, 0, "no observation payload carries a replicated 'notes' key");

    // But per-issue-type cause/component still ride on the infra observation.
    const infraObs = await client.query(
      `SELECT payload FROM core.observations WHERE visit_id = $1 AND observation_type = 'glass_damage_present'`,
      [visitId]
    );
    assertEqual(infraObs.rows[0].payload.cause, "vandalism", "cause stays on infra observation payload");
    assertEqual(infraObs.rows[0].payload.component, "glass", "component stays on infra observation payload");
    assert(!("notes" in infraObs.rows[0].payload), "notes key absent from infra observation payload");
  } finally {
    await releaseFixture(client, f);
  }
});

test("ISSUE-072: re-submitting updates the note in place — (visit, category) never duplicates", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    await emitObservationsForStop({
      phase: "submit", visitId, orgId: FIXTURE_ORG_ID, assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID, actorOid: FIXTURE_ACTOR_OID,
      uiPayload: { safetyConcern: true, safetyHazards: ["fire"], hazard_notes: "first" },
      client,
    });
    // replay with a corrected note
    await emitObservationsForStop({
      phase: "submit", visitId, orgId: FIXTURE_ORG_ID, assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID, actorOid: FIXTURE_ACTOR_OID,
      uiPayload: { safetyConcern: true, safetyHazards: ["fire"], hazard_notes: "corrected" },
      client,
    });

    const notes = await readVisitNotes(client, visitId);
    const safety = notes.filter(n => n.category === "safety");
    assertEqual(safety.length, 1, "still exactly one safety row after replay (no duplicate)");
    assertEqual(safety[0].note, "corrected", "note updated in place to the latest submission");
  } finally {
    await releaseFixture(client, f);
  }
});
