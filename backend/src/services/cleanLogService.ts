import { pool } from "../db";
import { loadRouteRunById, checkAndCompleteRouteRun } from "./routeRunService";
import { createInfrastructureIssuesForRouteRunStop, InfraIssueInput } from "./infrastructureIssueService";

/**
 * Complete a stop and create a clean log
 */
export async function completeStop(
    routeRunStopId: number | string,
    data: {
        user_id: number;
        duration_minutes: number;
        picked_up_litter?: boolean;
        emptied_trash?: boolean;
        washed_shelter?: boolean;
        washed_pad?: boolean;
        washed_can?: boolean;
        photo_keys?: string[] | null;
        infraIssues?: InfraIssueInput[];
        trashVolume?: number;
    }
) {
    const client = await pool.connect();
    try {
        const {
            user_id,
            duration_minutes,
            picked_up_litter = false,
            emptied_trash = false,
            washed_shelter = false,
            washed_pad = false,
            washed_can = false,
            photo_keys,
            infraIssues = [],
            trashVolume,
        } = data;

        // 1. Look up route_run_stop
        const findQuery = `
      SELECT route_run_id, stop_id, status
      FROM route_run_stops
      WHERE id = $1
    `;
        const findRes = await client.query(findQuery, [routeRunStopId]);

        if (findRes.rows.length === 0) {
            return null;
        }

        const { route_run_id, stop_id, status } = findRes.rows[0];

        if (status === 'done') {
            const err: any = new Error("Stop is already complete");
            err.code = "ALREADY_COMPLETE";
            throw err;
        }

        // 2. Insert clean_logs and update route_run_stops
        await client.query("BEGIN");

        const insertLogQuery = `
      INSERT INTO clean_logs (
        route_run_stop_id,
        stop_id,
        user_id,
        duration_minutes,
        picked_up_litter,
        emptied_trash,
        washed_shelter,
        washed_pad,
        washed_can,
        photo_keys,
        cleaned_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING id
    `;

        // Ensure photo_keys is an array or null
        const photoKeysVal = Array.isArray(photo_keys) ? photo_keys : null;

        const logRes = await client.query(insertLogQuery, [
            routeRunStopId,
            stop_id,
            user_id,
            duration_minutes,
            picked_up_litter,
            emptied_trash,
            washed_shelter,
            washed_pad,
            washed_can,
            photoKeysVal,
        ]);
        const cleanLogId = logRes.rows[0].id;

        // 2b. Insert infra issues if any
        if (infraIssues && infraIssues.length > 0) {
            await createInfrastructureIssuesForRouteRunStop(client, {
                routeRunStopId,
                stopId: stop_id,
                reportedBy: user_id,
                issues: infraIssues,
            });
        }

        // 2c. Update trash volume and log it (if provided)
        if (trashVolume !== undefined) {
            const updateVolumeQuery = `
                UPDATE route_run_stops
                SET trash_volume = $1
                WHERE id = $2
             `;
            await client.query(updateVolumeQuery, [trashVolume, routeRunStopId]);

            const logVolumeQuery = `
                INSERT INTO trash_volume_logs (
                    route_run_stop_id,
                    stop_id,
                    volume
                ) VALUES ($1, $2, $3)
             `;
            await client.query(logVolumeQuery, [routeRunStopId, stop_id, trashVolume]);
        }

        const updateStopQuery = `
      UPDATE route_run_stops
      SET status = 'done',
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `;
        await client.query(updateStopQuery, [routeRunStopId]);

        await client.query("COMMIT");

        // 3. Check & Update Route Status
        await checkAndCompleteRouteRun(client, route_run_id);

        // 4. Return updated run
        const routeRun = await loadRouteRunById(route_run_id);
        return {
            cleanLogId,
            routeRun,
        };
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}
