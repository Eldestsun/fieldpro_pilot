import { pool } from "../../db";
import { checkAndCompleteRouteRun } from "../../domains/routeRun/routeRunService";
import { loadRouteRunById } from "../../domains/routeRun/loaders/loadRouteRunById";
import { createInfrastructureIssuesForRouteRunStop, InfraIssueInput } from "./infrastructureIssueService";
import { ensureVisitForRouteRunStop, closeVisitForRouteRunStop, getVisitContext } from "../../domains/visit/visitService";
import { emitObservationsForStop, StopUiPayload, emitSpotCheckObservation } from "../../domains/observation/observationService";

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
        actorOid?: string;
        safety?: { hazard_types: string[]; safetyConcern?: boolean }; // Passed for observation mapping
        spotCheck?: boolean; // New field for spot check logic
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
            actorOid,
            spotCheck,
        } = data;


        // 1. Start transaction immediately to lock the row
        await client.query("BEGIN");

        // 2. Look up route_run_stop with locking to prevent double-submit races
        const findQuery = `
      SELECT route_run_id, stop_id, asset_id, status, started_at
      FROM route_run_stops
      WHERE id = $1
      FOR UPDATE
    `;
        const findRes = await client.query(findQuery, [routeRunStopId]);

        if (findRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return null;
        }

        const { route_run_id, stop_id, asset_id, status, started_at } = findRes.rows[0];

        if (status === 'done') {
            await client.query("ROLLBACK");
            const err: any = new Error("Stop is already complete");
            err.code = "ALREADY_COMPLETE";
            throw err;
        }

        // Authoritative Duration Calculation
        const now = new Date();
        let computedDuration: number | null = null;
        if (started_at) {
            const start = new Date(started_at);
            const diffMs = now.getTime() - start.getTime();
            computedDuration = Math.max(1, Math.ceil(diffMs / 60000));
        }

        // 2. Insert clean_logs and update route_run_stops
        // (Transaction already started)


        // Ensure visit exists for this stop execution
        const visitId = await ensureVisitForRouteRunStop(client, {
            routeRunStopId: Number(routeRunStopId),
            actorOid: actorOid || "unknown",
            visitType: "service",
        });

        // Fetch context early for observations (used by both Spot Check and Submit phases)
        const ctx = await getVisitContext(client, Number(routeRunStopId));

        // Spot Check observation (document-only, no payload)
        if (spotCheck === true) {
            await emitSpotCheckObservation({
                pool: client,
                visitId,
                orgId: ctx.orgId,
                locationId: ctx.locationId,
                assetId: ctx.assetId,
                actorOid: actorOid || "unknown",
            });
            // Re-use keys for main payload if needed, but we typically use them from input
        }

        // Fetch context if we didn't already (e.g. if spotCheck was false)
        // Or better, just fetch it once above.
        // It's cheaper to just fetch it once.
        // HOWEVER, the code below used `ctx` at line 180+. I removed it from 188.
        // So I must ensure `ctx` is available for the bottom part too.

        // Strategy: 
        // 1. Fetch ctx ONCE before the spotCheck check.
        // 2. Use it for spotCheck.
        // 3. Use it for the bottom part.

        // Wait, the ReplacementChunks logic requires me to be precise about what I am replacing.
        // I deleted line 188. I need to insert `const ctx = ...` somewhere above line 94.

        // Correction: I will do this in two chunks correctly.


        const insertLogQuery = `
      INSERT INTO clean_logs (
        visit_id,
        route_run_stop_id,
        stop_id,
        asset_id,
        user_id,
        duration_minutes,
        picked_up_litter,
        emptied_trash,
        washed_shelter,
        washed_pad,
        washed_can,
        photo_keys,
        cleaned_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;

        // Ensure photo_keys is an array or null
        const photoKeysVal = Array.isArray(photo_keys) ? photo_keys : null;

        const logRes = await client.query(insertLogQuery, [
            visitId,
            routeRunStopId,
            stop_id,
            asset_id,
            user_id,
            computedDuration, // Authoritative duration (can be null)
            picked_up_litter,
            emptied_trash,
            washed_shelter,
            washed_pad,
            washed_can,
            photoKeysVal,
            now // Use consistent timestamp
        ]);
        const cleanLogId = logRes.rows[0].id;

        // 2b. Insert infra issues if any
        if (infraIssues && infraIssues.length > 0) {
            await createInfrastructureIssuesForRouteRunStop(client, {
                routeRunStopId,
                stopId: stop_id,
                assetId: asset_id, // Pass asset_id
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
                    visit_id,
                    route_run_stop_id,
                    stop_id,
                    asset_id,
                    volume
                ) VALUES ($1, $2, $3, $4, $5)
             `;
            await client.query(logVolumeQuery, [visitId, routeRunStopId, stop_id, asset_id, trashVolume]);
        }

        const updateStopQuery = `
      UPDATE route_run_stops
      SET status = 'done',
          completed_at = $2,
          updated_at = $2
      WHERE id = $1
    `;
        await client.query(updateStopQuery, [routeRunStopId, now]);

        // 2d. Close the visit
        // (visit was ensured at start of transaction)
        await closeVisitForRouteRunStop(client, { routeRunStopId: Number(routeRunStopId) });

        await client.query("COMMIT");

        // 3. Emit "Submit" Observations (Post-Commit, authoritative side-effect)


        // Construct UI Payload
        // Note: infraIssues uses 'issue_type' which matches our expected strings (glass_damage etc)
        // Safety: we don't have safety info here yet. 
        // We need to update the function signature to accept safety info if we want to emit it.
        // For now, assuming safety is handled by caller or we update signature. 
        // I will update signature in a separate step? No, current tool is replacing file content.
        // I will assume I can access `data.safety` if I added it?
        // Let's stick to what we have. If safety is missing, we miss safety obs.
        // But the prompt says "Complete Stop flow -> submit phase".
        // I'll add `safety` to the data interface in this replacement? No, `data` is defined at top.
        // I will just use what is available. 
        // Wait, I cannot emit incomplete observations.
        // I'll update the signature in a separate edit to allow `safety`.

        // For now, I'll put the emit logic here assuming `data` has what we need or I'll add it nearby.
        // Actually, `infraIssues` map:
        const infraNames = infraIssues?.map(i => i.issue_type as any) || [];

        const uiPayload: StopUiPayload = {
            // Safety: handled if passed, else undefined
            // Cleaning
            picked_up_litter: data.picked_up_litter,
            emptied_trash: data.emptied_trash,
            washed_shelter: data.washed_shelter,
            washed_pad: data.washed_pad,
            trash_volume: data.trashVolume as any,

            // Infrastructure
            infrastructurePresent: infraNames.length > 0,
            infrastructureIssues: infraNames,

            // Safety needs to be passed in data
            safetyConcern: (data as any).safety?.hazard_types?.length > 0,
            safetyHazards: (data as any).safety?.hazard_types,
        };

        await emitObservationsForStop({
            phase: "submit",
            visitId,
            orgId: ctx.orgId,
            assetId: ctx.assetId,
            locationId: ctx.locationId,
            actorOid: actorOid || "unknown",
            uiPayload,
        });

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
        if (routeRunStopId) {
            console.error("[completeStop] Error completing stop:", {
                routeRunStopId,
                error: err
            });
        }
        throw err;
    } finally {
        client.release();
    }
}
