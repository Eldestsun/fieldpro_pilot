
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
import { resolveNumericOrgId } from "../../middleware/resolveOrgId";

export const routeRunStopRoutes = Router();

// POST /route-run-stops/:id/start is also registered in routeRunRoutes.ts (Lead/Admin variant
// that allows pending/planned/assigned → in_progress and is idempotent on in_progress).
// This UL-only variant allows only pending → in_progress and returns 409 if already started.
// The routeRunRoutes version takes precedence (registered first in app.ts).
// @openapi JSDoc is on the routeRunRoutes.ts version; coverage check passes via that entry.
routeRunStopRoutes.post(
    "/route-run-stops/:id/start",
    requireAuth,
    requireAnyRole(["Specialist", "Dispatch", "Admin"]),
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

/**
 * @openapi
 * /route-run-stops/{id}/skip-with-hazard:
 *   post:
 *     summary: Skip a stop due to a safety hazard
 *     description: >
 *       Marks the stop as skipped, creates a hazard record, and closes the visit
 *       with outcome=skipped. Requires a safety photo to have been uploaded prior
 *       to calling this endpoint (validated server-side).
 *     tags: [RouteRunStops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL, Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Route run stop ID
 *         example: "7"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [hazard_types]
 *             properties:
 *               hazard_types:
 *                 type: array
 *                 items: { type: string }
 *                 minItems: 1
 *                 description: One or more safety hazard types
 *                 example: ["debris", "flooding"]
 *               notes:
 *                 type: string
 *                 description: Optional notes
 *               severity:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 description: Hazard severity (1-5)
 *                 example: 3
 *               safety_photo_key:
 *                 type: string
 *                 description: S3 key of the safety photo
 *               photo_keys:
 *                 type: array
 *                 items: { type: string }
 *                 description: Additional photo keys
 *               safety:
 *                 type: object
 *                 description: >
 *                   Nested form (alternative to flat fields):
 *                   { hazard_types, notes, severity, safety_photo_key }
 *           example:
 *             hazard_types: ["debris"]
 *             severity: 3
 *             notes: "Large debris blocking shelter entrance"
 *     responses:
 *       200:
 *         description: Stop skipped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 route_run_stop: { type: object }
 *                 route_run: { type: object }
 *             example:
 *               ok: true
 *               route_run_stop: { id: 7, status: skipped }
 *               route_run: { id: 42, status: in_progress }
 *       400:
 *         description: Validation error — safety photo missing or no hazard types
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { error: "A safety photo is required to skip a stop" }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Stop already skipped
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { error: "ALREADY_SKIPPED" }
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
routeRunStopRoutes.post(
    "/route-run-stops/:id/skip-with-hazard",
    requireAuth,
    requireAnyRole(["Specialist", "Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        const numericOrgId = await resolveNumericOrgId(req);
        const client = await pool.connect();
        try {
            await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(numericOrgId)]);
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

            // ctx.orgId is already loaded inside this handler (line ~260) and
            // matches the org-context the surrounding transaction ran in.
            const routeRun = await loadRouteRunById(lookupRes.rows[0].route_run_id, ctx.orgId);

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
            try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort reset */ }
            client.release();
        }
    }
);

/**
 * @openapi
 * /route-run-stops/{route_run_stop_id}/complete:
 *   post:
 *     summary: Complete a route run stop
 *     description: >
 *       Marks the stop as done, records a clean log entry, and emits canonical
 *       observations. Requires at least one photo to have been uploaded and at
 *       least one cleaning task checked (or spotCheck=true).
 *     tags: [RouteRunStops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL, Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: route_run_stop_id
 *         required: true
 *         schema: { type: string }
 *         description: Route run stop ID
 *         example: "7"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               duration_minutes:
 *                 type: number
 *                 description: Time spent at the stop in minutes
 *                 example: 12
 *               picked_up_litter:
 *                 type: boolean
 *                 default: false
 *               emptied_trash:
 *                 type: boolean
 *                 default: false
 *               washed_shelter:
 *                 type: boolean
 *                 default: false
 *               washed_pad:
 *                 type: boolean
 *                 default: false
 *               washed_can:
 *                 type: boolean
 *                 default: false
 *               trashVolume:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 4
 *                 description: Trash volume 0-4 (required if any cleaning task is true)
 *                 example: 2
 *               spotCheck:
 *                 type: boolean
 *                 default: false
 *                 description: True if this was an inspection-only visit with no cleaning performed
 *               photo_keys:
 *                 type: array
 *                 items: { type: string }
 *                 description: S3 keys of completion photos (legacy — prefer uploading via /uploads/signed-url)
 *               infraIssues:
 *                 type: array
 *                 items: { type: object }
 *                 description: Infrastructure issues observed at the stop
 *               safety:
 *                 type: object
 *                 description: Optional safety observation (hazard types, severity, notes)
 *                 properties:
 *                   hazard_types: { type: array, items: { type: string } }
 *                   severity: { type: integer }
 *                   notes: { type: string }
 *                   safety_photo_key: { type: string }
 *           example:
 *             duration_minutes: 12
 *             picked_up_litter: true
 *             emptied_trash: true
 *             trashVolume: 2
 *     responses:
 *       200:
 *         description: Stop completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 clean_log_id: { type: integer }
 *                 route_run: { type: object }
 *             example:
 *               ok: true
 *               clean_log_id: 55
 *               route_run: { id: 42, status: in_progress }
 *       400:
 *         description: Validation error — missing photo, missing cleaning task, or invalid trashVolume
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { error: "After photo is required to complete a stop" }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Stop is already complete
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { error: "ALREADY_COMPLETE" }
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
routeRunStopRoutes.post(
    "/route-run-stops/:route_run_stop_id/complete",
    requireAuth,
    requireAnyRole(["Specialist", "Dispatch", "Admin"]),
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
            const numericOrgId = await resolveNumericOrgId(req);
            const client = await pool.connect();
            let result: { cleanLogId: number; routeRunId: number } | null = null;
            try {
                await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(numericOrgId)]);
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
                try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort reset */ }
                client.release();
            }

            if (!result) {
                return res.status(404).json({ error: "ROUTE_NOT_FOUND", message: "Route run stop not found" });
            }

            const routeRun = await loadRouteRunById(result.routeRunId, numericOrgId);

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
