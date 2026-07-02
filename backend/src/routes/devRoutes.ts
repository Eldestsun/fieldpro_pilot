import { Router, Request, Response } from "express";
import { pool } from "../db";
import { OsrmStop } from "../osrmClient";
import { createRouteRun } from "../domains/routeRun/routeRunService";
import { loadRouteRunById } from "../domains/routeRun/loaders/loadRouteRunById";
import { resolveNumericOrgId } from "../middleware/resolveOrgId";

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
/**
 * @openapi
 * /dev/seed-axe-fixture:
 *   post:
 *     summary: Seed a route_run fixture for axe-audit synthetic users (dev/test only)
 *     description: >
 *       Idempotent. Creates a route_run with 3 stops assigned to the given OID if
 *       one does not already exist. Gated by NODE_ENV !== production AND
 *       DEV_AUTH_BYPASS === true. Returns 404 in any other environment.
 *     tags: [Dev]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oid]
 *             properties:
 *               oid: { type: string }
 *               org_id: { type: integer, default: 1 }
 *     responses:
 *       200:
 *         description: Fixture seeded or already exists
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         description: Not available in this environment
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
devRoutes.post("/dev/seed-axe-fixture", async (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production' || process.env.DEV_AUTH_BYPASS !== 'true') {
        return res.status(404).json({ error: 'Not found' });
    }

    const { oid, org_id = 1 } = req.body;
    if (!oid || typeof oid !== 'string') {
        return res.status(400).json({ error: 'oid is required' });
    }

    const client = await pool.connect();
    try {
        // PATTERN-001: route_runs / stops / route_run_stops are forced-RLS —
        // fail-closed without org context. Scope to the EXPLICIT dev org_id
        // param (dev-only endpoint, gated above; the param default is a dev
        // fixture assumption, not a resolution fallback).
        await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(org_id)]);
        // Idempotent: return existing run if one already exists for this OID
        const existing = await client.query(
            `SELECT id FROM route_runs
             WHERE assigned_user_oid = $1 AND status IN ('planned', 'in_progress')
             ORDER BY created_at DESC LIMIT 1`,
            [oid]
        );
        if (existing.rows.length > 0) {
            return res.json({ ok: true, route_run_id: existing.rows[0].id, created: false });
        }

        // Pick 3 stops from the largest pool (SE pool, org_id 1)
        const stopsRes = await client.query(
            `SELECT stop_id, asset_id FROM stops
             WHERE pool_id = 'SE'
             ORDER BY stop_id ASC LIMIT 3`
        );
        if (stopsRes.rows.length < 3) {
            return res.status(500).json({ error: 'Not enough stops in SE pool to seed fixture' });
        }

        // Insert route_run — trigger auto-fills base_id and org_id from pool
        const runRes = await client.query(
            `INSERT INTO route_runs
               (route_pool_id, run_date, status, org_id, assigned_user_oid, created_by_oid)
             VALUES ('SE', CURRENT_DATE, 'in_progress', $1, $2, $2)
             RETURNING id`,
            [org_id, oid]
        );
        const routeRunId: number = runRes.rows[0].id;

        // Insert 3 stops in pending state
        for (let i = 0; i < stopsRes.rows.length; i++) {
            const { stop_id, asset_id } = stopsRes.rows[i];
            await client.query(
                `INSERT INTO route_run_stops
                   (route_run_id, stop_id, sequence, status, origin_type, asset_id, org_id)
                 VALUES ($1, $2, $3, 'pending', 'planned', $4, $5)`,
                [routeRunId, stop_id, i + 1, asset_id, org_id]
            );
        }

        return res.json({ ok: true, route_run_id: routeRunId, created: true });
    } catch (err: any) {
        console.error('Error in /api/dev/seed-axe-fixture:', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    } finally {
        try {
            await client.query(`SELECT set_config('app.current_org_id', '', false)`);
        } catch { /* best-effort reset */ }
        client.release();
    }
});

// DEV ONLY – route run generator for testing, not for production (the devRoutes
// mount itself is prod-gated in app.ts per ISSUE-043).
devRoutes.post("/dev/generate-route-run", async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        const { pool_id, user_id, base_id = "NORTH", max_stops = 25, org_id = 1 } = req.body;

        // 1. Validate input
        if (!pool_id || !user_id) {
            return res.status(400).json({ error: "pool_id and user_id are required" });
        }

        // PATTERN-001: route_pools / stops / route_runs are forced-RLS —
        // fail-closed without org context. Scope to the EXPLICIT dev org_id
        // param (same dev-fixture convention as /dev/seed-axe-fixture; this
        // endpoint is unreachable in production).
        await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(org_id)]);

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
        // Dev endpoint: no requireAuth, so req.user is typically unset.
        // resolveNumericOrgId reads req.user.org_id if the dev-bypass headers
        // populated it; otherwise it falls back to the first organization id
        // (single-tenant dev DB), so the call is safe in either mode.
        const numericOrgId = await resolveNumericOrgId(req);
        const fullRouteRun = await loadRouteRunById(routeRunId, numericOrgId);

        return res.json({ ok: true, route_run: fullRouteRun });
    } catch (err: any) {
        console.error("Error in /api/dev/generate-route-run:", err);
        return res
            .status(500)
            .json({ error: err.message || "Internal server error" });
    } finally {
        try {
            await client.query(`SELECT set_config('app.current_org_id', '', false)`);
        } catch { /* best-effort reset */ }
        client.release();
    }
});
