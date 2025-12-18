import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";

export const stopRoutes = Router();

// PATCH /stops/:stop_id/hotspot
stopRoutes.patch(
    "/stops/:stop_id/hotspot",
    requireAuth,
    requireAnyRole(["UL", "Lead", "Admin"]),
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
                UPDATE stops
                SET is_hotspot = $1
                WHERE "STOP_ID" = $2
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

// PATCH /stops/:stop_id/compactor
stopRoutes.patch(
    "/stops/:stop_id/compactor",
    requireAuth,
    requireAnyRole(["Lead", "Admin"]),
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
                UPDATE stops
                SET compactor = $1
                WHERE "STOP_ID" = $2
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

// PATCH /stops/:stop_id/has-trash
stopRoutes.patch(
    "/stops/:stop_id/has-trash",
    requireAuth,
    requireAnyRole(["Lead", "Admin"]),
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
                UPDATE stops
                SET has_trash = $1
                WHERE "STOP_ID" = $2
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
