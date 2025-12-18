
import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";
import {
    addOverride,
    deleteOverride,
    getOverridesByPool,
} from "../../services/routeOverrideService";

export const routeOverrideRoutes = Router();

// Middleware: All override routes require Lead/Admin
routeOverrideRoutes.use(requireAuth);
routeOverrideRoutes.use(requireAnyRole(["Lead", "Admin"]));

/**
 * GET /api/route-overrides/by-pool/:pool_id
 */
routeOverrideRoutes.get("/by-pool/:pool_id", async (req: Request, res: Response) => {
    try {
        const { pool_id } = req.params;
        const overrides = await getOverridesByPool(pool_id, pool);
        return res.json({ ok: true, overrides });
    } catch (err: any) {
        console.error("Error in GET /by-pool/:pool_id", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
});

/**
 * POST /api/route-overrides/add
 */
routeOverrideRoutes.post("/add", async (req: Request, res: Response) => {
    try {
        const { pool_id, stop_id, override_type, value } = req.body;

        // Extract user OID safely
        const userOid = (req as any).user?.oid;
        if (!userOid) {
            return res.status(401).json({ error: "User OID missing from token" });
        }

        if (!pool_id || !stop_id || !override_type) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const override = await addOverride(
            { pool_id, stop_id, override_type, value },
            userOid,
            pool
        );
        return res.json({ ok: true, override });
    } catch (err: any) {
        console.error("Error in POST /add", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
});

/**
 * DELETE /api/route-overrides/:id
 */
routeOverrideRoutes.delete("/:id", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await deleteOverride(id, pool);
        return res.json({ ok: true });
    } catch (err: any) {
        console.error("Error in DELETE /:id", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
});
