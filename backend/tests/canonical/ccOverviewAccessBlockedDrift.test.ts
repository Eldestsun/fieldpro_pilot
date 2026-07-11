import type { AddressInfo } from "net";
import type { Server } from "http";
// Dev-bypass must be opted-in before app.ts is required (it decides the mount at
// module load). Other suites set this too; it is idempotent.
process.env.DEV_AUTH_BYPASS = "true";

import {
  test,
  assertEqual,
  FIXTURE_ACTOR_OID,
  FIXTURE_ORG_ID,
  FIXTURE_LOCATION_ID,
  FIXTURE_ASSET_ID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";
import { emitObservationsForStop } from "../../src/domains/observation/observationService";
import { SAFETY_PRESENCE_TYPES } from "../../src/domains/observation/presenceTaxonomy";

// ============================================================================
// SEAM-B-R1 — /overview hazards tile counts access-blocked reports (silent-zero
// drift closed).
//
// The pre-fix handler filtered hazards_reported by a LOCAL array containing
// 'access_blocked_present', but the write path (observationService.ts
// SAFETY_HAZARD_TYPE_MAP) emits the bare 'access_blocked' — so every
// access-blocked hazard report was silently excluded from the /overview tile
// while the sibling /exceptions tile (derived set) counted it.
//
// Handler-coupled regression test: drives the real endpoint (in-process app,
// dev-bypass) and measures a BEFORE/AFTER delta. Seeds ONE access-blocked
// hazard through the REAL write path using the field-wizard UI key "traffic"
// (normalizeSafetyKey → access_blocked → SAFETY_HAZARD_TYPE_MAP →
// observation_type 'access_blocked'), so the full writer→reader chain is what
// is asserted. FAILS against the pre-fix handler (delta 0); PASSES post-fix
// (delta 1). Also pins /overview and /exceptions to the SAME resolved type set.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);
const OVERVIEW = "/api/ops/control-center/overview";

async function getOverview(baseUrl: string): Promise<{ hazards_reported: number }> {
  const res = await fetch(`${baseUrl}${OVERVIEW}`, {
    headers: {
      "X-Dev-User-Oid": "seam-b-r1-suite-admin",
      "X-Dev-User-Roles": "Admin",
      "X-Dev-User-Org-Id": ORG,
    },
  });
  assertEqual(res.status, 200, "overview endpoint returns 200 for Admin");
  return res.json();
}

test("CC /overview (SEAM-B-R1): hazards tile counts a seeded access-blocked report (drift closed)", async () => {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const { client, f } = await acquireRouteRunFixture();
  try {
    const before = await getOverview(baseUrl);

    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    // Real write path, real UI key: the field wizard reports blocked access as
    // "traffic"; normalizeSafetyKey maps it to access_blocked and the write map
    // emits the bare observation_type 'access_blocked' (no _present suffix).
    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload: {
        safetyConcern: true,
        safetyHazards: ["traffic"],
      },
      client,
    });

    const after = await getOverview(baseUrl);
    assertEqual(
      after.hazards_reported - before.hazards_reported,
      1,
      "hazards_reported +1 from one canonical access_blocked presence row " +
        "(pre-fix handler: +0 — 'access_blocked_present' never matched the written type)",
    );

    // The derived set the tile now consumes must contain the bare written type
    // and must NOT contain the drifted token the deleted local array carried.
    assertEqual(
      SAFETY_PRESENCE_TYPES.includes("access_blocked"),
      true,
      "derived SAFETY_PRESENCE_TYPES contains the written type 'access_blocked'",
    );
    assertEqual(
      SAFETY_PRESENCE_TYPES.includes("access_blocked_present"),
      false,
      "derived SAFETY_PRESENCE_TYPES does NOT contain the never-written 'access_blocked_present'",
    );
  } finally {
    await releaseFixture(client, f);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
