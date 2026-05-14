import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { getPresignedUploadUrl } from "../../s3Client";
import { auditWrite, reqOrgId } from "../../middleware/auditWrite";
import {
    ALLOWED_MIME_TYPES,
    validateFilename,
    generateStorageKey,
    UploadRejectedError,
} from "../../middleware/uploadValidation";

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

        // 2. Validate filename (no path traversal)
        try {
            validateFilename(filename);
        } catch (e) {
            if (e instanceof UploadRejectedError) {
                auditWrite({
                    org_id: reqOrgId(req),
                    actor_oid: (req as any).user?.oid ?? "unknown",
                    action: "upload.rejected",
                    detail: { reason: e.reason },
                });
                return res.status(400).json({ error: "Invalid filename" });
            }
            throw e;
        }

        // 3. Validate content type against whitelist
        if (!ALLOWED_MIME_TYPES.has(contentType)) {
            auditWrite({
                org_id: reqOrgId(req),
                actor_oid: (req as any).user?.oid ?? "unknown",
                action: "upload.rejected",
                detail: { reason: "mime_mismatch" },
            });
            return res.status(400).json({ error: "Content type not allowed" });
        }

        // 4. Build server-generated object key (never derived from client filename)
        const objectKey = generateStorageKey(route_run_stop_id, kind, contentType);

        // 5. Generate signed URL
        const uploadUrl = await getPresignedUploadUrl({
            objectKey,
            contentType,
        });

        // 6. Return
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
