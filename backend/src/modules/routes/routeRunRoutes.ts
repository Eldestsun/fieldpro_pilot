import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";
import { planRouteWithOsrm, OsrmStop } from "../../osrmClient";
import {
    createRouteRun,
    loadRouteRunById,
    startRouteRun,
    finishRouteRun,
    getCandidateStopsForPoolWithRisk,
} from "../../services/routeRunService";

export const routeRunRoutes = Router();

const MAX_OSRM_STOPS = 25;
const PILOT_DEV_UL_USER_ID = 123;

// Lead-only hub
routeRunRoutes.get("/lead/hub", requireAuth, requireAnyRole(["Lead"]), (_req, res) => {
    res.json({ ok: true, scope: "Lead" });
});

/** ── Lead: Get Today's Runs: GET /lead/todays-runs ───────────────────── */
routeRunRoutes.get(
    "/lead/todays-runs",
    requireAuth,
    requireAnyRole(["Lead", "Admin"]),
    async (_req, res) => {
        try {
            const query = `
        SELECT
          rr.id,
          rr.user_id,
          rr.route_pool_id,
          rr.base_id,
          rr.status,
          rr.run_date,
          rr.created_at,
          COALESCE(rs.stop_count, 0) AS stop_count
        FROM route_runs rr
        LEFT JOIN (
          SELECT route_run_id, COUNT(*) AS stop_count
          FROM route_run_stops
          GROUP BY route_run_id
        ) rs ON rs.route_run_id = rr.id
        WHERE rr.status IN ('planned', 'in_progress')
        ORDER BY rr.created_at DESC;
      `;
            const result = await pool.query(query);
            return res.json({ ok: true, route_runs: result.rows });
        } catch (err: any) {
            console.error("Error in /lead/todays-runs:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/** ── Lead: Get Route Run Details: GET /lead/route-runs/:id ──────────────── */
routeRunRoutes.get(
    "/lead/route-runs/:id",
    requireAuth,
    requireAnyRole(["Lead", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const routeRun = await loadRouteRunById(id);

            if (!routeRun) {
                return res.status(404).json({ error: "Route run not found" });
            }

            return res.json({ ok: true, route_run: routeRun });
        } catch (err: any) {
            console.error("Error in GET /lead/route-runs/:id:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/** ── Lead: Get Route Run Details: GET /lead/route-runs/:id ──────────────── */
routeRunRoutes.get(
    "/lead/route-runs/:id",
    requireAuth,
    requireAnyRole(["Lead", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const routeRun = await loadRouteRunById(id);

            if (!routeRun) {
                return res.status(404).json({ error: "Route run not found" });
            }

            return res.json({ ok: true, route_run: routeRun });
        } catch (err: any) {
            console.error("Error in GET /lead/route-runs/:id:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/** ── OSRM route planning: POST /api/routes/plan ──────────────────────── */
routeRunRoutes.post("/routes/plan", async (req: Request, res: Response) => {
    try {
        const { stop_ids } = req.body;

        if (!Array.isArray(stop_ids) || stop_ids.length < 2) {
            return res
                .status(400)
                .json({ error: "stop_ids must be an array with at least two items" });
        }

        // 1) Look up lon/lat for the requested stops
        const query = `
      SELECT "STOP_ID", lon, lat
      FROM stops
      WHERE "STOP_ID" = ANY($1::text[])
    `;
        const result = await pool.query(query, [stop_ids]);

        if (result.rows.length < 2) {
            return res.status(400).json({
                error: "Not enough stops found with coordinates",
                found: result.rows.length,
            });
        }

        const stops: OsrmStop[] = result.rows.map((r: any) => ({
            lon: r.lon,
            lat: r.lat,
            stop_id: r.STOP_ID,
        }));

        // 2) Ask OSRM for an optimized trip
        const planned = await planRouteWithOsrm(stops);

        // 3) Return the planned route
        return res.json({
            ok: true,
            distance_m: planned.distance_m,
            duration_s: planned.duration_s,
            ordered_stops: planned.ordered_stops,
            legs: planned.legs,
        });
    } catch (err: any) {
        console.error("Error in /api/routes/plan:", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
});

/** ── Route Run Preview: POST /api/route-runs/preview ──────────────────── */
routeRunRoutes.post("/route-runs/preview", async (req: Request, res: Response) => {
    try {
        const { stop_ids, pool_id, ul_id, run_date } = req.body;

        let stopsToPlan: OsrmStop[] = [];

        // Option A: Explicit stop_ids provided
        if (Array.isArray(stop_ids) && stop_ids.length >= 2) {
            const query = `
        SELECT "STOP_ID", lon, lat, "ON_STREET_NAME", "BEARING_CODE"
        FROM stops
        WHERE "STOP_ID" = ANY($1::text[])
      `;
            const result = await pool.query(query, [stop_ids]);

            if (result.rows.length < 2) {
                return res.status(400).json({
                    error: "Not enough stops found with coordinates",
                    found: result.rows.length,
                });
            }
            stopsToPlan = result.rows.map((r: any) => ({
                lon: r.lon,
                lat: r.lat,
                stop_id: r.STOP_ID,
                on_street_name: r.ON_STREET_NAME,
                bearing_code: r.BEARING_CODE,
            }));
        }
        // Option B: pool_id provided -> fetch with risk logic
        else if (pool_id) {
            // We need a pool client to call the helper, or we can use the pool directly (helper takes 'any')
            stopsToPlan = await getCandidateStopsForPoolWithRisk(pool_id, MAX_OSRM_STOPS, pool);

            if (stopsToPlan.length < 2) {
                return res.status(400).json({
                    error: `Not enough stops found in pool '${pool_id}'`,
                    found: stopsToPlan.length,
                });
            }
        } else {
            return res.status(400).json({
                error: "Must provide either stop_ids (array) or pool_id",
            });
        }

        // 2) Ask OSRM for an optimized trip
        // Note: stopsToPlan is already limited by MAX_OSRM_STOPS if it came from the helper. 
        // If it came from Option A (explicit list), it might be longer, so we still slice for OSRM limit safety.
        const osrmStops =
            stopsToPlan.length > MAX_OSRM_STOPS
                ? stopsToPlan.slice(0, MAX_OSRM_STOPS)
                : stopsToPlan;

        const planned = await planRouteWithOsrm(osrmStops);

        // 3) Return the planned route
        return res.json({
            ok: true,
            truncated: stopsToPlan.length > MAX_OSRM_STOPS, // approximate check
            total_stops: stopsToPlan.length,
            used_stops: osrmStops.length,
            distance_m: planned.distance_m,
            duration_s: planned.duration_s,
            ordered_stops: planned.ordered_stops,
            legs: planned.legs,
        });
    } catch (err: any) {
        console.error("Error in /api/route-runs/preview:", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
});

/** ── Create Route Run: POST /api/route-runs ───────────────────────────── */
routeRunRoutes.post("/route-runs", async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        const { stop_ids, base_id = "NORTH", route_pool_id, pool_id, run_date } = req.body;

        // Normalize inputs
        const targetPoolId = route_pool_id || pool_id;

        // For the pilot, we force all created routes to be assigned to the dev UL user (123)
        // so that the specific Entra account can see them.
        const targetUserId = PILOT_DEV_UL_USER_ID;

        if (!targetPoolId) {
            return res.status(400).json({ error: "Missing required field: pool_id" });
        }

        let stopsToPlan: OsrmStop[] | undefined = [];

        // Option A: Explicit stop_ids
        if (Array.isArray(stop_ids) && stop_ids.length >= 2) {
            const query = `
        SELECT "STOP_ID", lon, lat, "ON_STREET_NAME", "BEARING_CODE"
        FROM stops
        WHERE "STOP_ID" = ANY($1::text[])
      `;
            const result = await client.query(query, [stop_ids]);
            if (result.rows.length < 2) {
                return res.status(400).json({
                    error: "Not enough stops found with coordinates",
                    found: result.rows.length,
                });
            }
            stopsToPlan = result.rows.map((r: any) => ({
                lon: r.lon,
                lat: r.lat,
                stop_id: r.STOP_ID,
                on_street_name: r.ON_STREET_NAME,
                bearing_code: r.BEARING_CODE,
            }));

            // Apply truncation for explicit list
            if (stopsToPlan.length > MAX_OSRM_STOPS) {
                stopsToPlan = stopsToPlan.slice(0, MAX_OSRM_STOPS);
            }
        }
        // Option B: pool_id - Pass undefined/empty to createRouteRun to let it fetch
        else {
            stopsToPlan = undefined;
        }

        const { routeRunId, planned } = await createRouteRun(client, {
            stops: stopsToPlan,
            user_id: targetUserId,
            route_pool_id: targetPoolId,
            base_id,
            run_date,
        });

        return res.json({
            ok: true,
            route_run_id: routeRunId,
            distance_m: planned.distance_m,
            duration_s: planned.duration_s,
            ordered_stops: planned.ordered_stops,
            legs: planned.legs,
        });
    } catch (err: any) {
        console.error("Error in /api/route-runs:", err);
        return res
            .status(500)
            .json({ error: err.message || "Internal server error" });
    } finally {
        client.release();
    }
});

/** ── Get Route Run Details: GET /api/route-runs/:id ───────────────────── */
routeRunRoutes.get("/route-runs/:id", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const routeRun = await loadRouteRunById(id);

        if (!routeRun) {
            return res.status(404).json({ error: "Route run not found" });
        }

        return res.json({ ok: true, route_run: routeRun });
    } catch (err: any) {
        console.error("Error in GET /api/route-runs/:id:", err);
        return res
            .status(500)
            .json({ error: err.message || "Internal server error" });
    }
});

/** ── Start a route run: POST /api/route-runs/:id/start ───────────────────── */
routeRunRoutes.post(
    "/route-runs/:id/start",
    requireAuth,
    requireAnyRole(["UL", "Lead", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const routeRun = await startRouteRun(id);

            if (!routeRun) {
                return res.status(404).json({ error: "Route run not found" });
            }

            return res.json({ ok: true, route_run: routeRun });
        } catch (err: any) {
            console.error("Error in POST /api/route-runs/:id/start:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/** ── Start a route run stop: POST /api/route-run-stops/:id/start ────────── */
routeRunRoutes.post(
    "/route-run-stops/:id/start",
    requireAuth,
    requireAnyRole(["UL", "Lead", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            // Idempotent/Guarded Transition:
            // Only allow transition to 'in_progress' if currently 'pending', 'planned', or 'assigned'.
            // Do NOT overwrite 'done', 'skipped', or 'in_progress' (if replayed).
            const updateQuery = `
                UPDATE route_run_stops
                SET status = 'in_progress',
                    updated_at = NOW()
                WHERE id = $1
                  AND status IN ('pending', 'planned', 'assigned')
                RETURNING route_run_id
            `;
            const result = await pool.query(updateQuery, [id]);

            let routeRunId;

            if (result.rows.length === 0) {
                // If 0 rows updated, check why.
                const lookupRes = await pool.query(
                    `SELECT route_run_id, status FROM route_run_stops WHERE id = $1`,
                    [id]
                );

                if (lookupRes.rows.length === 0) {
                    return res.status(404).json({ error: "Route run stop not found" });
                }

                const { status, route_run_id } = lookupRes.rows[0];
                routeRunId = route_run_id;

                if (status === 'in_progress') {
                    // Idempotent success: Already started, just return current state
                } else if (status === 'done' || status === 'skipped') {
                    // Conflict: Cannot restart a completed stop
                    return res.status(409).json({
                        error: "CONFLICT",
                        message: `Stop is already ${status}; cannot start.`
                    });
                } else {
                    // Other status? (e.g. pending/assigned logic drift?)
                    return res.status(409).json({
                        error: "CONFLICT",
                        message: `Cannot start stop with status '${status}'.`
                    });
                }
            } else {
                routeRunId = result.rows[0].route_run_id;
            }

            const routeRun = await loadRouteRunById(routeRunId);
            return res.json({ ok: true, route_run: routeRun });

        } catch (err: any) {
            console.error("Error in POST /api/route-run-stops/:id/start:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/** ── Finish Route Run: POST /api/route-runs/:id/finish ────────────────── */
routeRunRoutes.post(
    "/route-runs/:id/finish",
    requireAuth,
    requireAnyRole(["UL", "Lead", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const routeRun = await finishRouteRun(id);

            if (!routeRun) {
                return res.status(404).json({ error: "Route run not found" });
            }

            return res.json({ ok: true, route_run: routeRun });
        } catch (err: any) {
            console.error("Error in /api/route-runs/:id/finish:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);
