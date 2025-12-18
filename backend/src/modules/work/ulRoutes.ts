import { Router, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";
import { loadRouteRunById } from "../../services/routeRunService";
import multer from "multer";
import { uploadStopPhotos } from "../../s3Client";
import { createStopPhotos, listStopPhotosByRouteRunStop } from "../../services/stopPhotosService";

const upload = multer({ storage: multer.memoryStorage() });


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
            // DEV ONLY: Assume user_id = 123 for now
            const userId = 123;

            // Find the latest planned/in_progress run for this user (regardless of date)
            const findQuery = `
        SELECT id
        FROM route_runs
        WHERE user_id = $1
          AND status IN ('planned', 'in_progress')
        ORDER BY created_at DESC
        LIMIT 1
      `;
            const findRes = await pool.query(findQuery, [userId]);

            if (findRes.rows.length === 0) {
                return res
                    .status(404)
                    .json({ error: "No active route run found for this user" });
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
    upload.array("photos", 10), // Allow up to 10 photos
    async (req: any, res: Response) => {
        try {
            const { runId, stopId } = req.params;
            const routeRunId = Number(runId);
            const stopRunId = Number(stopId);

            // Validate IDs
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

            // 1. Upload to S3
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
