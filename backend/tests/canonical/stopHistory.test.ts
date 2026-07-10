import type { AddressInfo } from "net";
import type { Server } from "http";
// Dev-bypass must be opted-in before app.ts is required (it decides the mount at
// module load). Other suites set this too; it is idempotent.
process.env.DEV_AUTH_BYPASS = "true";

import {
  test,
  assert,
  assertEqual,
  pool,
  FIXTURE_STOP_ID,
  FIXTURE_ORG_ID,
  FIXTURE_LOCATION_ID,
  FIXTURE_ASSET_ID,
  FIXTURE_ACTOR_OID,
  acquireRouteRunFixture,
  releaseFixture,
} from "../setup";
import { ensureVisitForRouteRunStop } from "../../src/domains/visit/visitService";
import { emitObservationsForStop } from "../../src/domains/observation/observationService";

// ============================================================================
// SEAM-D D5a — GET /api/stops/:stop_id/history
//
// Visit-grouped chronology from three sources FK'd to the same core.visits row:
// core.observations (normalized columns only) + stop_effort_history +
// stop_condition_history. NEVER clipped adapters (public.hazards etc.).
//
// Asserted here:
//  1. Guard floor (audience-widening rider): Dispatch 200, Admin 200,
//     Specialist 403, unauthenticated denied.
//  2. Merged chronology: seeded visit + observations + effort + condition rows
//     come back as ONE entry (dedup rule) with all three facets.
//  3. had_hazard / had_infra_issue are NOT echoed (§2.1 umbrella duplication).
//  4. Absence: a stop with no visits returns entries: [] — never synthesized.
//  5. Org isolation (PATTERN-001): another org sees 404, never org-1 history.
//  6. Deep-scan rider: RECURSIVE walk of the nested response for identity keys
//     (user_id / *oid* / reported_by / captured_by / display_name / email /
//     actor) — not a top-level key scan.
// ============================================================================

const ORG = String(FIXTURE_ORG_ID);
const EMPTY_STOP_ID = "SEAMD_EMPTY_STOP";

function historyUrl(baseUrl: string, stopId: string): string {
  return `${baseUrl}/api/stops/${encodeURIComponent(stopId)}/history`;
}

function devHeaders(role: string, orgId: string = ORG): Record<string, string> {
  return {
    "X-Dev-User-Oid": `seam-d-history-suite-${role}`,
    "X-Dev-User-Roles": role,
    "X-Dev-User-Org-Id": orgId,
  };
}

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

// Rider 2: recursive identity-key scan. res.json drops undefined-valued keys
// (the A4 shallow-revert near-miss), so we walk every nested object/array and
// judge KEYS, not values.
const FORBIDDEN_KEY = /(user_id|oid|reported_by|captured_by|display_name|email|actor)/i;
function collectForbiddenKeys(node: unknown, path = "$"): string[] {
  const hits: string[] = [];
  if (Array.isArray(node)) {
    node.forEach((item, i) => hits.push(...collectForbiddenKeys(item, `${path}[${i}]`)));
  } else if (node !== null && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key)) hits.push(`${path}.${key}`);
      hits.push(...collectForbiddenKeys(value, `${path}.${key}`));
    }
  }
  return hits;
}

test("SEAM-D D5a: /stops/:id/history guard — Dispatch+Admin allowed, Specialist denied, anon denied", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const dispatch = await fetch(historyUrl(baseUrl, FIXTURE_STOP_ID), { headers: devHeaders("Dispatch") });
    assertEqual(dispatch.status, 200, "Dispatch → 200");
    const admin = await fetch(historyUrl(baseUrl, FIXTURE_STOP_ID), { headers: devHeaders("Admin") });
    assertEqual(admin.status, 200, "Admin → 200");
    const specialist = await fetch(historyUrl(baseUrl, FIXTURE_STOP_ID), { headers: devHeaders("Specialist") });
    assertEqual(specialist.status, 403, "Specialist → 403 (fail-closed, under-privileged)");
    const anon = await fetch(historyUrl(baseUrl, FIXTURE_STOP_ID));
    assert(anon.status === 401 || anon.status === 403, `unauthenticated → denied (got ${anon.status})`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("SEAM-D D5a: merged chronology — one visit entry with observation/effort/condition facets, no umbrella flags, deep-scan clean", async () => {
  const { server, baseUrl } = await startServer();
  const { client, f } = await acquireRouteRunFixture();
  try {
    // Seed through the REAL write path: visit + canonical observations.
    const visitId = await ensureVisitForRouteRunStop(client, {
      routeRunStopId: f.routeRunStopId,
      actorOid: FIXTURE_ACTOR_OID,
      visitType: "service",
    });
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
        picked_up_litter: true,
      },
      client,
    });
    // Close the visit so the entry reads as a completed chronology anchor.
    await client.query(
      `UPDATE core.visits SET ended_at = now(), outcome = 'completed' WHERE id = $1`,
      [visitId],
    );
    // Seed the two de-identified intelligence facets for the SAME visit.
    // had_hazard=true is seeded ON PURPOSE: the response must NOT echo it
    // (§2.1 — the presence observation above already carries that fact).
    await client.query(
      `INSERT INTO stop_effort_history
         (stop_id, visit_id, run_date, service_minutes, stop_type, had_hazard, had_infra_issue, trash_volume, org_id)
       VALUES ($1, $2, CURRENT_DATE, 14, 'standard', true, false, 2.0, $3)
       ON CONFLICT (stop_id, visit_id) DO NOTHING`,
      [FIXTURE_STOP_ID, visitId, FIXTURE_ORG_ID],
    );
    await client.query(
      `INSERT INTO stop_condition_history
         (stop_id, visit_id, cleanliness_score, safety_score, infra_score, asset_id, org_id)
       VALUES ($1, $2, 42.1, 10.0, 0.0, $3, $4)
       ON CONFLICT (stop_id, visit_id) DO NOTHING`,
      [FIXTURE_STOP_ID, visitId, FIXTURE_ASSET_ID, FIXTURE_ORG_ID],
    );

    const res = await fetch(historyUrl(baseUrl, FIXTURE_STOP_ID), { headers: devHeaders("Dispatch") });
    assertEqual(res.status, 200, "history returns 200 for Dispatch");
    const body = await res.json();

    assertEqual(body.stop_id, FIXTURE_STOP_ID, "payload names the stop");
    assert(Array.isArray(body.entries), "entries is an array");

    // Dedup rule: our visit appears as exactly ONE entry.
    const withEncampment = body.entries.filter((e: any) =>
      (e.observations ?? []).some((o: any) => o.type === "encampment_present"),
    );
    assertEqual(withEncampment.length, 1, "seeded visit appears exactly once (visit-grouped dedup)");
    const entry = withEncampment[0];

    assertEqual(entry.outcome, "completed", "visit outcome carried");
    assert(entry.started_at && entry.ended_at, "visit anchor timestamps carried");

    const obsTypes = entry.observations.map((o: any) => o.type).sort();
    assert(obsTypes.includes("encampment_present"), "presence observation in facet");
    assert(obsTypes.includes("picked_up_litter"), "action observation in facet");
    const presence = entry.observations.find((o: any) => o.type === "encampment_present");
    assertEqual(presence.kind, "presence", "normalized obs_kind carried");
    assertEqual(presence.norm_status, null, "presence norm_status NULL by design (existence is the signal)");
    const action = entry.observations.find((o: any) => o.type === "picked_up_litter");
    assertEqual(action.intervention, "picked_up_litter", "action intervention carried");
    for (const o of entry.observations) {
      assert(!("payload" in o), "raw observation payload is NEVER in the response");
    }

    assert(entry.effort, "effort facet present");
    assertEqual(entry.effort.service_minutes, 14, "effort service_minutes");
    assertEqual(entry.effort.stop_type, "standard", "effort stop_type");
    assertEqual(entry.effort.trash_volume, 2, "effort trash_volume numeric");
    assert(!("had_hazard" in entry.effort) && !("had_hazard" in entry),
      "had_hazard NOT echoed (umbrella duplication of the presence observation)");
    assert(!("had_infra_issue" in entry.effort) && !("had_infra_issue" in entry),
      "had_infra_issue NOT echoed");

    assert(entry.condition_scores, "condition facet present");
    assertEqual(entry.condition_scores.cleanliness, 42.1, "condition cleanliness score");
    assertEqual(entry.condition_scores.safety, 10, "condition safety score");

    // Rider 2: recursive deep-scan of the FULL body, all nesting levels.
    const hits = collectForbiddenKeys(body);
    assertEqual(hits.length, 0, `no identity keys anywhere in the nested response (found: ${hits.join(", ")})`);
  } finally {
    await releaseFixture(client, f);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("SEAM-D D5a: absence — a stop with no visits returns empty entries, never synthesized rows", async () => {
  const { server, baseUrl } = await startServer();
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    await client.query(
      `INSERT INTO public.transit_stops (stop_id, org_id, is_hotspot, compactor, has_trash)
       VALUES ($1, $2, false, false, false)
       ON CONFLICT (stop_id) DO NOTHING`,
      [EMPTY_STOP_ID, FIXTURE_ORG_ID],
    );

    const res = await fetch(historyUrl(baseUrl, EMPTY_STOP_ID), { headers: devHeaders("Dispatch") });
    assertEqual(res.status, 200, "empty stop is a 200, not an error");
    const body = await res.json();
    assertEqual(body.total_visits, 0, "total_visits 0");
    assertEqual(body.entries.length, 0, "entries empty — absence is the signal");
  } finally {
    try {
      await client.query(`DELETE FROM public.transit_stops WHERE stop_id = $1`, [EMPTY_STOP_ID]);
      await client.query(`SELECT set_config('app.current_org_id', '', false)`);
    } finally {
      client.release();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("SEAM-D D5a: org isolation (PATTERN-001) — another org cannot see org-1 stop history", async () => {
  const { server, baseUrl } = await startServer();
  try {
    // Org 98 exists in the organizations fixture set. The org-1 stop must be
    // invisible under org-98 context: RLS scopes the transit_stops lookup on
    // the withOrgContext client → 404, and no org-1 entries can leak.
    const res = await fetch(historyUrl(baseUrl, FIXTURE_STOP_ID), { headers: devHeaders("Dispatch", "98") });
    assertEqual(res.status, 404, "org-98 caller gets 404 for the org-1 stop (RLS fail-closed)");
    const body = await res.json();
    assert(!("entries" in body), "no history entries in the cross-org response");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
