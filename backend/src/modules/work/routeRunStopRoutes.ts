import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { completeStop } from "../../services/cleanLogService";
import { createHazardForRouteRunStop } from "../../services/hazardService";
import { pool } from "../../db";

export const routeRunStopRoutes = Router();

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

            // DEV ONLY: Assume user_id = 123 for now
            const user_id = 123;

            // 1. Validate safety photo in DB (Mandatory for skip)
            const { countStopPhotosByRouteRunStop } = await import("../../services/stopPhotosService");
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
            });

            const updateQuery = `
                UPDATE route_run_stops
                SET status = 'skipped',
                    hazard_id = $1,
                    completed_at = COALESCE(completed_at, NOW()),
                    updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `;
            const updateRes = await client.query(updateQuery, [hazard.id, id]);

            await client.query("COMMIT");

            // 4. Reload Route Run (and check for completion first)
            const { loadRouteRunById, checkAndCompleteRouteRun } = await import("../../services/routeRunService");
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
            } = req.body;

            // DEV ONLY: Assume user_id = 123 for now
            const user_id = 123;

            // Validate photo_keys (Required for completion)
            // Check legacy photo_keys OR new stop_photos
            const hasLegacyPhotos = Array.isArray(photo_keys) && photo_keys.length > 0 && !!photo_keys[0];

            let hasNewPhotos = false;
            if (!hasLegacyPhotos) {
                const { countStopPhotosByRouteRunStop } = await import("../../services/stopPhotosService");
                const count = await countStopPhotosByRouteRunStop(pool, Number(route_run_stop_id));
                hasNewPhotos = count > 0;
            }

            if (!hasLegacyPhotos && !hasNewPhotos) {
                return res.status(400).json({ error: "After photo is required to complete a stop" });
            }

            // Validate trashVolume (Required for completion)
            if (trashVolume === undefined || trashVolume === null) {
                return res.status(400).json({ error: "trashVolume is required" });
            }
            if (!Number.isInteger(trashVolume) || trashVolume < 0 || trashVolume > 4) {
                return res.status(400).json({ error: "trashVolume must be an integer between 0 and 4" });
            }

            // Validate cleaning tasks (At least one required)
            const anyCleaningTask =
                !!picked_up_litter ||
                !!emptied_trash ||
                !!washed_shelter ||
                !!washed_pad;

            if (!anyCleaningTask) {
                return res.status(400).json({ error: "At least one cleaning task must be true to complete a stop" });
            }

            // Start transaction for complete + hazard
            const client = await pool.connect();
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
                    });

                    // Link the hazard to the route_run_stop for visibility in route_run_stops
                    await client.query(
                        `UPDATE route_run_stops
                         SET hazard_id = $1,
                             updated_at = NOW()
                         WHERE id = $2`,
                        [hazard.id, route_run_stop_id]
                    );
                }

                // 2. IMPORTANT: Do NOT create hazards from the Cleaning flow.
                // Hazards must only be recorded via the explicit `safety` object (Safety step) or skip-with-hazard.
                // We ignore any legacy/accidental `hazards` payload to prevent duplicates and semantic drift.
                // (Optional: keep this console to help catch FE regressions during pilot.)
                if (req.body.hazards) {
                    console.warn(
                        "Ignoring `hazards` payload on complete-stop; hazards must come from `safety` step only.",
                        { route_run_stop_id }
                    );
                    console.warn(
                        "If hazards are being selected in the Cleaning step UI, the frontend must send them under `safety.hazard_types` (Safety step), not `hazards[]`.",
                        { route_run_stop_id }
                    );
                }

                await client.query("COMMIT");
            } catch (err) {
                await client.query("ROLLBACK");
                throw err;
            } finally {
                client.release();
            }

            const result = await completeStop(route_run_stop_id, {
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
            });

            if (!result) {
                return res.status(404).json({ error: "ROUTE_NOT_FOUND", message: "Route run stop not found" });
            }

            return res.json({
                ok: true,
                clean_log_id: result.cleanLogId,
                route_run: result.routeRun,
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
