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
// ISSUE-073 (A1) — the non-safety non-service outcome, end to end over the
// real HTTP handler.
//
// Contract pinned:
//   1. reason + obstruction photo -> 200; stop 'skipped' (adapter scaffolding);
//      canonical visit outcome='unable_to_access' + reason_code=<specific
//      reason>; access note lands once in visit_notes (category='access'); and
//      — THE POINT OF THE CARD — **ZERO observations** are emitted. An access
//      failure asserts nothing about the asset; folding it into safety would
//      contaminate the hazard signal the labor-safety story depends on.
//   2. no obstruction photo -> 400.
//   3. invalid reason -> 400.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function seedAccessEvidence(client: any, routeRunStopId: number): Promise<number> {
  const visitId = await ensureVisitForRouteRunStop(client, {
    routeRunStopId,
    actorOid: FIXTURE_ACTOR_OID,
    visitType: "service",
  });
  await client.query(
    `INSERT INTO core.evidence (org_id, visit_id, observation_id, kind, storage_key)
     VALUES ($1, $2, NULL, 'access', $3)`,
    [FIXTURE_ORG_ID, visitId, `test/issue073-access-${routeRunStopId}.png`],
  );
  return visitId;
}

async function postUnable(baseUrl: string, routeRunStopId: number, body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/route-run-stops/${routeRunStopId}/unable-to-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Dev-Persona": "admin" },
    body: JSON.stringify(body),
  });
}

test("ISSUE-073: unable-to-access records the canonical outcome with ZERO observations", async () => {
  const { client, f } = await acquireRouteRunFixture();
  let server: Server | undefined;
  try {
    const visitId = await seedAccessEvidence(client, f.routeRunStopId);
    const srv = await startServer();
    server = srv.server;

    const res = await postUnable(srv.baseUrl, f.routeRunStopId, {
      reason: "construction",
      notes: "test-note access: fenced off, crew on site",
    });
    assertEqual(res.status, 200, "unable-to-access succeeds (200)");

    const check = await pool.connect();
    try {
      await check.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);

      const stop = await check.query(`SELECT status FROM route_run_stops WHERE id = $1`, [f.routeRunStopId]);
      assertEqual(stop.rows[0].status, "skipped", "adapter scaffolding reuses terminal 'skipped'");

      const visit = await check.query(
        `SELECT outcome, reason_code, ended_at IS NOT NULL AS ended FROM core.visits WHERE id = $1`,
        [visitId],
      );
      assertEqual(visit.rows[0].outcome, "unable_to_access", "canonical outcome = unable_to_access (core grammar)");
      assertEqual(visit.rows[0].reason_code, "construction", "reason_code carries the SPECIFIC adapter-vocabulary reason");
      assert(visit.rows[0].ended === true, "visit is closed");

      // CONTAMINATION GUARD — the reason this card exists: no observations of
      // any kind. The worker never assessed the asset; nothing may be asserted.
      const obs = await check.query(
        `SELECT COUNT(*)::int AS n FROM core.observations WHERE visit_id = $1`,
        [visitId],
      );
      assertEqual(obs.rows[0].n, 0, "ZERO observations emitted — no safety/infra contamination");

      const note = await check.query(
        `SELECT category, note FROM core.visit_notes WHERE visit_id = $1`,
        [visitId],
      );
      assertEqual(note.rows.length, 1, "one visit note");
      assertEqual(note.rows[0].category, "access", "note categorized 'access' (§3.6 grain)");
      assertEqual(note.rows[0].note, "test-note access: fenced off, crew on site", "note text exact");
    } finally {
      await check.query(`SELECT set_config('app.current_org_id', '', false)`).catch(() => {});
      check.release();
    }
  } finally {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    await releaseFixture(client, f);
  }
});

test("ISSUE-073: no obstruction photo -> 400; stop untouched", async () => {
  const { client, f } = await acquireRouteRunFixture();
  let server: Server | undefined;
  try {
    const srv = await startServer();
    server = srv.server;

    const res = await postUnable(srv.baseUrl, f.routeRunStopId, { reason: "road_closed" });
    assertEqual(res.status, 400, "photo-less unable-to-access rejected (400)");

    const check = await pool.connect();
    try {
      await check.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
      const stop = await check.query(`SELECT status FROM route_run_stops WHERE id = $1`, [f.routeRunStopId]);
      assertEqual(stop.rows[0].status, "pending", "stop untouched");
    } finally {
      await check.query(`SELECT set_config('app.current_org_id', '', false)`).catch(() => {});
      check.release();
    }
  } finally {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    await releaseFixture(client, f);
  }
});

test("ISSUE-073: unknown reason -> 400 (adapter vocabulary enforced)", async () => {
  const { client, f } = await acquireRouteRunFixture();
  let server: Server | undefined;
  try {
    const srv = await startServer();
    server = srv.server;

    const res = await postUnable(srv.baseUrl, f.routeRunStopId, { reason: "aliens" });
    assertEqual(res.status, 400, "unknown reason rejected (400)");
  } finally {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    await releaseFixture(client, f);
  }
});
