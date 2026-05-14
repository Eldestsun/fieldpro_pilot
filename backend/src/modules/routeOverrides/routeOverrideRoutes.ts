
import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";
import {
    addOverride,
    deleteOverride,
    getOverridesByPool,
} from "../../domains/routeRun/routeOverrideService";

export const routeOverrideRoutes = Router();

// Middleware: All override routes require Lead/Admin
routeOverrideRoutes.use(requireAuth);
routeOverrideRoutes.use(requireAnyRole(["Lead", "Admin"]));

/**
 * @openapi
 * /route-overrides/by-pool/{pool_id}:
 *   get:
 *     summary: List route overrides for a pool
 *     description: Returns all per-stop overrides configured for a given route pool.
 *     tags: [RouteOverrides]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: pool_id
 *         required: true
 *         schema: { type: string }
 *         description: Route pool ID
 *         example: POOL-001
 *     responses:
 *       200:
 *         description: List of overrides for the pool
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 overrides:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       pool_id: { type: string }
 *                       stop_id: { type: string }
 *                       override_type: { type: string }
 *                       value: {}
 *             example:
 *               ok: true
 *               overrides:
 *                 - id: "uuid-123"
 *                   pool_id: POOL-001
 *                   stop_id: "12345"
 *                   override_type: exclude
 *                   value: null
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
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
 * @openapi
 * /route-overrides/add:
 *   post:
 *     summary: Add a route override for a stop in a pool
 *     description: Creates a per-stop override (e.g., exclude a stop from automated route planning for a pool).
 *     tags: [RouteOverrides]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pool_id, stop_id, override_type]
 *             properties:
 *               pool_id:
 *                 type: string
 *                 example: POOL-001
 *               stop_id:
 *                 type: string
 *                 example: "12345"
 *               override_type:
 *                 type: string
 *                 example: exclude
 *               value:
 *                 description: Override value (type-dependent)
 *           example:
 *             pool_id: POOL-001
 *             stop_id: "12345"
 *             override_type: exclude
 *     responses:
 *       200:
 *         description: Override created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 override: { type: object }
 *             example:
 *               ok: true
 *               override: { id: "uuid-123", pool_id: POOL-001, stop_id: "12345", override_type: exclude }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
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
 * @openapi
 * /route-overrides/{id}:
 *   delete:
 *     summary: Delete a route override
 *     description: Removes a per-stop route override by ID.
 *     tags: [RouteOverrides]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Override ID
 *         example: "uuid-123"
 *     responses:
 *       200:
 *         description: Override deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *             example:
 *               ok: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
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
