import type { AddressInfo } from "net";
import type { Server } from "http";
// Dev-bypass must be opted-in before app.ts is required (it decides the mount at
// module load). Other suites set this too; it is idempotent.
process.env.DEV_AUTH_BYPASS = "true";

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
import { emitObservationsForStop } from "../../src/domains/observation/observationService";

// ============================================================================
// SEAM-C ITEM 1 — CC /exceptions hazard + infra tiles read CANONICAL, not the
// clipped public.hazards / public.infrastructure_issues adapters.
//
// Handler-coupled: it drives the real endpoint (in-process app, Admin dev-bypass)
// and measures BEFORE/AFTER deltas (the tile counts org-wide today, so deltas are
// deterministic under concurrent presence rows). It FAILS against the pre-SEAM-C
// handler, which counted public.hazards / public.infrastructure_issues:
//   - seeding canonical presence observations gives the OLD handler a 0 delta (fail).
// (The former synthetic-clipped-row assertion is now structural: public.hazards and
//  public.infrastructure_issues were physically dropped in ISSUE-037.)
//
// Taxonomy shift asserted: contaminated-waste → biohazard_present counts under
// HAZARDS (safety), never infra (observationService.ts mapInfraIssue / presenceTaxonomy.ts).
// ============================================================================

const EXCEPTIONS = "/api/ops/control-center/exceptions";

async function getExceptions(baseUrl: string): Promise<{ total_hazards: number; total_infra_issues: number }> {
  const res = await fetch(`${baseUrl}${EXCEPTIONS}`, {
    headers: {
      "X-Dev-Persona": "admin",
    },
  });
  assertEqual(res.status, 200, "exceptions endpoint returns 200 for Admin");
  return res.json();
}

test("CC /exceptions (SEAM-C): hazard + infra tiles count canonical presence observations, not clipped adapters", async () => {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const { client, f } = await acquireRouteRunFixture();
  try {
    const before = await getExceptions(baseUrl);

    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });

    // Real write path: encampment (SAFETY) + graffiti (INFRA) + contaminated_waste
    // (cross-maps to the SAFETY biohazard_present).
    await emitObservationsForStop({
      phase: "submit",
      visitId,
      orgId: FIXTURE_ORG_ID,
      assetId: FIXTURE_ASSET_ID,
      locationId: FIXTURE_LOCATION_ID,
      actorOid: FIXTURE_ACTOR_OID,
      uiPayload: {
        safetyConcern: true,
        safetyHazards: ["encampment"],
        infrastructurePresent: true,
        infrastructureIssues: ["graffiti", "contaminated_waste"],
      },
      client,
    });

    const afterSeed = await getExceptions(baseUrl);
    assertEqual(
      afterSeed.total_hazards - before.total_hazards,
      2,
      "hazards tile +2 from canonical SAFETY presences (encampment + contaminated-waste biohazard)",
    );
    assertEqual(
      afterSeed.total_infra_issues - before.total_infra_issues,
      1,
      "infra tile +1 from graffiti only; contaminated-waste counts under hazards (taxonomy shift)",
    );

    // Adapter non-contribution is now STRUCTURAL: public.hazards was physically
    // dropped in ISSUE-037, so there is no clipped adapter row that could ever move
    // the tile. The tiles count core.observations presence rows exclusively; the
    // before/afterSeed deltas above are the whole proof.
  } finally {
    await releaseFixture(client, f);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
