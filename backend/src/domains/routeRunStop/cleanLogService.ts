import type { PoolClient } from "pg";
import { checkAndCompleteRouteRun } from "../../domains/routeRun/routeRunService";
import { createInfrastructureIssuesForRouteRunStop, InfraIssueInput } from "./infrastructureIssueService";
import { ensureVisitForRouteRunStop, closeVisitForRouteRunStop, getVisitContext } from "../../domains/visit/visitService";
import { emitObservationsForStop, StopUiPayload, emitSpotCheckObservation } from "../../domains/observation/observationService";

/**
 * Complete a stop and create a clean log.
 * Caller owns the transaction — this function does not BEGIN/COMMIT/ROLLBACK.
 * Returns { cleanLogId, routeRunId } or null if the stop was not found.
 */
export async function completeStop(
    client: PoolClient,
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
        safety?: { hazard_types: string[]; safetyConcern?: boolean; severity?: string | number; notes?: string };
        spotCheck?: boolean;
    }
): Promise<{ cleanLogId: number; routeRunId: number } | null> {
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

    // Lock the row and validate status
    const findRes = await client.query(
        `SELECT route_run_id, stop_id, asset_id, status, started_at
         FROM route_run_stops
         WHERE id = $1
         FOR UPDATE`,
        [routeRunStopId]
    );

    if (findRes.rows.length === 0) {
        return null;
    }

    const { route_run_id, stop_id, asset_id, status, started_at } = findRes.rows[0];

    if (status === 'done') {
        const err: any = new Error("Stop is already complete");
        err.code = "ALREADY_COMPLETE";
        throw err;
    }

    const now = new Date();
    let computedDuration: number | null = null;
    if (started_at) {
        const start = new Date(started_at);
        const diffMs = now.getTime() - start.getTime();
        computedDuration = Math.max(1, Math.ceil(diffMs / 60000));
    }

    // Ensure visit exists (no-op if already created at stop-start)
    const visitId = await ensureVisitForRouteRunStop(client, {
        routeRunStopId: Number(routeRunStopId),
        actorOid: actorOid || "unknown",
        visitType: "service",
    });

    const ctx = await getVisitContext(client, Number(routeRunStopId));

    if (spotCheck === true) {
        await emitSpotCheckObservation({
            client,
            visitId,
            orgId: ctx.orgId,
            locationId: ctx.locationId,
            assetId: ctx.assetId,
            actorOid: actorOid || "unknown",
        });
    }

    const photoKeysVal = Array.isArray(photo_keys) ? photo_keys : null;

    const logRes = await client.query(
        `INSERT INTO clean_logs (
            visit_id, route_run_stop_id, stop_id, asset_id, user_id,
            duration_minutes, picked_up_litter, emptied_trash,
            washed_shelter, washed_pad, washed_can, photo_keys, cleaned_at, org_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
            visitId, routeRunStopId, stop_id, asset_id, user_id,
            computedDuration, picked_up_litter, emptied_trash,
            washed_shelter, washed_pad, washed_can, photoKeysVal, now, ctx.orgId,
        ]
    );
    const cleanLogId = logRes.rows[0].id;

    if (infraIssues && infraIssues.length > 0) {
        await createInfrastructureIssuesForRouteRunStop(client, {
            routeRunStopId,
            stopId: stop_id,
            assetId: asset_id,
            reportedBy: user_id,
            issues: infraIssues,
        });
    }

    if (trashVolume !== undefined) {
        await client.query(
            `UPDATE route_run_stops SET trash_volume = $1 WHERE id = $2`,
            [trashVolume, routeRunStopId]
        );
        // ISSUE-031 Stage 2 — trash_volume_logs write-clip. The public.trash_volume_logs
        // dual-write mirror is stopped here; trash volume now writes ONLY canonical
        // (core.observations observation_type='trash_volume', payload.level), emitted by
        // emitObservationsForStop() below via uiPayload.trash_volume. Losslessness re-confirmed
        // in docs/audit/2026-06-18-issue-031-losslessness-reverify.md (volume → payload.level,
        // exact). The table is NOT dropped (Stage 3); it stops receiving new rows.
    }

    await client.query(
        `UPDATE route_run_stops SET status = 'done', completed_at = $2, updated_at = $2 WHERE id = $1`,
        [routeRunStopId, now]
    );

    await closeVisitForRouteRunStop(client, {
        routeRunStopId: Number(routeRunStopId),
        outcome: 'completed',
    });

    const infraNames = infraIssues?.map(i => i.issue_type as any) || [];
    const uiPayload: StopUiPayload = {
        picked_up_litter: data.picked_up_litter,
        emptied_trash:    data.emptied_trash,
        washed_shelter:   data.washed_shelter,
        washed_pad:       data.washed_pad,
        washed_can:       data.washed_can,
        trash_volume:     data.trashVolume as any,
        infrastructurePresent: infraNames.length > 0,
        infrastructureIssues:  infraNames,
        safetyConcern: (data.safety?.hazard_types?.length ?? 0) > 0,
        safetyHazards: data.safety?.hazard_types as StopUiPayload['safetyHazards'],
        hazard_severity: data.safety?.severity,
        hazard_notes: data.safety?.notes,
        // Full per-issue detail so cause/component/notes reach the observation
        // payload, not just the infrastructure_issues adapter table (ISSUE-031 Step 5).
        infraIssueDetails: infraIssues,
    };

    await emitObservationsForStop({
        phase: "submit",
        visitId,
        orgId: ctx.orgId,
        assetId: ctx.assetId,
        locationId: ctx.locationId,
        actorOid: actorOid || "unknown",
        uiPayload,
        client,
    });

    await client.query(`
        INSERT INTO stop_effort_history (
            stop_id, visit_id, run_date,
            service_minutes, stop_type, complexity_score,
            had_hazard, had_infra_issue, trash_volume, org_id
        )
        SELECT
            rrs.stop_id,
            v.id,
            rrs.created_at::date,
            EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60,
            CASE
                WHEN s.is_hotspot THEN 'hotspot'
                WHEN s.compactor  THEN 'compactor'
                ELSE 'standard'
            END,
            NULL,
            -- Generic 'safety_concern_present' was retired (canonical state layer
            -- §1, 2026-05-25) — any specific safety presence on the visit indicates
            -- a hazard occurred.
            EXISTS (
                SELECT 1 FROM core.observations o3
                WHERE o3.visit_id = v.id
                  AND o3.observation_type IN (
                    'encampment_present',
                    'fire_present',
                    'dangerous_activity_present',
                    'drug_use_present',
                    'violence_present',
                    'biohazard_present',
                    'access_blocked',
                    'other_safety_concern_present'
                  )
            ),
            -- Generic 'infrastructure_issue_present' was retired (canonical
            -- state layer §2.1, 2026-05-25) — any specific infra presence on
            -- the visit indicates an infrastructure issue occurred.
            EXISTS (
                SELECT 1 FROM core.observations o4
                WHERE o4.visit_id = v.id
                  AND o4.observation_type IN (
                    'glass_damage_present',
                    'graffiti_present',
                    'receptacle_damage_present',
                    'shelter_panel_damage_present',
                    'lighting_failure_present',
                    'access_obstructed_by_landscape',
                    'structural_damage_present',
                    'other_infrastructure_issue_present'
                  )
            ),
            (SELECT (o5.payload->>'level')::numeric FROM core.observations o5
             WHERE o5.visit_id = v.id AND o5.observation_type = 'trash_volume'
             LIMIT 1),
            v.org_id
        FROM core.visits v, route_run_stops rrs, public.stops s
        WHERE v.id = $1
          AND rrs.id = $2
          AND s.stop_id = rrs.stop_id
        ON CONFLICT (stop_id, visit_id) DO NOTHING
    `, [visitId, routeRunStopId]);

    await checkAndCompleteRouteRun(client, route_run_id);

    return { cleanLogId, routeRunId: route_run_id };
}
