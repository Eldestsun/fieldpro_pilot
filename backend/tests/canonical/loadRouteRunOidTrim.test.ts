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
// SEAM-C ITEM 4 (founder-ruled 2026-07-08) — GET /lead/route-runs/:id trims the
// raw OIDs from the R11 reassignment identity exposure: the payload keeps
// assigned_user.display_name / .role and created_by.display_name (operational
// reassignment need) but carries NO *_oid field anywhere. The identity_directory
// JOIN in loadRouteRunById stays — it sources the names.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);

/** Deep scan for any key that is 'oid' or ends in '_oid' with a populated value. */
function findOidKeys(node: any, path = ""): string[] {
  const hits: string[] = [];
  if (node == null || typeof node !== "object") return hits;
  for (const [k, v] of Object.entries(node)) {
    const here = path ? `${path}.${k}` : k;
    if ((k === "oid" || /_oid$/i.test(k)) && v != null && v !== "") hits.push(here);
    hits.push(...findOidKeys(v, here));
  }
  return hits;
}

test("SEAM-C item 4: /lead/route-runs/:id exposes assigned/creator NAME+ROLE but no *_oid", async () => {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const { client, f } = await acquireRouteRunFixture();
  try {
    // Give the fixture run resolvable identity (seeded identity_directory rows).
    await client.query(
      `UPDATE route_runs SET assigned_user_oid = 'seed-specialist-oid',
              created_by_oid = 'seed-dispatch-oid' WHERE id = $1`,
      [f.routeRunId],
    );

    const res = await fetch(`${baseUrl}/api/lead/route-runs/${f.routeRunId}`, {
      headers: {
        "X-Dev-User-Oid": "seam-c-oidtrim-suite-dispatch",
        "X-Dev-User-Roles": "Dispatch",
        "X-Dev-User-Org-Id": ORG,
      },
    });
    assertEqual(res.status, 200, "detail endpoint returns 200 for Dispatch");
    const body = await res.json();
    const run = body.route_run;
    assert(run != null, "route_run present in payload");

    // The three sanctioned name/role fields survive.
    assertEqual(run.assigned_user?.display_name, "Seed Specialist", "assigned_user.display_name present (R11)");
    assertEqual(run.assigned_user?.role, "Specialist", "assigned_user.role present");
    assertEqual(run.created_by?.display_name, "Seed Dispatch", "created_by.display_name present");

    // No raw OID anywhere in the payload.
    const oidHits = findOidKeys(body);
    assertEqual(
      oidHits.length,
      0,
      `payload must carry no *_oid field (found: ${oidHits.join(", ") || "none"})`,
    );
    // And specifically the trimmed nested keys are gone.
    assert(!("oid" in (run.assigned_user ?? {})), "assigned_user.oid removed");
    assert(!("oid" in (run.created_by ?? {})), "created_by.oid removed");
  } finally {
    await releaseFixture(client, f);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
