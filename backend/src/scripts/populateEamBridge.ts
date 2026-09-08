/**
 * S1-7 — EAM Bridge Route Log populate script.
 *
 * Selects completed route_runs closed since the last watermark, aggregates
 * a worker-identity-free canonical summary for each, and inserts one row
 * into eam_bridge_route_log. Advances the watermark on success.
 * Idempotent: ON CONFLICT (route_run_id) DO NOTHING.
 *
 * LABOR SAFETY: No worker identity (actor_oid / captured_by_oid / user_id)
 * is written to eam_bridge_route_log at any point.
 */

import { pool } from "../db";
import { writeAuditLog } from "../middleware/auditLog";
import { SYSTEM_ACTOR_OID } from "../constants";
import { PoolClient } from "pg";
import { deriveClientVisitId } from "../domains/visit/visitService";
import { SAFETY_PRESENCE_TYPES, INFRA_PRESENCE_TYPES } from "../domains/observation/presenceTaxonomy";

interface RouteRunRow {
  id: number;
  org_id: number;
  finished_at: Date;
  run_date: string;
  route_pool_id: string | null;
}

interface StopRow {
  stop_id: string;
  status: string;
  is_exception: boolean;
}

async function fetchWatermark(client: PoolClient): Promise<Date> {
  const res = await client.query<{ watermark: Date }>(
    "SELECT watermark FROM eam_bridge_populate_state WHERE id = 1"
  );
  return res.rows[0].watermark;
}

async function fetchUnloggedRuns(client: PoolClient, watermark: Date): Promise<RouteRunRow[]> {
  const res = await client.query<RouteRunRow>(
    `SELECT id, org_id, finished_at, run_date, route_pool_id
     FROM route_runs
     WHERE status = 'completed'
       AND finished_at > $1
       AND NOT EXISTS (
         SELECT 1 FROM eam_bridge_route_log WHERE route_run_id = route_runs.id
       )
     ORDER BY finished_at ASC`,
    [watermark]
  );
  return res.rows;
}

async function fetchStops(client: PoolClient, routeRunId: number): Promise<StopRow[]> {
  const base = await client.query<{ id: number; stop_id: string; status: string }>(
    `SELECT id, stop_id, status FROM route_run_stops WHERE route_run_id = $1`,
    [routeRunId]
  );
  const rows = base.rows;
  if (rows.length === 0) return [];

  // ISSUE-035 item 1: is_exception derived from CANONICAL, not the dead
  // route_run_stops.hazard_id / infra_issue_id adapter pointers (both
  // permanently NULL for post-clip rows — hazard_id since the hazards Stage-2
  // clip, infra_issue_id never written by any path). A stop is an exception if
  // its visit carries any safety- or infra-presence observation. Bridge
  // route_run_stop → visit via the deterministic client_visit_id — the same
  // derivation the write path and ISSUE-036 use (Postgres has no uuidv5, so the
  // bridge is computed here, not in SQL).
  const cvidToStopId = new Map<string, number>();
  for (const r of rows) cvidToStopId.set(deriveClientVisitId(r.id), r.id);

  const exceptionTypes = [...SAFETY_PRESENCE_TYPES, ...INFRA_PRESENCE_TYPES];
  const exc = await client.query<{ client_visit_id: string }>(
    `SELECT DISTINCT v.client_visit_id
       FROM core.visits v
       JOIN core.observations o ON o.visit_id = v.id
      WHERE v.client_visit_id = ANY($1::uuid[])
        AND o.obs_kind = 'presence'
        AND o.observation_type = ANY($2::text[])`,
    [Array.from(cvidToStopId.keys()), exceptionTypes]
  );
  const exceptionStopIds = new Set<number>();
  for (const r of exc.rows) {
    const sid = cvidToStopId.get(r.client_visit_id);
    if (sid !== undefined) exceptionStopIds.add(sid);
  }

  return rows.map((r) => ({
    stop_id: r.stop_id,
    status: r.status,
    is_exception: exceptionStopIds.has(r.id),
  }));
}

// PATTERN-001 / ISSUE-013 (ISSUE-057 product fix, mirroring riskMapJob): this
// script reads forced-RLS route_runs/route_run_stops and writes forced-RLS
// eam_bridge_route_log — on a context-less connection under fail-closed RLS
// (MT-2) it silently found 0 runs and populated NOTHING. orgId is a REQUIRED
// explicit parameter; there is deliberately no default — an indeterminate org
// must refuse, never assume.
export async function populate(orgId: number | string): Promise<{ inserted: number; skipped: number }> {
  if (orgId === null || orgId === undefined || String(orgId) === "") {
    throw new Error("populate: orgId is required (fail-closed — never assumes a default org)");
  }
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(orgId)]);
    const watermark = await fetchWatermark(client);
    const runs = await fetchUnloggedRuns(client, watermark);

    let inserted = 0;
    let skipped = 0;
    let maxFinishedAt: Date | null = null;

    for (const run of runs) {
      const stops = await fetchStops(client, run.id);
      const stop_count = stops.length;
      const exception_count = stops.filter((s) => s.is_exception).length;
      const canonical_summary = {
        run_date: run.run_date,
        route_pool_id: run.route_pool_id,
        stops: stops.map((s) => ({ stop_id: s.stop_id, status: s.status })),
      };

      const res = await client.query(
        `INSERT INTO eam_bridge_route_log
           (org_id, route_run_id, completed_at, stop_count, exception_count, canonical_summary)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (route_run_id) DO NOTHING`,
        [
          run.org_id,
          run.id,
          run.finished_at,
          stop_count,
          exception_count,
          JSON.stringify(canonical_summary),
        ]
      );

      if ((res.rowCount ?? 0) === 1) {
        inserted++;
        if (!maxFinishedAt || run.finished_at > maxFinishedAt) {
          maxFinishedAt = run.finished_at;
        }
      } else {
        skipped++;
      }
    }

    if (maxFinishedAt !== null) {
      await client.query(
        "UPDATE eam_bridge_populate_state SET watermark = $1 WHERE id = 1",
        [maxFinishedAt]
      );
    }

    const runAt = new Date().toISOString();
    const actorOid = process.env.SYSTEM_ACTOR_OID ?? SYSTEM_ACTOR_OID;

    // Await directly — fire-and-forget is unsafe in a script that calls pool.end()
    // immediately after populate() returns.
    await writeAuditLog({
      actor_oid: actorOid,
      org_id: orgId,
      action: 'admin.eam_bridge_populate',
      detail: {
        rows_written: inserted,
        run_at: runAt,
        route_run_ids_processed_count: runs.length,
      },
    });

    return { inserted, skipped };
  } finally {
    try {
      await client.query(`SELECT set_config('app.current_org_id', '', false)`);
    } catch { /* best-effort reset before returning to pool */ }
    client.release();
  }
}

// Run as standalone script: EAM_BRIDGE_ORG_ID=1 pnpm eam-bridge:populate
//
// EAM_BRIDGE_ORG_ID is REQUIRED (fail-closed, ISSUE-013 pattern — the
// EAM-bridge analog of RISK_MAP_ORG_ID): the job never assumes an org.
if (require.main === module) {
  (async () => {
    const orgId = process.env.EAM_BRIDGE_ORG_ID;
    if (!orgId) {
      console.error("EAM_BRIDGE_ORG_ID is required — the EAM-bridge populate job never assumes a default org (fail-closed).");
      process.exit(1);
    }
    console.log("EAM bridge populate — starting");
    const result = await populate(orgId);
    console.log(
      `Done. Inserted: ${result.inserted}, Skipped: ${result.skipped}`
    );
    await pool.end();
    process.exit(0);
  })().catch((err) => {
    console.error(
      "EAM bridge populate failed:",
      err instanceof Error ? err.message : err
    );
    process.exit(1);
  });
}
