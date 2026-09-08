import type { AddressInfo } from "net";
import type { Server } from "http";
// Dev-bypass must be opted in before app.ts is required.
process.env.DEV_AUTH_BYPASS = "true";

import {
  pool,
  test,
  assert,
  assertEqual,
  FIXTURE_ACTOR_OID,
  FIXTURE_ORG_ID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";

// ============================================================================
// ISSUE-051 §5.7 — skip-with-hazard must emit its hazard observations INSIDE
// the same transaction as the visit close (not post-commit on a separate
// connection). This was the last live instance of the post-commit-emission
// anti-pattern: the complete-stop path was already atomic; the skip path
// committed the skipped visit (+reason_code) then emitted observations on a
// fresh pool connection with no retry — a failure after COMMIT silently lost
// the hazard observations, so canonical diverged from the recorded skip.
//
// There was NO skip-path test before this file. It pins the observable
// contract: one HTTP call produces the skipped visit AND its hazard presence
// observation together.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

test("ISSUE-051: skip-with-hazard writes the skipped visit AND its hazard observation atomically", async () => {
  const { client, f } = await acquireRouteRunFixture();
  let server: Server | undefined;
  try {
    // Pre-state the skip's precondition without the photo-upload dance:
    // ensure the visit (idempotent — the skip path will reuse it), then insert
    // the mandatory safety evidence the endpoint requires (kind='safety').
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
    await client.query(
      `INSERT INTO core.evidence (org_id, visit_id, observation_id, kind, storage_key)
       VALUES ($1, $2, NULL, 'safety', $3)`,
      [FIXTURE_ORG_ID, visitId, `test/issue051-safety-${f.routeRunStopId}.png`],
    );

    const srv = await startServer();
    server = srv.server;

    const res = await fetch(
      `${srv.baseUrl}/api/route-run-stops/${f.routeRunStopId}/skip-with-hazard`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Dev-Persona": "admin" },
        body: JSON.stringify({ hazard_types: ["encampment"], notes: "issue-051 test" }),
      },
    );
    assertEqual(res.status, 200, "skip-with-hazard should succeed (200)");

    // Read back on a fresh org-scoped connection — the HTTP handler committed.
    const check = await pool.connect();
    try {
      await check.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);

      const stop = await check.query(
        `SELECT status FROM route_run_stops WHERE id = $1`,
        [f.routeRunStopId],
      );
      assertEqual(stop.rows[0].status, "skipped", "stop row marked skipped");

      const visit = await check.query(
        `SELECT outcome, reason_code, ended_at IS NOT NULL AS ended FROM core.visits WHERE id = $1`,
        [visitId],
      );
      assertEqual(visit.rows[0].outcome, "skipped", "visit outcome = skipped");
      assertEqual(visit.rows[0].reason_code, "encampment", "visit reason_code carries the hazard");
      assert(visit.rows[0].ended === true, "visit is closed");

      // The atomic payoff: the hazard presence observation landed in the SAME
      // unit as the visit close. Pre-fix, a post-commit emit failure left this
      // absent while the visit still showed skipped.
      const obs = await check.query(
        `SELECT COUNT(*)::int AS n FROM core.observations
         WHERE visit_id = $1 AND observation_type = 'encampment_present'`,
        [visitId],
      );
      assertEqual(obs.rows[0].n, 1, "hazard presence observation emitted with the skip (atomic)");
    } finally {
      await check.query(`SELECT set_config('app.current_org_id', '', false)`).catch(() => {});
      check.release();
    }
  } finally {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    await releaseFixture(client, f);
  }
});
