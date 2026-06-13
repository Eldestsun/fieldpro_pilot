import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool, withOrgContext } from "../../db";
import * as poolService from "../../services/adminPoolService";
import * as stopService from "../../services/adminStopService";
import { resolveNumericOrgId } from "../../middleware/resolveOrgId";

export const opsRoutes = Router();

// Ops Guard: Lead OR Admin
const requireOps = (req: Request, res: Response, next: NextFunction) => {
    requireAnyRole(["Dispatch", "Admin"])(req as any, res, next);
};

// Apply to all /ops routes
opsRoutes.use("/ops", requireAuth, requireOps);

/**
 * @openapi
 * /ops/dashboard:
 *   get:
 *     summary: Ops dashboard — aggregate metrics for today
 *     description: Read-only mirror of the Admin dashboard. Returns stop count, pool count, and today's run status summary.
 *     tags: [Ops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     responses:
 *       200:
 *         description: Today's operational metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_stops: { type: integer }
 *                 total_pools: { type: integer }
 *                 active_runs_today: { type: integer }
 *                 completed_runs_today: { type: integer }
 *             example:
 *               total_stops: 450
 *               total_pools: 12
 *               active_runs_today: 3
 *               completed_runs_today: 8
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// Explicit path: /api/ops/dashboard
// Duplicate of Admin Dashboard logic (Read-Only)
opsRoutes.get("/ops/dashboard", async (req: Request, res: Response) => {
    try {
        const numericOrgId = await resolveNumericOrgId(req);
        await withOrgContext(numericOrgId, async (client) => {
            const stopsRes = await client.query('SELECT COUNT(*) FROM stops');
            const poolsRes = await client.query('SELECT COUNT(*) FROM route_pools');

            const activeRunsRes = await client.query(`
                SELECT COUNT(*) FROM route_runs
                WHERE run_date = CURRENT_DATE
                AND status IN ('planned', 'in_progress')
            `);

            const completedRunsRes = await client.query(`
                SELECT COUNT(*) FROM route_runs
                WHERE run_date = CURRENT_DATE
                AND status IN ('completed', 'finished')
            `);

            res.json({
                total_stops: parseInt(stopsRes.rows[0].count, 10),
                total_pools: parseInt(poolsRes.rows[0].count, 10),
                active_runs_today: parseInt(activeRunsRes.rows[0].count, 10),
                completed_runs_today: parseInt(completedRunsRes.rows[0].count, 10),
            });
        });
    } catch (err: any) {
        console.error("Error in /ops/dashboard:", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /ops/pools:
 *   get:
 *     summary: List all route pools (ops read-only)
 *     description: Returns all route pools including inactive ones. Read-only for Lead/Admin.
 *     tags: [Ops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     responses:
 *       200:
 *         description: List of pools
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pools:
 *                   type: array
 *                   items: { type: object }
 *             example:
 *               pools:
 *                 - id: POOL-001
 *                   label: "North Sector"
 *                   active: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// Explicit path: /api/ops/pools
// Read-only wrapper for poolService
opsRoutes.get("/ops/pools", async (req: Request, res: Response) => {
    try {
        const numericOrgId = await resolveNumericOrgId(req);
        const pools = await withOrgContext(numericOrgId, (client) =>
            poolService.getAllPools(client),
        );
        res.json({ pools });
    } catch (err: any) {
        console.error("Error in /ops/pools:", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /ops/stops:
 *   get:
 *     summary: List stops with pagination and search (ops read-only)
 *     description: Paginated, searchable list of all stops. Read-only for Lead/Admin.
 *     tags: [Ops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 50 }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Text search filter
 *       - in: query
 *         name: pool_id
 *         schema: { type: string }
 *         description: Filter by pool
 *     responses:
 *       200:
 *         description: Paginated stop list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items: { type: array, items: { type: object } }
 *                 total: { type: integer }
 *             example:
 *               items: [{ stop_id: "12345", on_street_name: "Main St" }]
 *               total: 450
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// Explicit path: /api/ops/stops
// Read-only wrapper for stopService
opsRoutes.get("/ops/stops", async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string, 10) || 1;
        const pageSize = parseInt(req.query.pageSize as string, 10) || 50;
        const q = (req.query.q as string) || "";
        const pool_id = (req.query.pool_id as string) || undefined;

        const numericOrgId = await resolveNumericOrgId(req);
        const result = await withOrgContext(numericOrgId, (client) =>
            stopService.listStops({ page, pageSize, q, pool_id }, client),
        );
        res.json(result);
    } catch (err: any) {
        console.error("Error in /ops/stops:", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /ops/route-runs:
 *   get:
 *     summary: List route runs with filters (ops read-only)
 *     description: Paginated list of route runs. Read-only mirror of the Admin route runs list.
 *     tags: [Ops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     parameters:
 *       - in: query
 *         name: run_date
 *         schema: { type: string, format: date }
 *         description: Filter by run date (ISO 8601)
 *         example: "2026-05-13"
 *       - in: query
 *         name: pool_id
 *         schema: { type: string }
 *         description: Filter by pool
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [planned, in_progress, completed, finished] }
 *         description: Filter by status
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Paginated route run list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 route_runs:
 *                   type: array
 *                   items: { type: object }
 *             example:
 *               route_runs:
 *                 - id: 42
 *                   status: in_progress
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
// Explicit path: /api/ops/route-runs
// Read-only mirror of Admin Route Runs list
opsRoutes.get("/ops/route-runs", async (req: Request, res: Response) => {
    try {
        const run_date = (req.query.run_date as string);
        const pool_id = req.query.pool_id as string;
        const status = req.query.status as string;
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 200);
        const offset = (page - 1) * pageSize;

        const conditions: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (run_date) {
            conditions.push(`rr.run_date = $${idx++}`);
            values.push(run_date);
        }
        if (pool_id) {
            conditions.push(`rr.route_pool_id = $${idx++}`);
            values.push(pool_id);
        }
        if (status) {
            conditions.push(`rr.status = $${idx++}`);
            values.push(status);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const query = `
            SELECT
                rr.id, rr.user_id, rr.route_pool_id, rr.base_id, rr.status, rr.run_date, rr.created_at,
                rr.created_at,
                rp.label as pool_label,
                (SELECT COUNT(*) FROM route_run_stops rrs WHERE rrs.route_run_id = rr.id) as stop_count,
                (SELECT COUNT(*) FROM route_run_stops rrs WHERE rrs.route_run_id = rr.id AND rrs.status IN ('done', 'skipped')) as completed_stops
            FROM route_runs rr
            LEFT JOIN route_pools rp ON rr.route_pool_id = rp.id
            ${whereClause}
            ORDER BY rr.created_at DESC
            LIMIT $${idx++} OFFSET $${idx++}
        `;
        values.push(pageSize, offset);

        const numericOrgId = await resolveNumericOrgId(req);
        const result = await withOrgContext(numericOrgId, (client) =>
            client.query(query, values),
        );
        res.json({ route_runs: result.rows });
    } catch (err: any) {
        console.error("Error in /ops/route-runs:", err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * @openapi
 * /ops/clean-logs:
 *   get:
 *     summary: List clean logs with filters (ops read-only)
 *     description: Paginated list of clean log entries. Read-only mirror of the Admin clean logs list.
 *     tags: [Ops]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     parameters:
 *       - in: query
 *         name: stop_id
 *         schema: { type: string }
 *         description: Filter by stop ID
 *       - in: query
 *         name: pool_id
 *         schema: { type: string }
 *         description: Filter by pool
 *       - in: query
 *         name: run_date
 *         schema: { type: string, format: date }
 *         description: Filter by run date
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     responses:
 *       200:
 *         description: Paginated clean log list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clean_logs:
 *                   type: array
 *                   items: { type: object }
 *                 total: { type: integer }
 *             example:
 *               clean_logs:
 *                 - id: 1
 *                   stop_id: "12345"
 *                   cleaned_at: "2026-05-13T10:30:00Z"
 *                   duration_minutes: 12
 *               total: 150
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// Explicit path: /api/ops/clean-logs
// Read-only mirror of Admin Clean Logs list
opsRoutes.get("/ops/clean-logs", async (req: Request, res: Response) => {
    try {
        const stop_id = req.query.stop_id as string;
        const pool_id = req.query.pool_id as string;
        const run_date = req.query.run_date as string;
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 200);
        const offset = (page - 1) * pageSize;

        const conditions: string[] = [];
        const values: any[] = [];
        let idx = 1;

        if (stop_id) {
            conditions.push(`cl.stop_id = $${idx++}`);
            values.push(stop_id);
        }
        if (run_date) {
            conditions.push(`rr.run_date = $${idx++}`);
            values.push(run_date);
        }
        if (pool_id) {
            conditions.push(`s.pool_id = $${idx++}`);
            values.push(pool_id);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Main Query
        const query = `
            SELECT
                cl.id,
                cl.route_run_stop_id,
                cl.stop_id,
                cl.cleaned_at,
                cl.picked_up_litter,
                cl.emptied_trash,
                cl.washed_shelter,
                cl.washed_pad,
                cl.washed_can,
                s.on_street_name, s.pool_id,
                rr.run_date, rr.route_pool_id
            FROM clean_logs cl
            LEFT JOIN route_run_stops rrs ON cl.route_run_stop_id = rrs.id
            LEFT JOIN route_runs rr ON rrs.route_run_id = rr.id
            LEFT JOIN stops s ON cl.stop_id = s.stop_id
            ${whereClause}
            ORDER BY cl.cleaned_at DESC, cl.id DESC
            LIMIT $${idx++} OFFSET $${idx++}
        `;

        // Count Query
        const countQuery = `
            SELECT COUNT(*) as total
            FROM clean_logs cl
            LEFT JOIN route_run_stops rrs ON cl.route_run_stop_id = rrs.id
            LEFT JOIN route_runs rr ON rrs.route_run_id = rr.id
            LEFT JOIN stops s ON cl.stop_id = s.stop_id
            ${whereClause}
        `;

        const queryValues = [...values, pageSize, offset];
        const countValues = [...values];

        const numericOrgId = await resolveNumericOrgId(req);
        const [result, countResult] = await withOrgContext(numericOrgId, async (client) =>
            Promise.all([
                client.query(query, queryValues),
                client.query(countQuery, countValues),
            ]),
        );

        res.json({
            clean_logs: result.rows,
            total: parseInt(countResult.rows[0].total, 10)
        });
    } catch (err: any) {
        console.error("Error in /ops/clean-logs:", err);
        res.status(500).json({ error: err.message });
    }
});
