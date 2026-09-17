import type { AddressInfo } from "net";
import type { Server } from "http";
// Dev-bypass must be opted in before app.ts is required.
process.env.DEV_AUTH_BYPASS = "true";

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  pool,
  test,
  assert,
  assertEqual,
  FIXTURE_ORG_ID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import { uploadFileToS3 } from "../../src/s3Client";

// ============================================================================
// ISSUE-068 — the legacy photo_keys branch of the complete-stop gate must
// verify claimed keys against the upload bucket, not accept any non-empty
// string array (AGENT-SMOKE-1 #3).
//
// Contract pinned here, against the REAL HTTP handler and REAL MinIO:
//   1. fabricated keys  -> 400 listing the missing keys; stop NOT completed;
//   2. a real uploaded object -> 200; stop completed;
//   3. mixed real+fabricated -> 400 naming ONLY the fabricated key.
//
// Replay-safety context (why a hard 400 is correct): the offline queue replays
// UPLOAD_STOP_PHOTOS (order 2) before COMPLETE_STOP (order 4) and that upload
// is server-side, so legitimate replays have their objects in place before the
// complete gate runs. A key that fails HeadObject was never uploaded — a
// client error, dead-lettered visibly by the queue, never silently passed.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

function completeBody(photoKeys: string[]) {
  return JSON.stringify({
    picked_up_litter: true,
    trashVolume: 1,
    photo_keys: photoKeys,
  });
}

async function postComplete(baseUrl: string, routeRunStopId: number, photoKeys: string[]) {
  return fetch(`${baseUrl}/api/route-run-stops/${routeRunStopId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Dev-Persona": "admin" },
    body: completeBody(photoKeys),
  });
}

async function stopStatus(routeRunStopId: number): Promise<string> {
  const check = await pool.connect();
  try {
    await check.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    const r = await check.query(`SELECT status FROM route_run_stops WHERE id = $1`, [routeRunStopId]);
    return r.rows[0].status;
  } finally {
    await check.query(`SELECT set_config('app.current_org_id', '', false)`).catch(() => {});
    check.release();
  }
}

async function deleteObject(key: string): Promise<void> {
  const c = new S3Client({
    region: process.env.MINIO_REGION || "us-east-1",
    endpoint: process.env.MINIO_ENDPOINT,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.MINIO_SECRET_ACCESS_KEY || "",
    },
    forcePathStyle: true,
  });
  await c.send(new DeleteObjectCommand({ Bucket: process.env.MINIO_BUCKET, Key: key })).catch(() => {});
}

// A 1x1-ish PNG header is unnecessary — the gate verifies existence, not content.
const TINY = Buffer.from("issue-068 test object");

test("ISSUE-068: fabricated photo_keys are rejected 400 with the missing keys listed", async () => {
  const { client, f } = await acquireRouteRunFixture();
  let server: Server | undefined;
  try {
    const srv = await startServer();
    server = srv.server;

    const fake = `test/issue068-never-uploaded-${f.routeRunStopId}.png`;
    const res = await postComplete(srv.baseUrl, f.routeRunStopId, [fake]);

    assertEqual(res.status, 400, "fabricated key must be rejected (400)");
    const body = await res.json();
    assert(Array.isArray(body.missing_keys), "response lists missing_keys");
    assertEqual(body.missing_keys[0], fake, "the fabricated key is named");

    assertEqual(await stopStatus(f.routeRunStopId), "pending", "stop NOT completed by a fabricated key");
  } finally {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    await releaseFixture(client, f);
  }
});

test("ISSUE-068: a genuinely uploaded object passes the gate and completes the stop", async () => {
  const { client, f } = await acquireRouteRunFixture();
  let server: Server | undefined;
  const realKey = `test/issue068-real-${f.routeRunStopId}.png`;
  try {
    await uploadFileToS3(realKey, TINY, "image/png");

    const srv = await startServer();
    server = srv.server;

    const res = await postComplete(srv.baseUrl, f.routeRunStopId, [realKey]);
    assertEqual(res.status, 200, "real uploaded key completes the stop (200)");
    assertEqual(await stopStatus(f.routeRunStopId), "done", "stop marked done");
  } finally {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    await deleteObject(realKey);
    await releaseFixture(client, f);
  }
});

test("ISSUE-068: mixed real + fabricated keys reject 400 naming only the fabricated key", async () => {
  const { client, f } = await acquireRouteRunFixture();
  let server: Server | undefined;
  const realKey = `test/issue068-mixed-real-${f.routeRunStopId}.png`;
  const fakeKey = `test/issue068-mixed-fake-${f.routeRunStopId}.png`;
  try {
    await uploadFileToS3(realKey, TINY, "image/png");

    const srv = await startServer();
    server = srv.server;

    const res = await postComplete(srv.baseUrl, f.routeRunStopId, [realKey, fakeKey]);
    assertEqual(res.status, 400, "mixed keys rejected (400)");
    const body = await res.json();
    assertEqual(body.missing_keys.length, 1, "exactly one missing key reported");
    assertEqual(body.missing_keys[0], fakeKey, "only the fabricated key is named");

    assertEqual(await stopStatus(f.routeRunStopId), "pending", "stop NOT completed");
  } finally {
    if (server) await new Promise<void>((r) => server!.close(() => r()));
    await deleteObject(realKey);
    await releaseFixture(client, f);
  }
});
