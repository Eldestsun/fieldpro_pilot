import { Router, Request, Response } from "express";
import { pool } from "../db";
import { OsrmStop } from "../osrmClient";
import { createRouteRun } from "../domains/routeRun/routeRunService";
import { loadRouteRunById } from "../domains/routeRun/loaders/loadRouteRunById";

export const devRoutes = Router();

/**
 * @openapi
 * /dev/generate-route-run:
 *   post:
 *     summary: Generate a test route run (development only)
 *     description: >
 *       Creates a route run for testing without authentication or OSRM optimization.
 *       **Not for production use.** This endpoint has no auth guard and is intended
 *       for local development and automated test fixtures only.
 *     tags: [Dev]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pool_id, user_id]
 *             properties:
 *               pool_id:
 *                 type: string
 *                 description: Route pool ID
 *                 example: POOL-001
 *               user_id:
 *                 type: integer
 *                 description: Legacy user ID (dev only)
 *                 example: 1
 *               base_id:
 *                 type: string
 *                 default: NORTH
 *                 example: NORTH
 *               max_stops:
 *                 type: integer
 *                 default: 25
 *                 example: 10
 *           example:
 *             pool_id: POOL-001
 *             user_id: 1
 *             base_id: NORTH
 *             max_stops: 10
 *     responses:
 *       200:
 *         description: Route run created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 route_run: { type: object }
 *             example:
 *               ok: true
 *               route_run: { id: 99, status: planned, stops: [] }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// DEV ONLY – route run generator for testing, not for production.
devRoutes.post("/dev/generate-route-run", async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        const { pool_id, user_id, base_id = "NORTH", max_stops = 25 } = req.body;

        // 1. Validate input
        if (!pool_id || !user_id) {
            return res.status(400).json({ error: "pool_id and user_id are required" });
        }

        // Check if pool exists (optional but good for validation)
        const poolCheck = await client.query(
            "SELECT id FROM route_pools WHERE id = $1",
            [pool_id]
        );
        if (poolCheck.rows.length === 0) {
            return res.status(400).json({ error: `Route pool '${pool_id}' not found` });
        }

        // 2. Select candidate stops
        const stopsQuery = `
      SELECT stop_id, lon, lat
      FROM stops
      WHERE pool_id = $1
      ORDER BY stop_id::text ASC
      LIMIT $2
    `;
        const stopsRes = await client.query(stopsQuery, [pool_id, max_stops]);

        if (stopsRes.rows.length < 2) {
            return res.status(400).json({
                error: `Not enough stops found for pool '${pool_id}' (found ${stopsRes.rows.length})`,
            });
        }

        const stops: OsrmStop[] = stopsRes.rows.map((r: any) => ({
            lon: r.lon,
            lat: r.lat,
            stop_id: r.stop_id,
        }));

        // 3. Create Route Run using helper
        const { routeRunId } = await createRouteRun(client, {
            stops,
            user_id,
            route_pool_id: pool_id,
            base_id,
        });

        // 4. Load full run payload
        const fullRouteRun = await loadRouteRunById(routeRunId);

        return res.json({ ok: true, route_run: fullRouteRun });
    } catch (err: any) {
        console.error("Error in /api/dev/generate-route-run:", err);
        return res
            .status(500)
            .json({ error: err.message || "Internal server error" });
    } finally {
        client.release();
    }
});
