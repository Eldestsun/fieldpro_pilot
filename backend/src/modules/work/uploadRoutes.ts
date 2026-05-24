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

/**
 * @openapi
 * /uploads/signed-url:
 *   post:
 *     summary: Get a pre-signed S3 upload URL for a stop photo
 *     description: >
 *       Returns a time-limited pre-signed S3 URL for direct client-to-S3 upload.
 *       The server validates filename and MIME type before issuing the URL.
 *       The object key is server-generated (UUID-based) — the client filename is
 *       never used as the storage key.
 *       Allowed MIME types: image/jpeg, image/png, image/webp, image/heic.
 *     tags: [Uploads]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL, Lead, Admin]
 *     x-audit-action: upload.rejected
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [route_run_stop_id, contentType, filename]
 *             properties:
 *               route_run_stop_id:
 *                 type: integer
 *                 description: ID of the route run stop this photo belongs to
 *                 example: 7
 *               contentType:
 *                 type: string
 *                 enum: [image/jpeg, image/png, image/webp, image/heic]
 *                 example: image/jpeg
 *               filename:
 *                 type: string
 *                 description: Original filename (validated, not used as storage key)
 *                 example: stop_photo.jpg
 *               kind:
 *                 type: string
 *                 enum: [safety, cleaning, infrastructure, completion, skip_after]
 *                 default: completion
 *                 description: Photo category
 *           example:
 *             route_run_stop_id: 7
 *             contentType: image/jpeg
 *             filename: stop_photo.jpg
 *             kind: completion
 *     responses:
 *       200:
 *         description: Pre-signed URL and server-generated object key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 uploadUrl:
 *                   type: string
 *                   description: Time-limited S3 pre-signed PUT URL
 *                 objectKey:
 *                   type: string
 *                   description: Server-generated S3 object key (use this to reference the photo)
 *             example:
 *               ok: true
 *               uploadUrl: "https://s3.amazonaws.com/bucket/runs/7/uuid.jpg?X-Amz-..."
 *               objectKey: "runs/7/completion/uuid.jpg"
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
uploadRoutes.post("/uploads/signed-url", requireAuth, requireAnyRole(["UL", "Specialist", "Lead", "Dispatch", "Admin"]), async (req: Request, res: Response) => {
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
