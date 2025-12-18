import { Router, Request, Response } from "express";
import { pool } from "../db";
import { OsrmStop } from "../osrmClient";
import { createRouteRun, loadRouteRunById } from "../services/routeRunService";

export const devRoutes = Router();

/** ── Dev Only: Generate Route Run ─────────────────────────────────────── */
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
      SELECT "STOP_ID", lon, lat
      FROM stops
      WHERE pool_id = $1
      ORDER BY "STOP_ID"::text ASC
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
            stop_id: r.STOP_ID,
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

