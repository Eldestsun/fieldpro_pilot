import { Router, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";
import { loadRouteRunById } from "../../domains/routeRun/loaders/loadRouteRunById";
import multer, { MulterError } from "multer";
import { uploadStopPhotos } from "../../s3Client";
import { createStopPhotos, listStopPhotosByRouteRunStop } from "../../domains/routeRunStop/stopPhotosService";
import { auditWrite, reqOrgId } from "../../middleware/auditWrite";
import {
    MAX_FILE_BYTES,
    validateMimeBytes,
    UploadRejectedError,
} from "../../middleware/uploadValidation";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 10 },
});

export const ulRoutes = Router();

/**
 * @openapi
 * /ul/inbox:
 *   get:
 *     summary: UL inbox placeholder
 *     description: Returns a confirmation that the caller has the UL role. Reserved for future inbox features.
 *     tags: [UL]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL]
 *     responses:
 *       200:
 *         description: Caller is a UL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 scope: { type: string }
 *             example:
 *               ok: true
 *               scope: UL
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
// UL-only inbox
ulRoutes.get("/ul/inbox", requireAuth, requireAnyRole(["UL"]), (_req, res) => {
    res.json({ ok: true, scope: "UL" });
});

/**
 * @openapi
 * /ul/todays-run:
 *   get:
 *     summary: Get today's active route run for the authenticated UL
 *     description: >
 *       Looks up the most recent planned or in_progress route run assigned to the
 *       caller's Azure Entra OID. Returns the full route run with stop details.
 *       Also accessible to Lead and Admin for supervisory views.
 *     tags: [UL]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL, Lead, Admin]
 *     responses:
 *       200:
 *         description: Active route run found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 route_run:
 *                   type: object
 *                   description: Full route run with stops
 *             example:
 *               ok: true
 *               route_run:
 *                 id: 42
 *                 status: in_progress
 *                 route_pool_id: POOL-001
 *                 stops: []
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: No active assigned route run found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { error: "No active assigned route run found" }
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
ulRoutes.get(
    "/ul/todays-run",
    requireAuth,
    requireAnyRole(["UL", "Lead", "Admin"]),
    async (req: any, res: Response) => {
        try {
            // Enterprise Identity: Use OID from token
            const userOid = req.user?.oid;

            if (!userOid) {
                return res.status(401).json({ error: "Missing authenticated user identity" });
            }

            // Find the latest planned/in_progress run EXPLICITLY assigned to this OID
            // Do NOT use date inference. Do NOT use integer user_id.
            const findQuery = `
        SELECT id
        FROM route_runs
        WHERE assigned_user_oid = $1
          AND status IN ('planned', 'in_progress')
        ORDER BY created_at DESC
        LIMIT 1
      `;
            const findRes = await pool.query(findQuery, [userOid]);

            if (findRes.rows.length === 0) {
                return res
                    .status(404)
                    .json({ error: "No active assigned route run found" });
            }

            const routeRunId = findRes.rows[0].id;
            const routeRun = await loadRouteRunById(routeRunId);

            return res.json({ ok: true, route_run: routeRun });
        } catch (err: any) {
            console.error("Error in /api/ul/todays-run:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/**
 * @openapi
 * /route-runs/{runId}/stops/{stopId}/photos:
 *   post:
 *     summary: Upload photos for a route run stop
 *     description: >
 *       Accepts up to 10 image files via multipart/form-data. Each file is
 *       validated for MIME type (JPEG, PNG, WebP, HEIC) and size (≤25 MB).
 *       Files are stored in S3 and references saved to the database.
 *     tags: [UL]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL, Lead, Admin]
 *     x-audit-action: upload.rejected
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: integer }
 *         description: Route run ID
 *         example: 42
 *       - in: path
 *         name: stopId
 *         required: true
 *         schema: { type: integer }
 *         description: Route run stop ID
 *         example: 7
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Up to 10 image files
 *               kind:
 *                 type: string
 *                 enum: [safety, cleaning, infrastructure, completion, skip_after]
 *                 default: completion
 *                 description: Photo category
 *     responses:
 *       200:
 *         description: Photos uploaded and saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 photos:
 *                   type: array
 *                   items: { type: object }
 *             example:
 *               ok: true
 *               photos: [{ id: 1, s3_key: "runs/42/stops/7/uuid.jpg", kind: "completion" }]
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       413:
 *         $ref: '#/components/responses/PayloadTooLarge'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
ulRoutes.post(
    "/route-runs/:runId/stops/:stopId/photos",
    requireAuth,
    requireAnyRole(["UL", "Lead", "Admin"]),
    async (req: any, res: Response) => {
        // Run multer in a promise so MulterError (LIMIT_FILE_SIZE) returns 413
        const multerErr = await new Promise<MulterError | null>((resolve) => {
            upload.array("photos", 10)(req, res as any, (err) => {
                resolve(err instanceof MulterError ? err : null);
            });
        });

        if (multerErr) {
            if (multerErr.code === "LIMIT_FILE_SIZE") {
                auditWrite({
                    org_id: reqOrgId(req),
                    actor_oid: req.user?.oid ?? "unknown",
                    action: "upload.rejected",
                    detail: { reason: "size_exceeded" },
                });
                return res.status(413).json({ error: "File exceeds 25 MB limit" });
            }
            return res.status(400).json({ error: multerErr.message });
        }

        try {
            const { runId, stopId } = req.params;
            const routeRunId = Number(runId);
            const stopRunId = Number(stopId);

            if (isNaN(routeRunId) || isNaN(stopRunId)) {
                return res.status(400).json({ error: "Invalid IDs" });
            }

            const files = req.files as Express.Multer.File[];
            if (!files || files.length === 0) {
                return res.status(400).json({ error: "No photos provided" });
            }

            const userOid = req.user?.oid;
            if (!userOid) {
                return res.status(401).json({ error: "User OID missing" });
            }

            // Per-file MIME validation before any S3 writes
            for (const file of files) {
                try {
                    validateMimeBytes(file);
                } catch (e) {
                    if (e instanceof UploadRejectedError) {
                        auditWrite({
                            org_id: reqOrgId(req),
                            actor_oid: userOid,
                            action: "upload.rejected",
                            detail: { reason: e.reason },
                        });
                        return res.status(400).json({ error: "File type not allowed" });
                    }
                    throw e;
                }
            }

            // 1. Upload to S3 (generateStorageKey + detectedMime handled in uploadStopPhotos)
            const kind = req.body.kind || "completion";
            const uploadedKeys = await uploadStopPhotos(files, {
                routeRunId,
                routeRunStopId: stopRunId,
                userOid,
                kind,
            });

            // 2. Persist to DB
            const s3Keys = uploadedKeys.map((u) => u.s3Key);
            await createStopPhotos(pool, {
                routeRunStopId: stopRunId,
                userOid,
                s3Keys,
                kind,
            });

            // 3. Return updated list
            const photos = await listStopPhotosByRouteRunStop(pool, stopRunId);
            return res.json({ ok: true, photos });

        } catch (err: any) {
            console.error("Error in POST /photos:", err);
            return res.status(500).json({ error: err.message || "Internal server error" });
        }
    }
);

/**
 * @openapi
 * /route-runs/{runId}/stops/{stopId}/photos:
 *   get:
 *     summary: List photos for a route run stop
 *     description: Returns all photos attached to the specified route run stop.
 *     tags: [UL]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL, Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema: { type: integer }
 *         description: Route run ID
 *         example: 42
 *       - in: path
 *         name: stopId
 *         required: true
 *         schema: { type: integer }
 *         description: Route run stop ID
 *         example: 7
 *     responses:
 *       200:
 *         description: List of photos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 photos:
 *                   type: array
 *                   items: { type: object }
 *             example:
 *               ok: true
 *               photos: [{ id: 1, s3_key: "runs/42/stops/7/uuid.jpg", kind: "completion" }]
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
ulRoutes.get(
    "/route-runs/:runId/stops/:stopId/photos",
    requireAuth,
    requireAnyRole(["UL", "Lead", "Admin"]),
    async (req: any, res: Response) => {
        try {
            const { stopId } = req.params;
            const stopRunId = Number(stopId);

            if (isNaN(stopRunId)) {
                return res.status(400).json({ error: "Invalid stop ID" });
            }

            const photos = await listStopPhotosByRouteRunStop(pool, stopRunId);
            return res.json({ ok: true, photos });
        } catch (err: any) {
            console.error("Error in GET /photos:", err);
            return res.status(500).json({ error: err.message });
        }
    }
);
