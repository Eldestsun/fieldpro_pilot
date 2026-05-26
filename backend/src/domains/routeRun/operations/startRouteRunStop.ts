import { Pool } from "pg";
import { ensureVisitForRouteRunStop, getVisitContext } from "../../visit/visitService";

export type StartRouteRunStopResult = {
    updated: boolean;
    status: string;
    row?: any;
    routeRunId?: number;
};

/**
 * Internal helper to start a route run stop.
 * Handles transaction, status transition, visit ensuring, and observation emission.
 * strictly neutral: reports facts, leaves HTTP/Idempotency decisions to caller.
 */
export async function startRouteRunStopInternal(
    pool: Pool,
    params: {
        routeRunStopId: number | string;
        actorOid: string;
        allowedStatuses: string[];
    }
): Promise<StartRouteRunStopResult> {
    const { routeRunStopId, actorOid, allowedStatuses } = params;
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // 1. Attempt Update
        const updateQuery = `
      UPDATE route_run_stops
      SET status = 'in_progress',
          started_at = COALESCE(started_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
        AND status = ANY($2::text[])
      RETURNING *
    `;

        const res = await client.query(updateQuery, [routeRunStopId, allowedStatuses]);

        if (res.rows.length > 0) {
            const row = res.rows[0];
            // 2. Ensuring Visit (inside txn)
            const visitId = await ensureVisitForRouteRunStop(client, {
                routeRunStopId: Number(routeRunStopId),
                actorOid,
                visitType: "service",
            });

            await client.query("COMMIT");

            // No observations are emitted at stop-start. Observations are
            // written only when the specialist asserts something — at completion
            // (one kind=action row per performed cleaning + any presence /
            // measurement / spot_check rows) or at skip (specific safety
            // presences + visit outcome). Canonical state layer §2 invariants
            // #5 and #6: no manufactured arrival state, no stored transitions.
            // The arrival-emit code path that used to live here was fully
            // removed 2026-05-25 (see ARRIVAL_PHASE_DATA_PATH.md memo).

            return {
                updated: true,
                status: row.status,
                row,
                routeRunId: row.route_run_id,
            };
        } else {
            await client.query("ROLLBACK");

            // 4. Fetch current state for caller decision
            const lookupRes = await client.query(
                `SELECT status, route_run_id, id, started_at FROM route_run_stops WHERE id = $1`,
                [routeRunStopId]
            );

            if (lookupRes.rows.length === 0) {
                // Not found at all
                return {
                    updated: false,
                    status: "NOT_FOUND",
                };
            }

            const row = lookupRes.rows[0];
            return {
                updated: false,
                status: row.status,
                row,
                routeRunId: row.route_run_id,
            };
        }

    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}
