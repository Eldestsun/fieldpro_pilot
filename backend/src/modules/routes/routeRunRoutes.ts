import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool, withOrgContext } from "../../db";
import { auditWrite, reqOrgId } from "../../middleware/auditWrite";
import { resolveNumericOrgId } from "../../middleware/resolveOrgId";
import { planRouteWithOsrm, OsrmStop } from "../../osrmClient";
import {
    createRouteRun,

    startRouteRun,
    finishRouteRun,
    getCandidateStopsForPoolWithRisk,
    assignRouteRun,
} from "../../domains/routeRun/routeRunService";
import { loadRouteRunById } from "../../domains/routeRun/loaders/loadRouteRunById";
import { ensureVisitForRouteRunStop } from "../../domains/visit/visitService";
import { startRouteRunStopInternal } from "../../domains/routeRun/operations/startRouteRunStop";

export const routeRunRoutes = Router();

const MAX_OSRM_STOPS = 25;
// LEGACY: integer user_id on route_runs has no FK and no canonical significance.
// The canonical UL identity is assigned_user_oid (already wired from req.body.ul_id).
// This constant will be removed when the legacy user_id column is deprecated.
const LEGACY_TRANSIT_USER_ID = 0;

/**
 * @openapi
 * /lead/hub:
 *   get:
 *     summary: Lead hub placeholder
 *     description: Returns confirmation that the caller has the Lead role.
 *     tags: [RouteRuns]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead]
 *     responses:
 *       200:
 *         description: Caller is a Lead
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 scope: { type: string }
 *             example:
 *               ok: true
 *               scope: Lead
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
// Lead-only hub
routeRunRoutes.get("/lead/hub", requireAuth, requireAnyRole(["Lead", "Dispatch"]), (_req, res) => {
    res.json({ ok: true, scope: "Lead" });
});

/**
 * @openapi
 * /lead/todays-runs:
 *   get:
 *     summary: Get all planned and in-progress route runs for today
 *     description: Returns all active route runs across all pools. Used by the Lead dispatch view.
 *     tags: [RouteRuns]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     responses:
 *       200:
 *         description: Today's active route runs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 route_runs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       status: { type: string }
 *                       route_pool_id: { type: string }
 *                       run_date: { type: string, format: date }
 *                       stop_count: { type: integer }
 *                       completed_stops: { type: integer }
 *             example:
 *               ok: true
 *               route_runs:
 *                 - id: 42
 *                   status: in_progress
 *                   route_pool_id: POOL-001
 *                   run_date: "2026-05-13"
 *                   stop_count: 25
 *                   completed_stops: 12
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
routeRunRoutes.get(
    "/lead/todays-runs",
    requireAuth,
    requireAnyRole(["Lead", "Dispatch", "Admin"]),
    async (req: Request, res) => {
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
          COALESCE(rs.stop_count, 0) AS stop_count,
          COALESCE(rs.completed_stop_count, 0) AS completed_stops
        FROM route_runs rr
        LEFT JOIN (
          SELECT
            route_run_id,
            COUNT(*) AS stop_count,
            COUNT(*) FILTER (WHERE status IN ('done', 'skipped')) AS completed_stop_count
          FROM route_run_stops
          GROUP BY route_run_id
        ) rs ON rs.route_run_id = rr.id
        WHERE rr.status IN ('planned', 'in_progress')
        ORDER BY rr.created_at DESC;
      `;
            const numericOrgId = await resolveNumericOrgId(req);
            const result = await withOrgContext(numericOrgId, (client) =>
                client.query(query),
            );
            return res.json({ ok: true, route_runs: result.rows });
        } catch (err: any) {
            console.error("Error in /lead/todays-runs:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/**
 * @openapi
 * /lead/route-runs/{id}:
 *   get:
 *     summary: Get route run details (Lead view)
 *     description: Returns the full route run including all stops. Lead and Admin only.
 *     tags: [RouteRuns]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Route run ID
 *         example: "42"
 *     responses:
 *       200:
 *         description: Route run found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 route_run: { type: object }
 *             example:
 *               ok: true
 *               route_run: { id: 42, status: in_progress, stops: [] }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
routeRunRoutes.get(
    "/lead/route-runs/:id",
    requireAuth,
    requireAnyRole(["Lead", "Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const numericOrgId = await resolveNumericOrgId(req);
            const routeRun = await loadRouteRunById(id, numericOrgId);

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
// Duplicate registration — intentional; kept for backward compat.
routeRunRoutes.get(
    "/lead/route-runs/:id",
    requireAuth,
    requireAnyRole(["Lead", "Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const numericOrgId = await resolveNumericOrgId(req);
            const routeRun = await loadRouteRunById(id, numericOrgId);

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

/**
 * @openapi
 * /routes/plan:
 *   post:
 *     summary: Plan an OSRM-optimized route from a list of stop IDs
 *     description: >
 *       Takes an array of stop IDs, looks up their coordinates, and returns an
 *       OSRM-optimized trip order. Does not create a route run.
 *       Note: this endpoint currently has no auth guard and is used by the
 *       planning UI before authentication completes.
 *     tags: [RouteRuns]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [stop_ids]
 *             properties:
 *               stop_ids:
 *                 type: array
 *                 items: { type: string }
 *                 minItems: 2
 *                 description: At least two stop IDs to route between
 *           example:
 *             stop_ids: ["1001", "1002", "1003"]
 *     responses:
 *       200:
 *         description: Optimized route
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 distance_m: { type: number }
 *                 duration_s: { type: number }
 *                 ordered_stops: { type: array, items: { type: object } }
 *                 legs: { type: array, items: { type: object } }
 *             example:
 *               ok: true
 *               distance_m: 15000
 *               duration_s: 3600
 *               ordered_stops: []
 *               legs: []
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
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
      SELECT stop_id, lon, lat
      FROM stops
      WHERE stop_id = ANY($1::text[])
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
            stop_id: r.stop_id,
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

/**
 * @openapi
 * /route-runs/preview:
 *   post:
 *     summary: Preview an OSRM-optimized route run without creating it
 *     description: >
 *       Returns the optimized route for a pool or explicit stop list. Does not
 *       persist anything. Used by the Lead planning UI to preview before committing.
 *       Note: no auth guard; intended for pre-auth planning flow.
 *     tags: [RouteRuns]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stop_ids:
 *                 type: array
 *                 items: { type: string }
 *                 description: Explicit stop IDs (option A)
 *               pool_id:
 *                 type: string
 *                 description: Pool ID — fetch stops from pool (option B)
 *               ul_id:
 *                 type: string
 *                 description: Azure Entra OID of the intended assignee (optional)
 *               run_date:
 *                 type: string
 *                 format: date
 *           example:
 *             pool_id: POOL-001
 *             ul_id: "abc123-oid"
 *             run_date: "2026-05-13"
 *     responses:
 *       200:
 *         description: Optimized preview route
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 truncated: { type: boolean }
 *                 total_stops: { type: integer }
 *                 used_stops: { type: integer }
 *                 distance_m: { type: number }
 *                 duration_s: { type: number }
 *                 ordered_stops: { type: array, items: { type: object } }
 *                 legs: { type: array, items: { type: object } }
 *             example:
 *               ok: true
 *               truncated: false
 *               total_stops: 20
 *               used_stops: 20
 *               distance_m: 12000
 *               duration_s: 2800
 *               ordered_stops: []
 *               legs: []
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
routeRunRoutes.post("/route-runs/preview", async (req: Request, res: Response) => {
    try {
        const { stop_ids, pool_id, ul_id, run_date } = req.body;

        let stopsToPlan: OsrmStop[] = [];

        // Option A: Explicit stop_ids provided
        if (Array.isArray(stop_ids) && stop_ids.length >= 2) {
            const query = `
        SELECT stop_id, lon, lat, on_street_name, bearing_code
        FROM stops
        WHERE stop_id = ANY($1::text[])
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
                stop_id: r.stop_id,
                on_street_name: r.on_street_name,
                bearing_code: r.bearing_code,
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

/**
 * @openapi
 * /route-runs:
 *   post:
 *     summary: Create a new route run
 *     description: >
 *       Creates an OSRM-optimized route run and assigns it to a UL. Requires Lead or Admin role.
 *       Writes an `assignment.create` audit log entry on success.
 *     tags: [RouteRuns]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     x-audit-action: assignment.create
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pool_id]
 *             properties:
 *               pool_id:
 *                 type: string
 *                 description: Route pool ID (alias route_pool_id)
 *                 example: POOL-001
 *               route_pool_id:
 *                 type: string
 *                 description: Route pool ID (preferred form)
 *               stop_ids:
 *                 type: array
 *                 items: { type: string }
 *                 description: Explicit stop IDs (if omitted, pool stops are used)
 *               ul_id:
 *                 type: string
 *                 description: Azure Entra OID of the UL to assign
 *                 example: "abc123-oid"
 *               base_id:
 *                 type: string
 *                 description: Dispatch base identifier
 *                 example: NORTH
 *               run_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-05-13"
 *           example:
 *             pool_id: POOL-001
 *             ul_id: "abc123-oid"
 *             run_date: "2026-05-13"
 *     responses:
 *       200:
 *         description: Route run created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 route_run_id: { type: integer }
 *                 distance_m: { type: number }
 *                 duration_s: { type: number }
 *                 ordered_stops: { type: array, items: { type: object } }
 *                 legs: { type: array, items: { type: object } }
 *             example:
 *               ok: true
 *               route_run_id: 42
 *               distance_m: 15000
 *               duration_s: 3600
 *               ordered_stops: []
 *               legs: []
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
routeRunRoutes.post(
    "/route-runs",
    requireAuth,
    requireAnyRole(["Lead", "Dispatch", "Admin"]),
    async (req: any, res: Response) => {
        const { stop_ids, base_id, route_pool_id, pool_id, run_date, ul_id, shift_type } = req.body;

        const createdByOid = req.user?.oid;
        if (!createdByOid) {
            return res.status(401).json({ error: "Missing authenticated user identity" });
        }

        const assignedUserOid = ul_id;
        const targetPoolId = route_pool_id || pool_id;

        if (!targetPoolId) {
            return res.status(400).json({ error: "Missing required field: pool_id" });
        }

        try {
            const numericOrgId = await resolveNumericOrgId(req);
            const { routeRunId, planned } = await withOrgContext(numericOrgId, async (client) => {
                let resolvedBaseId = base_id;

                if (!resolvedBaseId) {
                    const baseRes = await client.query(
                        `SELECT base_id FROM route_pools WHERE id = $1 AND active = true`,
                        [targetPoolId]
                    );
                    if (baseRes.rows.length === 0 || !baseRes.rows[0].base_id) {
                        throw Object.assign(
                            new Error("No base_id provided and route pool has no base assigned"),
                            { status: 400 }
                        );
                    }
                    resolvedBaseId = baseRes.rows[0].base_id;
                }

                let stopsToPlan: OsrmStop[] | undefined = [];

                if (Array.isArray(stop_ids) && stop_ids.length >= 2) {
                    const query = `
        SELECT stop_id, lon, lat, on_street_name, bearing_code
        FROM stops
        WHERE stop_id = ANY($1::text[])
      `;
                    const result = await client.query(query, [stop_ids]);
                    if (result.rows.length < 2) {
                        throw Object.assign(
                            new Error("Not enough stops found with coordinates"),
                            { status: 400, found: result.rows.length }
                        );
                    }
                    stopsToPlan = result.rows.map((r: any) => ({
                        lon: r.lon,
                        lat: r.lat,
                        stop_id: r.stop_id,
                        on_street_name: r.on_street_name,
                        bearing_code: r.bearing_code,
                    }));
                    if (stopsToPlan.length > MAX_OSRM_STOPS) {
                        stopsToPlan = stopsToPlan.slice(0, MAX_OSRM_STOPS);
                    }
                } else {
                    stopsToPlan = undefined;
                }

                return createRouteRun(client, {
                    stops: stopsToPlan,
                    assigned_user_oid: assignedUserOid,
                    created_by_oid: createdByOid,
                    user_id: LEGACY_TRANSIT_USER_ID,
                    route_pool_id: targetPoolId,
                    base_id: resolvedBaseId,
                    run_date,
                    shift_type: shift_type ?? 'day',
                });
            });

            auditWrite({
                actor_oid: createdByOid,
                org_id: reqOrgId(req),
                action: 'assignment.create',
                resource_type: 'route',
                resource_id: String(routeRunId),
                detail: { assigned_user_oid: assignedUserOid ?? null, pool_id: targetPoolId },
                ip_address: req.ip,
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
            if (err.status === 400) {
                return res.status(400).json({ error: err.message, ...(err.found != null ? { found: err.found } : {}) });
            }
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/**
 * @openapi
 * /route-runs/{id}:
 *   get:
 *     summary: Get route run details
 *     description: >
 *       Returns the full route run including all stops and their current status.
 *       This transitional endpoint has no auth guard — prefer domain-specific
 *       accessors where possible.
 *     tags: [RouteRuns]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Route run ID
 *         example: "42"
 *     responses:
 *       200:
 *         description: Route run found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 route_run: { type: object }
 *             example:
 *               ok: true
 *               route_run: { id: 42, status: in_progress, stops: [] }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// [GOVERNANCE-SENSITIVE] Transitional endpoint. Prefer domain-specific accessors where possible.
// No requireAuth on this transitional endpoint; resolveNumericOrgId tolerates
// a missing req.user and falls back to the first organization (single-tenant
// dev/pilot). When this endpoint is removed or guarded, this fallback should
// be revisited.
routeRunRoutes.get("/route-runs/:id", async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const numericOrgId = await resolveNumericOrgId(req);
        const routeRun = await loadRouteRunById(id, numericOrgId);

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

/**
 * @openapi
 * /route-runs/{id}/start:
 *   post:
 *     summary: Start a route run
 *     description: Transitions the route run from planned to in_progress.
 *     tags: [RouteRuns]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL, Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Route run ID
 *         example: "42"
 *     responses:
 *       200:
 *         description: Route run started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 route_run: { type: object }
 *             example:
 *               ok: true
 *               route_run: { id: 42, status: in_progress }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
routeRunRoutes.post(
    "/route-runs/:id/start",
    requireAuth,
    requireAnyRole(["UL", "Specialist", "Lead", "Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const numericOrgId = await resolveNumericOrgId(req);
            const routeRun = await startRouteRun(id, numericOrgId);

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

/**
 * @openapi
 * /route-run-stops/{id}/start:
 *   post:
 *     summary: Start a route run stop (Lead/Admin variant)
 *     description: >
 *       Transitions a stop from pending/planned/assigned to in_progress.
 *       Also idempotent if already in_progress.
 *       The UL variant (in routeRunStopRoutes) only allows pending → in_progress.
 *     tags: [RouteRunStops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL, Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Route run stop ID
 *         example: "7"
 *     responses:
 *       200:
 *         description: Stop started (or already in_progress — idempotent)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 route_run: { type: object }
 *             example:
 *               ok: true
 *               route_run: { id: 42, status: in_progress }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         $ref: '#/components/responses/Conflict'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
routeRunRoutes.post(
    "/route-run-stops/:id/start",
    requireAuth,
    requireAnyRole(["UL", "Specialist", "Lead", "Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            if (!req.user?.oid) {
                return res.status(401).json({ error: "Missing authenticated user identity" });
            }

            // Use shared internal helper (Strict Neutrality)
            // Endpoint Logic: Allowed statuses: ['pending', 'planned', 'assigned']
            const result = await startRouteRunStopInternal(pool, {
                routeRunStopId: id,
                actorOid: req.user.oid,
                allowedStatuses: ["pending", "planned", "assigned"],
            });

            let routeRunId;

            if (result.updated) {
                // Success: Transitioned
                routeRunId = result.routeRunId;
            } else {
                // Not updated: Check Idempotency
                if (result.status === "in_progress") {
                    // Idempotent success: Already started
                    routeRunId = result.routeRunId;
                } else if (result.status === "done" || result.status === "skipped") {
                    // Conflict
                    return res.status(409).json({
                        error: "CONFLICT",
                        message: `Stop is already ${result.status}; cannot start.`
                    });
                } else if (result.status === "NOT_FOUND") {
                    return res.status(404).json({ error: "Route run stop not found" });
                } else {
                    // Other status (drift?)
                    return res.status(409).json({
                        error: "CONFLICT",
                        message: `Cannot start stop with status '${result.status}'.`
                    });
                }
            }

            // Load full route run to match original response shape
            if (!routeRunId) {
                // Fallback safe guard, though routeRunId should be present if not 404
                return res.status(404).json({ error: "Route run stop not found (no route_run_id)" });
            }

            const numericOrgId = await resolveNumericOrgId(req);
            const routeRun = await loadRouteRunById(routeRunId, numericOrgId);
            return res.json({ ok: true, route_run: routeRun });

        } catch (err: any) {
            console.error("Error in POST /api/route-run-stops/:id/start:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);

/**
 * @openapi
 * /route-runs/{id}/finish:
 *   post:
 *     summary: Finish a route run
 *     description: Marks the route run as completed/finished.
 *     tags: [RouteRuns]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [UL, Lead, Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Route run ID
 *         example: "42"
 *     responses:
 *       200:
 *         description: Route run finished
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 route_run: { type: object }
 *             example:
 *               ok: true
 *               route_run: { id: 42, status: completed }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
routeRunRoutes.post(
    "/route-runs/:id/finish",
    requireAuth,
    requireAnyRole(["UL", "Specialist", "Lead", "Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const numericOrgId = await resolveNumericOrgId(req);
            const routeRun = await finishRouteRun(id, numericOrgId);

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

/**
 * @openapi
 * /route-runs/{id}/assign:
 *   patch:
 *     summary: Assign, reassign, or unassign a route run
 *     description: >
 *       Updates the `assigned_user_oid` on a route run.
 *       - If previously unassigned → writes `assignment.create` audit entry.
 *       - If reassigning → writes `assignment.reassign` audit entry.
 *       - If `assigned_user_oid` is null → writes `assignment.cancel` audit entry.
 *     tags: [RouteRuns]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     x-audit-action: assignment.create
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Route run ID
 *         example: "42"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assigned_user_oid:
 *                 type: string
 *                 nullable: true
 *                 description: Azure Entra OID of the UL to assign; null to unassign
 *                 example: "abc123-oid"
 *           example:
 *             assigned_user_oid: "abc123-oid"
 *     responses:
 *       200:
 *         description: Assignment updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 route_run: { type: object }
 *             example:
 *               ok: true
 *               route_run: { id: 42, assigned_user_oid: "abc123-oid" }
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
routeRunRoutes.patch(
    "/route-runs/:id/assign",
    requireAuth,
    requireAnyRole(["Lead", "Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        const { id } = req.params;
        const { assigned_user_oid } = req.body;

        if (assigned_user_oid === "") {
            return res.status(400).json({ error: "assigned_user_oid cannot be empty string" });
        }

        try {
            const numericOrgId = await resolveNumericOrgId(req);
            const prevOid = await withOrgContext(numericOrgId, async (client) => {
                const prevRes = await client.query(
                    `SELECT assigned_user_oid FROM route_runs WHERE id = $1`,
                    [id]
                );
                const prevOid: string | null = prevRes.rows[0]?.assigned_user_oid ?? null;
                await assignRouteRun(client, id, assigned_user_oid);
                return prevOid;
            });

            const actorOid: string = (req as any).user?.oid ?? 'unknown';
            if (assigned_user_oid == null) {
                auditWrite({
                    actor_oid: actorOid,
                    org_id: reqOrgId(req),
                    action: 'assignment.cancel',
                    resource_type: 'route',
                    resource_id: String(id),
                    detail: { previous_assigned_user_oid: prevOid },
                    ip_address: req.ip,
                });
            } else {
                auditWrite({
                    actor_oid: actorOid,
                    org_id: reqOrgId(req),
                    action: prevOid ? 'assignment.reassign' : 'assignment.create',
                    resource_type: 'route',
                    resource_id: String(id),
                    detail: {
                        previous_assigned_user_oid: prevOid,
                        new_assigned_user_oid: assigned_user_oid,
                    },
                    ip_address: req.ip,
                });
            }

            const routeRun = await loadRouteRunById(id, numericOrgId);
            return res.json({ ok: true, route_run: routeRun });

        } catch (err: any) {
            console.error("Error in PATCH /api/route-runs/:id/assign:", err);
            if (err.status === 404) {
                return res.status(404).json({ error: err.message });
            }
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);
