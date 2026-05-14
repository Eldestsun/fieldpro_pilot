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

// UL-only inbox
ulRoutes.get("/ul/inbox", requireAuth, requireAnyRole(["UL"]), (_req, res) => {
    res.json({ ok: true, scope: "UL" });
});

/** ── Get Today's Run for UL: GET /api/ul/todays-run ───────────────────── */
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

/** ── Upload Photos for Stop: POST /api/route-runs/:runId/stops/:stopId/photos ── */
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

/** ── Get Photos for Stop: GET /api/route-runs/:runId/stops/:stopId/photos ── */
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
