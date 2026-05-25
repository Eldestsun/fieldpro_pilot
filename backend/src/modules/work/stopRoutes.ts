import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";

export const stopRoutes = Router();

/**
 * @openapi
 * /stops/{stop_id}/hotspot:
 *   patch:
 *     summary: Mark or unmark a stop as a hotspot
 *     description: Updates the is_hotspot flag on the stop. UL, Lead, and Admin can toggle this.
 *     tags: [Stops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL, Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: stop_id
 *         required: true
 *         schema: { type: string }
 *         description: Transit stop ID
 *         example: "12345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [is_hotspot]
 *             properties:
 *               is_hotspot:
 *                 type: boolean
 *                 description: Whether this stop is a hotspot
 *           example:
 *             is_hotspot: true
 *     responses:
 *       200:
 *         description: Flag updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 stop_id: { type: string }
 *                 is_hotspot: { type: boolean }
 *             example:
 *               ok: true
 *               stop_id: "12345"
 *               is_hotspot: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// PATCH /stops/:stop_id/hotspot
stopRoutes.patch(
    "/stops/:stop_id/hotspot",
    requireAuth,
    requireAnyRole(["Specialist", "Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { stop_id } = req.params;
            const { is_hotspot } = req.body;

            if (!stop_id || typeof stop_id !== "string") {
                return res.status(400).json({ error: "Invalid stop_id" });
            }

            if (typeof is_hotspot !== "boolean") {
                return res.status(400).json({ error: "is_hotspot must be a boolean" });
            }

            const query = `
                UPDATE public.transit_stops
                SET is_hotspot = $1
                WHERE stop_id = $2
            `;

            const result = await pool.query(query, [is_hotspot, stop_id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: "Stop not found" });
            }

            return res.json({ ok: true, stop_id, is_hotspot });
        } catch (err: any) {
            console.error("Error in PATCH /stops/:stop_id/hotspot:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/**
 * @openapi
 * /stops/{stop_id}/compactor:
 *   patch:
 *     summary: Set the compactor flag on a stop
 *     description: Marks whether a stop has a trash compactor. Lead and Admin only.
 *     tags: [Stops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: stop_id
 *         required: true
 *         schema: { type: string }
 *         description: Transit stop ID
 *         example: "12345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [compactor]
 *             properties:
 *               compactor:
 *                 type: boolean
 *           example:
 *             compactor: true
 *     responses:
 *       200:
 *         description: Flag updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 stop_id: { type: string }
 *                 compactor: { type: boolean }
 *             example:
 *               ok: true
 *               stop_id: "12345"
 *               compactor: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// PATCH /stops/:stop_id/compactor
stopRoutes.patch(
    "/stops/:stop_id/compactor",
    requireAuth,
    requireAnyRole(["Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { stop_id } = req.params;
            const { compactor } = req.body;

            if (!stop_id || typeof stop_id !== "string") {
                return res.status(400).json({ error: "Invalid stop_id" });
            }

            if (typeof compactor !== "boolean") {
                return res.status(400).json({ error: "compactor must be a boolean" });
            }

            const query = `
                UPDATE public.transit_stops
                SET compactor = $1
                WHERE stop_id = $2
            `;

            const result = await pool.query(query, [compactor, stop_id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: "Stop not found" });
            }

            return res.json({ ok: true, stop_id, compactor });
        } catch (err: any) {
            console.error("Error in PATCH /stops/:stop_id/compactor:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/**
 * @openapi
 * /stops/{stop_id}/has-trash:
 *   patch:
 *     summary: Set the has-trash flag on a stop
 *     description: Marks whether a stop has a trash receptacle. Lead and Admin only.
 *     tags: [Stops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: stop_id
 *         required: true
 *         schema: { type: string }
 *         description: Transit stop ID
 *         example: "12345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [has_trash]
 *             properties:
 *               has_trash:
 *                 type: boolean
 *           example:
 *             has_trash: true
 *     responses:
 *       200:
 *         description: Flag updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 stop_id: { type: string }
 *                 has_trash: { type: boolean }
 *             example:
 *               ok: true
 *               stop_id: "12345"
 *               has_trash: true
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// PATCH /stops/:stop_id/has-trash
stopRoutes.patch(
    "/stops/:stop_id/has-trash",
    requireAuth,
    requireAnyRole(["Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { stop_id } = req.params;
            const { has_trash } = req.body;

            if (!stop_id || typeof stop_id !== "string") {
                return res.status(400).json({ error: "Invalid stop_id" });
            }

            if (typeof has_trash !== "boolean") {
                return res.status(400).json({ error: "has_trash must be a boolean" });
            }

            const query = `
                UPDATE public.transit_stops
                SET has_trash = $1
                WHERE stop_id = $2
            `;

            const result = await pool.query(query, [has_trash, stop_id]);

            if (result.rowCount === 0) {
                return res.status(404).json({ error: "Stop not found" });
            }

            return res.json({ ok: true, stop_id, has_trash });
        } catch (err: any) {
            console.error("Error in PATCH /stops/:stop_id/has-trash:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);
