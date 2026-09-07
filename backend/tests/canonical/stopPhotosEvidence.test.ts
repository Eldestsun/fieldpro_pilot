import {
  pool,
  test,
  assert,
  assertEqual,
  FIXTURE_ACTOR_OID,
  FIXTURE_ORG_ID,
  acquireRouteRunFixture,
  releaseFixture,
  deriveClientVisitIdLocal,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";
import { createStopPhotos } from "../../src/domains/routeRunStop/stopPhotosService";

// PATTERN-001/PHOTOS regression (2026-08-18) — the coverage hole that let the
// photos route ship green while silently writing nothing:
// ulRoutes' POST /route-runs/:runId/stops/:stopId/photos passed the BARE POOL
// into createStopPhotos; its core.visits lookup ran without app.current_org_id
// against FORCE RLS, saw no visit, skipped core.evidence — and the route still
// returned ok:true. Caught live by the first agent write-path smoke
// (AGENT-SMOKE-1 finding #2), root-caused via the founder-verification trace.
// These tests pin the service contract under BOTH conditions so the failure
// mode is a red test, not a silent skip.

test("PATTERN-001/PHOTOS: under org context, createStopPhotos writes evidence + encrypted sidecar atomically", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    // Join the caller's transaction exactly as the fixed route does (Q-D).
    await client.query("BEGIN");
    await createStopPhotos(client, {
      routeRunStopId: f.routeRunStopId,
      userOid: FIXTURE_ACTOR_OID,
      s3Keys: ["test/pattern001-photos-regression.png"],
      kind: "completion",
    });
    await client.query("COMMIT");

    const ev = await client.query(
      `SELECT e.id, e.kind, s.actor_ref, s.actor_ref_ciphertext IS NOT NULL AS has_ct
       FROM core.evidence e
       LEFT JOIN core.evidence_actor_audit s ON s.evidence_id = e.id
       WHERE e.storage_key = 'test/pattern001-photos-regression.png'`,
    );
    assertEqual(ev.rowCount, 1, "one core.evidence row per uploaded key");
    assertEqual(ev.rows[0].kind, "completion", "evidence kind preserved");
    assertEqual(ev.rows[0].actor_ref, "encrypted", "sidecar actor_ref is the non-identifying sentinel");
    assert(ev.rows[0].has_ct === true, "sidecar carries the ciphertext (ISSUE-058)");
  } finally {
    await releaseFixture(client, f);
  }
});

test("ISSUE-063: photo upload with NO pre-existing visit ensures the visit, so evidence lands (offline replay order)", async () => {
  // The offline replay order is UPLOAD_STOP_PHOTOS → START_STOP → …, so photos
  // reach the server BEFORE the visit exists. It also happens for a started
  // stop whose visit was never created (a zombie). Before the fix,
  // createStopPhotos found no visit, skipped core.evidence, and the route
  // returned 200 anyway — the photo silently vanished and completion 400'd.
  // The photo route now calls ensureVisitForRouteRunStop first; this pins that.
  const { client, f } = await acquireRouteRunFixture();
  try {
    // Deliberately DO NOT create the visit up front — reproduce photo-before-start.
    const before = await client.query(
      `SELECT COUNT(*)::int AS n FROM core.visits WHERE client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)],
    );
    assertEqual(before.rows[0].n, 0, "precondition: no visit exists yet");

    // Exactly the fixed route's sequence: ensure the visit, then write evidence.
    await client.query("BEGIN");
    await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    await createStopPhotos(client, {
      routeRunStopId: f.routeRunStopId,
      userOid: FIXTURE_ACTOR_OID,
      s3Keys: ["test/issue063-photo-before-visit.png"],
      kind: "completion",
    });
    await client.query("COMMIT");

    const ev = await client.query(
      `SELECT COUNT(*)::int AS n FROM core.evidence
       WHERE storage_key = 'test/issue063-photo-before-visit.png'`,
    );
    assertEqual(ev.rows[0].n, 1, "evidence lands even though no visit existed at upload time");

    // Idempotency: a subsequent START_STOP-style ensure returns the SAME visit,
    // never a duplicate (both key on deriveClientVisitId).
    const visits = await client.query(
      `SELECT COUNT(*)::int AS n FROM core.visits WHERE client_visit_id = $1`,
      [deriveClientVisitIdLocal(f.routeRunStopId)],
    );
    assertEqual(visits.rows[0].n, 1, "exactly one visit — ensure is idempotent across upload + start");
  } finally {
    await releaseFixture(client, f);
  }
});

test("PATTERN-001/PHOTOS: a context-less connection cannot even SEE the visit — the exact silent-skip condition", async () => {
  const { client, f } = await acquireRouteRunFixture();
  try {
    await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    // A separate client with NO org context — what the bare-pool call site
    // effectively used. The committed visit must be invisible (that is the
    // trap this file exists to document); the FIXED route never takes this
    // path because it resolves org fail-closed and wraps in withOrgContext.
    //
    // The GUC is cleared EXPLICITLY because pooled connections recycle session
    // state: a client whose previous user set app.current_org_id and never
    // reset it leaks that context to the next checkout. (That leakage is also
    // why the production bug was INTERMITTENT — the bare-pool call sometimes
    // rode a still-contexted connection and worked, sometimes hit a fresh one
    // and silently skipped. First run of this very test caught a recycled
    // context: expected 0 visits, saw 4.)
    const bare = await pool.connect();
    try {
      await bare.query(`SELECT set_config('app.current_org_id', '', false)`);
      const r = await bare.query(
        `SELECT COUNT(*)::int AS n FROM core.visits WHERE client_visit_id IS NOT NULL`,
      );
      assertEqual(
        r.rows[0].n, 0,
        "FORCE RLS with no org context returns zero visits — any code passing a bare pool into the photo path re-creates the silent evidence skip",
      );
    } finally {
      bare.release();
    }
  } finally {
    await releaseFixture(client, f);
  }
});
