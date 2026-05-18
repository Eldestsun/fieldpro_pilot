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
  const res = await client.query<StopRow>(
    `SELECT stop_id,
            status,
            (hazard_id IS NOT NULL OR infra_issue_id IS NOT NULL) AS is_exception
     FROM route_run_stops
     WHERE route_run_id = $1`,
    [routeRunId]
  );
  return res.rows;
}

export async function populate(): Promise<{ inserted: number; skipped: number }> {
  const client = await pool.connect();
  try {
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
      org_id: 1,
      action: 'admin.eam_bridge_populate',
      detail: {
        rows_written: inserted,
        run_at: runAt,
        route_run_ids_processed_count: runs.length,
      },
    });

    return { inserted, skipped };
  } finally {
    client.release();
  }
}

// Run as standalone script: pnpm eam-bridge:populate
if (require.main === module) {
  (async () => {
    console.log("EAM bridge populate — starting");
    const result = await populate();
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
