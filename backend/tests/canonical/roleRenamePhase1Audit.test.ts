import {
  pool,
  test,
  assert,
  assertEqual,
  createRouteRunFixture,
  FIXTURE_ORG_ID,
  releaseFixture,
} from "../setup";
import * as http from "http";

// Regression tests for the Phase 1 role-rename audit gap.
//
// Phase 1 (commit 4b2530a) claimed to widen 25 backend guards to dual-accept
// the new role names (UL/Specialist, Lead/Dispatch). The actual sweep skipped
// three route files (routeRunRoutes, ulRoutes, routeRunStopRoutes) and one
// SQL filter (/api/users). The miss surfaced in the field as a 403 when a
// Dispatch user opened /lead/route-runs/:id.
//
// These tests would have caught both gaps in Phase 1 had they existed. They
// lock in dual-accept at the HTTP boundary, not just at the middleware level,
// so a future re-narrowing (Phase 3 cleanup, accidental revert) fails loudly
// in CI rather than as a field 403.

type HttpResp = { status: number; body: any };

function httpGet(port: number, path: string, headers: Record<string, string>): Promise<HttpResp> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "GET",
        headers,
      },
      (res) => {
        let buf = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { buf += chunk; });
        res.on("end", () => {
          let parsed: any = null;
          try { parsed = buf ? JSON.parse(buf) : null; } catch { parsed = buf; }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

// ── (a) Dispatch token can GET /api/lead/route-runs/:id (200, not 403) ──────
test("role-rename Phase 1 audit: Dispatch token GETs /lead/route-runs/:id → 200", async () => {
  const { app } = await import("../../src/app");
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;

  const client = await pool.connect();
  let fixture: { routeRunId: number; routeRunStopId: number } | null = null;
  try {
    fixture = await createRouteRunFixture(client);

    const res = await httpGet(port, `/api/lead/route-runs/${fixture.routeRunId}`, {
      "x-dev-user-oid": "rename-audit-dispatch",
      "x-dev-user-roles": "Dispatch",
      "x-dev-user-org-id": String(FIXTURE_ORG_ID),
    });

    assertEqual(res.status, 200, "Dispatch-only token must receive 200, not 403, on /lead/route-runs/:id");
    assert(res.body?.ok === true, "response body must be { ok: true, route_run: ... }");
    assertEqual(Number(res.body?.route_run?.id), fixture.routeRunId, "returned route_run.id matches fixture");
  } finally {
    if (fixture) {
      await releaseFixture(client, fixture); // cleanup + guaranteed release
    } else {
      client.release(); // fixture setup threw — the client must still go back
    }
    await new Promise<void>((resolve) => server.close(resolve));
  }
});

// ── (b) GET /api/users returns backfilled Specialist/Dispatch users ──────────
//
// Post-backfill (Phase 1 migration 20260519_role_rename_backfill.sql), the
// identity_directory holds new role names only ('Specialist', 'Dispatch').
// The /api/users SQL filter — claimed updated in the Phase 1 commit message
// but in fact left as IN ('UL','Lead') — would return zero rows. This test
// proves the widened filter returns the backfilled users.
test("role-rename Phase 1 audit: /api/users returns backfilled Specialist + Dispatch rows", async () => {
  const { app } = await import("../../src/app");
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as any).port;

  try {
    const res = await httpGet(port, "/api/users", {
      "x-dev-user-oid": "rename-audit-admin",
      "x-dev-user-roles": "Admin",
      "x-dev-user-org-id": String(FIXTURE_ORG_ID),
    });

    assertEqual(res.status, 200, "/api/users must return 200 for an Admin caller");
    assert(Array.isArray(res.body?.users), "response body.users must be an array");

    const roles = (res.body.users as Array<{ role: string }>).map((u) => u.role);
    assert(
      roles.includes("Specialist"),
      `users list must include at least one Specialist row post-backfill; got roles=${JSON.stringify(roles)}`,
    );
    assert(
      roles.includes("Dispatch"),
      `users list must include at least one Dispatch row post-backfill; got roles=${JSON.stringify(roles)}`,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(resolve));
  }
});
