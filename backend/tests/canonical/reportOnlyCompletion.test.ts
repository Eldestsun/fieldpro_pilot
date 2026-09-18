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
// ISSUE-070 — a report IS work recorded (founder decision, Option 1).
//
// The completion gate previously required a cleaning action or a spot check —
// a worker who found ONLY damage (nothing to clean; a spot check would falsely
// assert "no work needed", §3.5) had no truthful completion path, and since
// the report data only reaches canonical through the completion payload,
// backing out silently LOST the report. Contract pinned here, over the real
// HTTP handler:
//   1. infra-report-only completion  -> 200; infra presences land; NO action
//      rows, NO trash_volume, NO spot_check (nothing manufactured);
//   2. safety-report-only completion -> 200; outcome stays 'completed'
//      (serviced-anyway; skip is a different path);
//   3. no work at all                -> still 400 (the gate holds).
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

// Satisfy the photo gate via pre-seeded core.evidence (the hasNewPhotos
// branch), keeping this test decoupled from MinIO — photo-key verification
// has its own suite (photoKeysVerified.test.ts / ISSUE-068).
async function seedCompletionEvidence(client: any, routeRunStopId: number): Promise<number> {
  const visitId = await ensureVisitForRouteRunStop(client, {
    routeRunStopId,
    actorOid: FIXTURE_ACTOR_OID,
    visitType: "service",
  });
  await client.query(
    `INSERT INTO core.evidence (org_id, visit_id, observation_id, kind, storage_key)
     VALUES ($1, $2, NULL, 'completion', $3)`,
    [FIXTURE_ORG_ID, visitId, `test/issue070-${routeRunStopId}.png`],
  );
  return visitId;
}

async function postComplete(baseUrl: string, routeRunStopId: number, body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/route-run-stops/${routeRunStopId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Dev-Persona": "admin" },
    body: JSON.stringify(body),
  });
}

async function readBack(visitId: number) {
  const check = await pool.connect();
  try {
    await check.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    const visit = await check.query(
      `SELECT outcome, reason_code FROM core.visits WHERE id = $1`, [visitId],
    );
    const obs = await check.query(
      `SELECT obs_kind, observation_type FROM core.observations WHERE visit_id = $1 ORDER BY observation_type`,
      [visitId],
    );
    return { visit: visit.rows[0], obs: obs.rows as Array<{ obs_kind: string; observation_type: string }> };
  } finally {
    await check.query(`SELECT set_config('app.current_org_id', '', false)`).catch(() => {});
    check.release();
  }
}

test("ISSUE-070: an infra-report-only completion succeeds and lands ONLY the report", async () => {
  const { client, f } = await acquireRouteRunFixture();
  let server: Server | undefined;
  try {
    const visitId = await seedCompletionEvidence(client, f.routeRunStopId);
    const srv = await startServer();
    server = srv.server;

    const res = await postComplete(srv.baseUrl, f.routeRunStopId, {
      // no cleaning booleans, no trashVolume, no spotCheck — report only
      infraIssues: [
        { issue_type: "glass_damage", cause: "vandalism", component: "glass" },
      ],
    });
    assertEqual(res.status, 200, "infra-report-only completion succeeds (200)");

    const { visit, obs } = await readBack(visitId);
    assertEqual(visit.outcome, "completed", "visit outcome = completed");
    assertEqual(visit.reason_code, null, "no reason_code on a completed visit");

    const types = obs.map(o => o.observation_type);
    assert(types.includes("glass_damage_present"), "infra presence observation landed");
    assertEqual(obs.filter(o => o.obs_kind === "action").length, 0, "NO action rows manufactured");
    assert(!types.includes("trash_volume"), "NO trash_volume manufactured");
    assert(!types.includes("spot_check"), "NO spot_check manufactured");
  } finally {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    await releaseFixture(client, f);
  }
});

test("ISSUE-070: a safety-report-only completion succeeds as a serviced visit", async () => {
  const { client, f } = await acquireRouteRunFixture();
  let server: Server | undefined;
  try {
    const visitId = await seedCompletionEvidence(client, f.routeRunStopId);
    const srv = await startServer();
    server = srv.server;

    const res = await postComplete(srv.baseUrl, f.routeRunStopId, {
      safety: { hazard_types: ["encampment"], severity: "low" },
    });
    assertEqual(res.status, 200, "safety-report-only completion succeeds (200)");

    const { visit, obs } = await readBack(visitId);
    assertEqual(visit.outcome, "completed", "serviced-anyway: outcome = completed, NOT skipped");
    assert(
      obs.some(o => o.observation_type === "encampment_present"),
      "safety presence observation landed",
    );
  } finally {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    await releaseFixture(client, f);
  }
});

test("ISSUE-070: completion with NO work recorded is still rejected (400)", async () => {
  const { client, f } = await acquireRouteRunFixture();
  let server: Server | undefined;
  try {
    await seedCompletionEvidence(client, f.routeRunStopId);
    const srv = await startServer();
    server = srv.server;

    const res = await postComplete(srv.baseUrl, f.routeRunStopId, {});
    assertEqual(res.status, 400, "no cleaning, no spot check, no report -> 400");

    const check = await pool.connect();
    try {
      await check.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
      const stop = await check.query(`SELECT status FROM route_run_stops WHERE id = $1`, [f.routeRunStopId]);
      assertEqual(stop.rows[0].status, "pending", "stop not completed");
    } finally {
      await check.query(`SELECT set_config('app.current_org_id', '', false)`).catch(() => {});
      check.release();
    }
  } finally {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    await releaseFixture(client, f);
  }
});
