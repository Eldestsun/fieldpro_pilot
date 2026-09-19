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
    addStopToRouteRun,
} from "../../domains/routeRun/routeRunService";
import { loadRouteRunById } from "../../domains/routeRun/loaders/loadRouteRunById";
import { ensureVisitForRouteRunStop } from "../../domains/visit/visitService";
import { startRouteRunStopInternal } from "../../domains/routeRun/operations/startRouteRunStop";

export const routeRunRoutes = Router();

const MAX_OSRM_STOPS = 25;

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
// NAMING (ISSUE-043): "lead" is historical — it predates the Dispatch-role rename
// (Lead → Dispatch) and is now an identifier only, not a description of who may call
// it. This is the SURVIVING gated route-run detail view: auth-required, Dispatch/Admin
// only. Its payload exposes the assigned worker's and assigning Lead's NAME and ROLE
// (never their OID — SEAM-C item 4) as the R11 controlled reassignment exception; this
// is operational, not intelligence. The ungated identity-bearing twin GET /route-runs/:id
// was removed per ISSUE-043; this gated route is the single detail endpoint. Do not
// rename (names are identifiers — the frontend calls /api/lead/route-runs/:id).
// SEAM-A-R1: the byte-identical duplicate registration that used to follow this
// mount was removed — Express only ever dispatched to this first one anyway.
routeRunRoutes.get(
    "/lead/route-runs/:id",
    requireAuth,
    requireAnyRole(["Dispatch", "Admin"]),
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
 *       Requires Dispatch or Admin (ISSUE-043 — previously unauthenticated).
 *     tags: [RouteRuns]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Dispatch, Admin]
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
// ISSUE-043: auth gate added. Compute endpoint (no identity in response), but it
// reads stop coordinates and must not be callable anonymously. Matches the
// Dispatch/Admin posture of the route-creation flow it supports.
routeRunRoutes.post(
    "/routes/plan",
    requireAuth,
    requireAnyRole(["Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
    try {
        const { stop_ids } = req.body;

        if (!Array.isArray(stop_ids) || stop_ids.length < 2) {
            return res
                .status(400)
                .json({ error: "stop_ids must be an array with at least two items" });
        }

        // 1) Look up lon/lat for the requested stops.
        // PATTERN-001: `stops` sits over forced-RLS transit data — a bare
        // pool.query has no org context, so fail-closed RLS (MT-2) returns 0
        // rows (silent "Not enough stops"). Resolve the caller's org
        // (fail-closed, ISSUE-013) and scope the read.
        const numericOrgId = await resolveNumericOrgId(req);
        const query = `
      SELECT stop_id, lon, lat
      FROM stops
      WHERE stop_id = ANY($1::text[])
    `;
        const result = await withOrgContext(numericOrgId, (client) =>
            client.query(query, [stop_ids]),
        );

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
 *       persist anything. Used by the Dispatch planning UI to preview before committing.
 *       Requires Dispatch or Admin (ISSUE-043 — previously unauthenticated).
 *     tags: [RouteRuns]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Dispatch, Admin]
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
// ISSUE-043: auth gate added. Used by the Dispatch route-creation modal
// (useCreateRoute), which already sends a Bearer token; gated to Dispatch/Admin to
// match POST /route-runs. No persistence, but must not be callable anonymously.
routeRunRoutes.post(
    "/route-runs/preview",
    requireAuth,
    requireAnyRole(["Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
    try {
        const { stop_ids, pool_id, ul_id, run_date, base_id } = req.body;

        // Resolve org once (fail-closed, ISSUE-013) — both stop lookups and the
        // base/pool reads below are FORCE-RLS and must be org-scoped (PATTERN-001).
        const numericOrgId = await resolveNumericOrgId(req);

        let stopsToPlan: OsrmStop[] = [];

        // Option A: Explicit stop_ids provided
        if (Array.isArray(stop_ids) && stop_ids.length >= 2) {
            const query = `
        SELECT stop_id, lon, lat, on_street_name, bearing_code
        FROM stops
        WHERE stop_id = ANY($1::text[])
      `;
            const result = await withOrgContext(numericOrgId, (client) =>
                client.query(query, [stop_ids]),
            );

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
            // PATTERN-001: the candidate query reads `stops` / `stop_pool_memberships`,
            // both FORCE RLS. Scope to the resolved org via withOrgContext.
            stopsToPlan = await withOrgContext(numericOrgId, (client) =>
                getCandidateStopsForPoolWithRisk(pool_id, MAX_OSRM_STOPS, client),
            );

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

        // Resolve the dispatch base: explicit base_id, else the pool's pre-attached
        // base. When a base resolves, the trip is planned FROM it (a prepended
        // __BASE__ waypoint + source=first), so the preview distance reflects the
        // real depot-anchored drive and MATCHES the saved route (createRouteRun does
        // the same). Without a base (e.g. a district pool with none picked yet), we
        // fall back to stop-to-stop so preview never hard-fails.
        let resolvedBaseId: string | null = base_id ?? null;
        if (!resolvedBaseId && pool_id) {
            const poolBaseRes = await withOrgContext(numericOrgId, (client) =>
                client.query(
                    `SELECT base_id FROM route_pools WHERE id = $1 AND active = true`,
                    [pool_id],
                ),
            );
            resolvedBaseId = poolBaseRes.rows[0]?.base_id ?? null;
        }

        let baseWaypoint: OsrmStop | null = null;
        if (resolvedBaseId) {
            const baseRes = await withOrgContext(numericOrgId, (client) =>
                client.query(
                    `SELECT id, lon, lat FROM bases WHERE id = $1 AND active = true`,
                    [resolvedBaseId],
                ),
            );
            if (baseRes.rows.length > 0) {
                baseWaypoint = {
                    stop_id: "__BASE__",
                    lon: baseRes.rows[0].lon,
                    lat: baseRes.rows[0].lat,
                };
            } else {
                // base_id given but not a real active base for this org — don't
                // silently anchor to nothing; surface it.
                resolvedBaseId = null;
            }
        }

        // 2) Ask OSRM for an optimized trip. Slice real stops to the OSRM limit,
        // then prepend the base sentinel (it doesn't count against the stop budget).
        const realStops =
            stopsToPlan.length > MAX_OSRM_STOPS
                ? stopsToPlan.slice(0, MAX_OSRM_STOPS)
                : stopsToPlan;
        const osrmStops = baseWaypoint ? [baseWaypoint, ...realStops] : realStops;

        const planned = await planRouteWithOsrm(
            osrmStops,
            baseWaypoint ? { source: "first" } : undefined,
        );

        // Drop the base sentinel from the displayed stop list — it's the origin,
        // not a work stop — but KEEP its contribution to distance_m/duration_s.
        const orderedRealStops = planned.ordered_stops.filter(
            (s) => s.stop_id !== "__BASE__",
        );

        // 3) Return the planned route
        return res.json({
            ok: true,
            truncated: stopsToPlan.length > MAX_OSRM_STOPS, // approximate check
            total_stops: stopsToPlan.length,
            used_stops: realStops.length,
            base_id: resolvedBaseId, // which base anchored the plan (null = stop-to-stop)
            base_anchored: baseWaypoint !== null,
            distance_m: planned.distance_m,
            duration_s: planned.duration_s,
            ordered_stops: orderedRealStops,
            legs: planned.legs,
        });
    } catch (err: any) {
        console.error("Error in /api/route-runs/preview:", err);
        // Honor a typed status (e.g. OrgResolutionError → 403) instead of masking as 500.
        return res
            .status(err.status ?? 500)
            .json({ error: err.message || "Internal server error" });
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
    requireAnyRole(["Dispatch", "Admin"]),
    async (req: any, res: Response) => {
        const { stop_ids, base_id, route_pool_id, pool_id, run_date, ul_id, shift_type, is_adhoc } = req.body;

        const createdByOid = req.user?.oid;
        if (!createdByOid) {
            return res.status(401).json({ error: "Missing authenticated user identity" });
        }

        const assignedUserOid = ul_id;
        const targetPoolId = route_pool_id || pool_id;

        if (!targetPoolId) {
            return res.status(400).json({ error: "Missing required field: pool_id" });
        }

        // SEAM-D D3: is_adhoc is an EXPLICIT flag from the picker UI — the server
        // never infers it. An ad-hoc run must name its stops (the >=2 floor is the
        // existing OSRM planning floor below). stop_ids WITHOUT the flag remains
        // the legal, untagged legacy primitive (operator ruling).
        if (is_adhoc !== undefined && typeof is_adhoc !== "boolean") {
            return res.status(400).json({ error: "is_adhoc must be a boolean" });
        }
        if (is_adhoc === true && !(Array.isArray(stop_ids) && stop_ids.length >= 2)) {
            return res
                .status(400)
                .json({ error: "is_adhoc requires an explicit stop_ids array (min 2)" });
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
                    route_pool_id: targetPoolId,
                    base_id: resolvedBaseId,
                    run_date,
                    shift_type: shift_type ?? 'day',
                    is_adhoc: is_adhoc === true,
                });
            });

            auditWrite({
                actor_oid: createdByOid,
                org_id: reqOrgId(req),
                action: 'assignment.create',
                resource_type: 'route',
                resource_id: String(routeRunId),
                // Labor safety: worker OID is intentionally NOT recorded in the audit
                // detail. The accountable actor is in actor_oid and the route in
                // resource_id; the worker↔route fact lives (encrypted) in the
                // assignment sidecar. Do not reintroduce assigned_user_oid here.
                detail: { pool_id: targetPoolId },
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

// ISSUE-043: GET /route-runs/:id REMOVED (was unauthenticated and identity-bearing).
// It returned assigned_user.{oid,display_name,role} + created_by.{oid,display_name}
// (loadRouteRunById.ts) with resolveNumericOrgId falling back to org #1 for anonymous
// callers — a direct worker-identity leak on an open endpoint. The gated twin
// GET /lead/route-runs/:id (above) is the sole route-run detail endpoint: auth-required,
// Dispatch/Admin only. Its payload carries the assigned worker's/assigning Lead's NAME
// and ROLE (never OID — SEAM-C item 4) as the R11 reassignment exception; loadRouteRunById
// applies no role gate (Dispatch reads it), so the prior "Admin-gated" note was wrong.
// Phase 0 caller recon confirmed the
// frontend reads only the gated twin (getLeadRouteRunById → /api/lead/route-runs/:id)
// and no test/script/UI path depended on this ungated route.

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
    requireAnyRole(["Specialist", "Dispatch", "Admin"]),
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
    requireAnyRole(["Specialist", "Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            if (!req.user?.oid) {
                return res.status(401).json({ error: "Missing authenticated user identity" });
            }

            // Resolve tenant up front: startRouteRunStopInternal runs inside
            // withOrgContext(orgId, ...) so RLS on the core location tables the
            // visit-ensure path reads is satisfied (PATTERN-001).
            const numericOrgId = await resolveNumericOrgId(req);

            // Use shared internal helper (Strict Neutrality)
            // Endpoint Logic: Allowed statuses: ['pending', 'planned', 'assigned']
            const result = await startRouteRunStopInternal(pool, {
                routeRunStopId: id,
                actorOid: req.user.oid,
                allowedStatuses: ["pending", "planned", "assigned"],
                orgId: numericOrgId,
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
    requireAnyRole(["Specialist", "Dispatch", "Admin"]),
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
 * /route-runs/{id}/stops:
 *   post:
 *     summary: Add a stop to a live route run (ISSUE-050)
 *     description: >
 *       Appends a stop to the pending tail of a planned or in_progress route run
 *       (sequence = MAX+1, one new OSRM leg, run totals bumped). Completed and
 *       in-progress stops are never touched. Writes origin_type='emergency' —
 *       'ul_ad_hoc' is reserved for a future worker-initiated flow and is
 *       rejected. Writes a `route.stop.add` audit entry on success.
 *     tags: [RouteRuns]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Dispatch, Admin]
 *     x-audit-action: route.stop.add
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
 *             required: [stop_id]
 *             properties:
 *               stop_id:
 *                 type: string
 *                 description: The stop to append
 *                 example: "12345"
 *               origin_type:
 *                 type: string
 *                 enum: [emergency]
 *                 description: >
 *                   Optional; defaults to 'emergency' and must equal it.
 *                   'ul_ad_hoc' is reserved for the worker-initiated flow.
 *           example:
 *             stop_id: "12345"
 *     responses:
 *       200:
 *         description: Stop appended; reloaded route run returned
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
 *       400:
 *         description: Invalid stop (unknown/inactive/no coordinates/no asset) or reserved origin_type
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { error: "Stop not found or inactive" }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Run is finished/completed, or the stop is already on the run
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { error: "Stop is already on this route run" }
 *       502:
 *         description: Routing engine unavailable — nothing written
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example: { error: "Routing engine unavailable — stop not added" }
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
routeRunRoutes.post(
    "/route-runs/:id/stops",
    requireAuth,
    requireAnyRole(["Dispatch", "Admin"]),
    async (req: Request, res: Response) => {
        const { id } = req.params;
        const { stop_id, origin_type } = req.body;

        if (typeof stop_id !== "string" || stop_id.trim().length === 0) {
            return res.status(400).json({ error: "stop_id is required" });
        }
        // ISSUE-050 founder ruling: v1 writes only 'emergency'. 'ul_ad_hoc' is
        // reserved for the worker-initiated flow — accepting it from a dispatch
        // surface would make the origin column lie.
        if (origin_type !== undefined && origin_type !== "emergency") {
            return res.status(400).json({
                error: "origin_type must be 'emergency' ('ul_ad_hoc' is reserved for the field-worker flow)",
            });
        }

        try {
            const numericOrgId = await resolveNumericOrgId(req);
            const actorOid: string = (req as any).user?.oid ?? "unknown";

            await withOrgContext(numericOrgId, (client) =>
                addStopToRouteRun(client, {
                    routeRunId: id,
                    stopId: stop_id.trim(),
                    actorOid,
                })
            );

            auditWrite({
                actor_oid: actorOid,
                org_id: reqOrgId(req),
                action: "route.stop.add",
                resource_type: "route",
                resource_id: String(id),
                // Labor safety: stop/origin only — no worker identity in detail
                // (matches the assign handler's posture).
                detail: { stop_id: stop_id.trim(), origin_type: "emergency" },
                ip_address: req.ip,
            });

            const routeRun = await loadRouteRunById(id, numericOrgId);
            return res.json({ ok: true, route_run: routeRun });
        } catch (err: any) {
            console.error("Error in POST /api/route-runs/:id/stops:", err);
            if (err.status === 400 || err.status === 404 || err.status === 409 || err.status === 502) {
                return res.status(err.status).json({ error: err.message });
            }
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
    requireAnyRole(["Dispatch", "Admin"]),
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
                    `SELECT assigned_user_oid FROM route_run_assignment WHERE route_run_id = $1`,
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
                    // Labor safety: worker OID intentionally omitted from detail
                    // (actor in actor_oid, route in resource_id). Do not reintroduce
                    // previous_assigned_user_oid.
                    detail: {},
                    ip_address: req.ip,
                });
            } else {
                auditWrite({
                    actor_oid: actorOid,
                    org_id: reqOrgId(req),
                    action: prevOid ? 'assignment.reassign' : 'assignment.create',
                    resource_type: 'route',
                    resource_id: String(id),
                    // Labor safety: worker OIDs (previous + new) intentionally omitted
                    // from detail. The reassignment is fully audited by actor_oid +
                    // action + resource_id; the worker↔route fact lives (encrypted) in
                    // the assignment sidecar. Do not reintroduce the *_assigned_user_oid
                    // fields here.
                    detail: {},
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
