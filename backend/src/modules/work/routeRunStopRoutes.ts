
import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { completeStop } from "../../domains/routeRunStop/cleanLogService";
import { createHazardForRouteRunStop } from "../../domains/routeRunStop/hazardService";
import { pool } from "../../db";
import { emitObservationsForStop, StopUiPayload } from "../../domains/observation/observationService";
import {
    ensureVisitForRouteRunStop,
    closeVisitForRouteRunStop,
    getVisitContext,
} from "../../domains/visit/visitService";
import { loadRouteRunById } from "../../domains/routeRun/loaders/loadRouteRunById";
import { startRouteRunStopInternal } from "../../domains/routeRun/operations/startRouteRunStop";

export const routeRunStopRoutes = Router();

routeRunStopRoutes.post(
    "/route-run-stops/:id/start",
    requireAuth,
    requireAnyRole(["UL", "Lead", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const actorOid = req.user?.oid || "unknown";

            // Use shared internal helper (Strict Neutrality)
            // Endpoint Logic: Only 'pending' is allowed.
            const result = await startRouteRunStopInternal(pool, {
                routeRunStopId: id,
                actorOid,
                allowedStatuses: ["pending"],
            });

            if (result.updated) {
                // Success
                return res.json({ ok: true, route_run_stop: result.row });
            } else {
                // Failure (Idempotency / Conflict)
                // UL Endpoint: 409 if not pending (no idempotent success for already started)
                return res.status(409).json({ error: "Stop already started or not pending" });
            }

        } catch (err: any) {
            console.error("Error in /api/route-run-stops/:id/start:", err);
            return res.status(500).json({ error: err.message });
        }
    }
);

/** ── Skip with Hazard: POST /api/route-run-stops/:id/skip-with-hazard ── */
routeRunStopRoutes.post(
    "/route-run-stops/:id/skip-with-hazard",
    requireAuth,
    requireAnyRole(["UL", "Lead", "Admin"]),
    async (req: Request, res: Response) => {
        const client = await pool.connect();
        try {
            const { id } = req.params;
            // Accept both shapes:
            //  - legacy: { hazard_types, notes, severity, safety_photo_key, photo_keys }
            //  - nested: { safety: { hazard_types, notes, severity, safety_photo_key }, photo_keys }
            const {
                hazard_types: hazard_types_legacy,
                notes: notes_legacy,
                severity: severity_legacy,
                safety_photo_key: safety_photo_key_legacy,
                photo_keys,
                safety,
            } = req.body;

            const hazard_types = hazard_types_legacy ?? safety?.hazard_types;
            const notes = notes_legacy ?? safety?.notes;
            const severity = severity_legacy ?? safety?.severity;
            const safety_photo_key = safety_photo_key_legacy ?? safety?.safety_photo_key;

            // LEGACY: user_id is a transit-adapter field with no FK and no canonical significance.
            // core.visits.captured_by_oid carries the real identity (already wired via auth context).
            // This field will be removed when clean_logs is deprecated post-Tier-2.
            const LEGACY_TRANSIT_USER_ID = 0;
            const user_id = LEGACY_TRANSIT_USER_ID;

            // 1. Validate safety photo in DB (Mandatory for skip)
            const { countStopPhotosByRouteRunStop } = await import("../../domains/routeRunStop/stopPhotosService");
            const photoCount = await countStopPhotosByRouteRunStop(pool, Number(id), 'safety');

            if (photoCount === 0) {
                return res.status(400).json({ error: "A safety photo is required to skip a stop" });
            }

            // Ensure hazard types are present
            if (!hazard_types || !Array.isArray(hazard_types) || hazard_types.length === 0) {
                return res.status(400).json({ error: "At least one safety hazard must be selected to skip a stop" });
            }

            // 2. Load route_run_stop and validate status
            const lookupQuery = `
                SELECT status, stop_id, route_run_id 
                FROM route_run_stops 
                WHERE id = $1
    `;
            const lookupRes = await client.query(lookupQuery, [id]);

            if (lookupRes.rows.length === 0) {
                return res.status(404).json({ error: "ROUTE_NOT_FOUND", message: "Route run stop not found" });
            }

            const { status } = lookupRes.rows[0];
            if (status === 'skipped') {
                return res.status(409).json({ error: "ALREADY_SKIPPED", message: "Stop is already skipped." });
            }
            if (status !== "pending" && status !== "in_progress") {
                return res.status(400).json({ error: `Cannot skip stop in status '${status}'` });
            }

            // 3. Transaction: Insert Hazard + Update Status
            await client.query("BEGIN");

            const hazard = await createHazardForRouteRunStop(client, {
                routeRunStopId: id,
                userId: user_id,
                hazardTypes: hazard_types || [], // Ensure array
                severity,
                notes,
                photoKey: safety_photo_key,
                photoKeys: photo_keys,
                source: "ul_skip_flow",
                actorOid: req.user?.oid || "unknown",
            });

            const updateQuery = `
                UPDATE route_run_stops
                SET status = 'skipped',
                hazard_id = $1,
                completed_at = NOW(),
                updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `;
            const updateRes = await client.query(updateQuery, [hazard.id, id]);

            // Ensure visit exists (idempotent — no-op if already created at stop-start)
            const visitId = await ensureVisitForRouteRunStop(client, {
                routeRunStopId: Number(id),
                actorOid: req.user?.oid || "unknown",
                visitType: "service",
            });

            await closeVisitForRouteRunStop(client, {
                routeRunStopId: Number(id),
                outcome: 'skipped',
                reasonCode: hazard_types?.[0],
            });

            await client.query("COMMIT");

            // 5. Emit "Submit" Observations (Post-Commit, authoritative side-effect)
            const ctx = await getVisitContext(client, Number(id));

            const uiPayload: StopUiPayload = {
                skipForSafety: true,
                safetyConcern: true,
                safetyHazards: hazard_types,
                hazard_severity: severity,
                // No cleaning or infra actions on skip
            };

            await emitObservationsForStop({
                phase: "submit",
                visitId,
                orgId: ctx.orgId,
                assetId: ctx.assetId,
                locationId: ctx.locationId,
                actorOid: req.user?.oid || "unknown",
                uiPayload,
            });

            // 4. Reload Route Run (and check for completion first)
            const { checkAndCompleteRouteRun } = await import("../../domains/routeRun/routeRunService");
            await checkAndCompleteRouteRun(client, lookupRes.rows[0].route_run_id);

            const routeRun = await loadRouteRunById(lookupRes.rows[0].route_run_id);

            return res.json({
                ok: true,
                route_run_stop: updateRes.rows[0],
                route_run: routeRun,
            });
        } catch (err: any) {
            await client.query("ROLLBACK");
            console.error("Error in /api/route-run-stops/:id/skip-with-hazard:", err);
            return res.status(500).json({ error: err.message || "Internal server error" });
        } finally {
            client.release();
        }
    }
);

/** ── Complete Stop: POST /api/route-run-stops/:route_run_stop_id/complete ── */
routeRunStopRoutes.post(
    "/route-run-stops/:route_run_stop_id/complete",
    requireAuth,
    requireAnyRole(["UL", "Lead", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { route_run_stop_id } = req.params;
            const {
                // user_id, // Ignored from body, using constant for dev
                duration_minutes,
                picked_up_litter = false,
                emptied_trash = false,
                washed_shelter = false,
                washed_pad = false,
                washed_can = false,
                photo_keys, // optional array of strings
                infraIssues, // optional array of infra issues
                safety, // optional safety object { hazard_types[], notes?, severity?, safety_photo_key? }
                trashVolume, // optional integer 0-4
                spotCheck, // optional boolean
            } = req.body;

            // LEGACY: user_id is a transit-adapter field with no FK and no canonical significance.
            // core.visits.captured_by_oid carries the real identity (already wired via auth context).
            // This field will be removed when clean_logs is deprecated post-Tier-2.
            const LEGACY_TRANSIT_USER_ID = 0;
            const user_id = LEGACY_TRANSIT_USER_ID;

            // Validate photo_keys (Required for completion)
            // Check legacy photo_keys OR new stop_photos
            const hasLegacyPhotos = Array.isArray(photo_keys) && photo_keys.length > 0 && !!photo_keys[0];

            let hasNewPhotos = false;
            if (!hasLegacyPhotos) {
                const { countStopPhotosByRouteRunStop } = await import("../../domains/routeRunStop/stopPhotosService");
                const count = await countStopPhotosByRouteRunStop(pool, Number(route_run_stop_id));
                hasNewPhotos = count > 0;
            }

            if (!hasLegacyPhotos && !hasNewPhotos) {
                return res.status(400).json({ error: "After photo is required to complete a stop" });
            }

            // Validate cleaning tasks or Spot Check
            const anyCleaningTask =
                !!picked_up_litter ||
                !!emptied_trash ||
                !!washed_shelter ||
                !!washed_pad ||
                !!washed_can;

            const isSpotCheck = spotCheck === true;

            if (!anyCleaningTask && !isSpotCheck) {
                return res.status(400).json({ error: "Stop completion requires a cleaning action or a spot check" });
            }

            // Validate trashVolume (Required only if cleaning)
            if (anyCleaningTask) {
                if (trashVolume === undefined || trashVolume === null) {
                    return res.status(400).json({ error: "trashVolume is required" });
                }
                if (!Number.isInteger(trashVolume) || trashVolume < 0 || trashVolume > 4) {
                    return res.status(400).json({ error: "trashVolume must be an integer between 0 and 4" });
                }
            }



            // Single atomic transaction: hazard write + all stop completion writes
            const client = await pool.connect();
            let result: { cleanLogId: number; routeRunId: number } | null = null;
            try {
                await client.query("BEGIN");

                // 1. If hazard present in safety object, create it (Safety step)
                if (safety && Array.isArray(safety.hazard_types) && safety.hazard_types.length > 0) {
                    const hazard = await createHazardForRouteRunStop(client, {
                        routeRunStopId: route_run_stop_id,
                        userId: user_id,
                        hazardTypes: safety.hazard_types,
                        severity: safety.severity,
                        notes: safety.notes,
                        photoKey: safety.safety_photo_key,
                        source: "ul_safety_flow",
                        actorOid: req.user?.oid || "unknown",
                    });

                    await client.query(
                        `UPDATE route_run_stops SET hazard_id = $1, updated_at = NOW() WHERE id = $2`,
                        [hazard.id, route_run_stop_id]
                    );
                }

                if (req.body.hazards) {
                    console.warn(
                        "Ignoring `hazards` payload on complete-stop; hazards must come from `safety` step only.",
                        { route_run_stop_id }
                    );
                }

                // 2. All stop completion writes inside the same transaction
                result = await completeStop(client, route_run_stop_id, {
                    user_id,
                    duration_minutes,
                    picked_up_litter,
                    emptied_trash,
                    washed_shelter,
                    washed_pad,
                    washed_can,
                    photo_keys,
                    infraIssues,
                    trashVolume,
                    actorOid: req.user?.oid || "unknown",
                    safety,
                    spotCheck: isSpotCheck,
                });

                await client.query("COMMIT");
            } catch (err) {
                await client.query("ROLLBACK");
                throw err;
            } finally {
                client.release();
            }

            if (!result) {
                return res.status(404).json({ error: "ROUTE_NOT_FOUND", message: "Route run stop not found" });
            }

            const routeRun = await loadRouteRunById(result.routeRunId);

            return res.json({
                ok: true,
                clean_log_id: result.cleanLogId,
                route_run: routeRun,
            });
        } catch (err: any) {
            if (err.code === "ALREADY_COMPLETE") {
                return res.status(409).json({ error: "ALREADY_COMPLETE", message: "Stop is already complete." });
            }
            console.error("Error in /api/route-run-stops/:id/complete:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);
