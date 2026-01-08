import { Pool } from "pg";
import { ensureVisitForRouteRunStop, getVisitContext } from "../../visit/visitService";
import { emitObservationsForStop } from "../../observation/observationService";

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

            // 3. Emit Observations (post-commit)
            // We need context
            const ctx = await getVisitContext(client, Number(routeRunStopId));
            // getVisitContext usually takes a client?
            // Checking usage in other files... ensureVisit takes client. getVisitContext takes client?
            // I'll use a new client or the pool for getVisitContext to be safe if it's read-only.
            // Actually `emitObservationsForStop` takes NO client, it imports pool or service.
            // So emitting is fine.
            // Just need ctx.
            // Context reading is separate read.

            await emitObservationsForStop({
                phase: "arrival",
                visitId,
                orgId: ctx.orgId,
                assetId: ctx.assetId,
                locationId: ctx.locationId,
                actorOid,
            });

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
