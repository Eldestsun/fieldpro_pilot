import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { getPresignedUploadUrl } from "../../s3Client";

export const uploadRoutes = Router();

/** ── Presigned Upload URL: POST /api/uploads/signed-url ───────────────── */
uploadRoutes.post("/uploads/signed-url", requireAuth, requireAnyRole(["UL", "Lead", "Admin"]), async (req: Request, res: Response) => {
    try {
        const { route_run_stop_id, contentType, filename, kind = "completion" } = req.body;

        // 1. Validate
        if (!route_run_stop_id || typeof route_run_stop_id !== "number") {
            return res.status(400).json({ error: "route_run_stop_id must be a number" });
        }
        if (!contentType || typeof contentType !== "string") {
            return res.status(400).json({ error: "contentType is required" });
        }
        if (!filename || typeof filename !== "string") {
            return res.status(400).json({ error: "filename is required" });
        }

        const validKinds = ["safety", "cleaning", "infrastructure", "completion", "skip_after"];
        if (!validKinds.includes(kind)) {
            return res.status(400).json({ error: `Invalid kind. Must be one of: ${validKinds.join(", ")}` });
        }

        // 2. Build object key
        // Pattern: route-run-stops/{id}/{kind}/{timestamp}-{safeFilename}
        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
        const safeFilename = filename
            .toLowerCase()
            .replace(/[^a-z0-9.]/g, "-")
            .replace(/-+/g, "-");
        const objectKey = `route-run-stops/${route_run_stop_id}/${kind}/${timestamp}-${safeFilename}`;

        // 3. Generate signed URL
        const uploadUrl = await getPresignedUploadUrl({
            objectKey,
            contentType,
        });

        // 4. Return
        return res.json({
            ok: true,
            uploadUrl,
            objectKey,
        });
    } catch (err: any) {
        console.error("Error in /api/uploads/signed-url:", err);
        return res
            .status(500)
            .json({ error: err.message || "Internal server error" });
    }
});
