import type { AddressInfo } from "net";
import type { Server } from "http";
process.env.DEV_AUTH_BYPASS = "true";

import {
  test,
  assert,
  assertEqual,
  FIXTURE_ORG_ID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";

// ============================================================================
// SEAM-C ITEM 3 — the dead `rr.user_id` (LEGACY_TRANSIT_USER_ID = 0, a constant
// carrying no worker identity) is dropped from the two Dispatch route-list
// responses: GET /lead/todays-runs and GET /ops/route-runs. Response-shape
// assertion: no returned run row carries a `user_id` key.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);

async function getRuns(baseUrl: string, path: string): Promise<any[]> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      "X-Dev-User-Oid": "seam-c-userid-suite-dispatch",
      "X-Dev-User-Roles": "Dispatch",
      "X-Dev-User-Org-Id": ORG,
    },
  });
  assertEqual(res.status, 200, `${path} returns 200 for Dispatch`);
  const body = await res.json();
  return body.route_runs as any[];
}

test("SEAM-C item 3: /lead/todays-runs and /ops/route-runs responses carry no user_id key", async () => {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // Fixture guarantees at least one 'planned' run for today so both lists are non-empty.
  const { client, f } = await acquireRouteRunFixture();
  try {
    for (const path of ["/api/lead/todays-runs", "/api/ops/route-runs"]) {
      const runs = await getRuns(baseUrl, path);
      assert(runs.length >= 1, `${path} returned at least the fixture run`);
      for (const row of runs) {
        assert(!("user_id" in row), `${path}: run row must NOT carry a user_id key (got keys: ${Object.keys(row).join(", ")})`);
      }
    }
  } finally {
    await releaseFixture(client, f);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
