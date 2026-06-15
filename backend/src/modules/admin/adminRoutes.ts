import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool, withOrgContext } from "../../db";
import * as poolService from "../../services/adminPoolService";
import * as stopService from "../../services/adminStopService";
import { auditWrite, reqOrgId } from "../../middleware/auditWrite";
import { AUDIT_KNOWN_ACTIONS } from "../../middleware/auditActions";
import { resolveNumericOrgId } from "../../middleware/resolveOrgId";

export const adminRoutes = Router();

// Strict Admin Guard
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  requireAnyRole(["Admin"])(req as any, res, next);
};

// Apply to all /admin routes
adminRoutes.use("/admin", requireAuth, requireAdmin);

/** ── Dashboard ────────────────────────────────────────────────────────── */
/**
 * @openapi
 * /admin/dashboard:
 *   get:
 *     summary: Admin dashboard — today's operational metrics
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     responses:
 *       200:
 *         description: Today's metrics
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
adminRoutes.get("/admin/dashboard", async (req: Request, res: Response) => {
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
    console.error("Error in /admin/dashboard:", err);
    res.status(500).json({ error: err.message });
  }
});

/** ── Pools ────────────────────────────────────────────────────────────── */
/**
 * @openapi
 * /admin/pools:
 *   get:
 *     summary: List all route pools (admin)
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
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
adminRoutes.get("/admin/pools", async (req: Request, res: Response) => {
  try {
    const numericOrgId = await resolveNumericOrgId(req);
    const pools = await withOrgContext(numericOrgId, (client) =>
      poolService.getAllPools(client),
    );
    res.json({ pools });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /admin/pools:
 *   post:
 *     summary: Create a new route pool
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     x-audit-action: admin.config_change
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, label]
 *             properties:
 *               id:
 *                 type: string
 *                 example: POOL-013
 *               label:
 *                 type: string
 *                 example: "South Sector"
 *     responses:
 *       200:
 *         description: Pool created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pool: { type: object }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
adminRoutes.post("/admin/pools", async (req: Request, res: Response) => {
  try {
    const { id, label } = req.body;
    if (!id || !label) {
      return res.status(400).json({ error: "id and label are required" });
    }
    const numericOrgId = await resolveNumericOrgId(req);
    const newPool = await withOrgContext(numericOrgId, (client) =>
      poolService.createPool(req.body, numericOrgId, client),
    );
    auditWrite({
      actor_oid: (req as any).user?.oid ?? 'unknown',
      org_id: reqOrgId(req),
      action: 'admin.config_change',
      resource_type: 'route_pool',
      resource_id: String(id),
      detail: { change: 'pool_created', label },
      ip_address: req.ip,
    });
    res.json({ pool: newPool });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /admin/pools/{id}:
 *   patch:
 *     summary: Update a route pool
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     x-audit-action: admin.config_change
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: POOL-001
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               label: { type: string }
 *               active: { type: boolean }
 *     responses:
 *       200:
 *         description: Pool updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pool: { type: object }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
adminRoutes.patch("/admin/pools/:id", async (req: Request, res: Response) => {
  try {
    const numericOrgId = await resolveNumericOrgId(req);
    const updated = await withOrgContext(numericOrgId, (client) =>
      poolService.updatePool(req.params.id, req.body, client),
    );
    if (!updated) return res.status(404).json({ error: "Pool not found" });
    auditWrite({
      actor_oid: (req as any).user?.oid ?? 'unknown',
      org_id: reqOrgId(req),
      action: 'admin.config_change',
      resource_type: 'route_pool',
      resource_id: String(req.params.id),
      detail: { change: 'pool_updated', fields: Object.keys(req.body) },
      ip_address: req.ip,
    });
    res.json({ pool: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /admin/pools/{id}:
 *   delete:
 *     summary: Soft-delete a route pool
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     x-audit-action: admin.config_change
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: POOL-001
 *     responses:
 *       200:
 *         description: Pool soft-deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pool: { type: object }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
adminRoutes.delete("/admin/pools/:id", async (req: Request, res: Response) => {
  try {
    const numericOrgId = await resolveNumericOrgId(req);
    const updated = await withOrgContext(numericOrgId, (client) =>
      poolService.softDeletePool(req.params.id, client),
    );
    if (!updated) return res.status(404).json({ error: "Pool not found" });
    auditWrite({
      actor_oid: (req as any).user?.oid ?? 'unknown',
      org_id: reqOrgId(req),
      action: 'admin.config_change',
      resource_type: 'route_pool',
      resource_id: String(req.params.id),
      detail: { change: 'pool_soft_deleted' },
      ip_address: req.ip,
    });
    res.json({ pool: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** ── Stops ────────────────────────────────────────────────────────────── */
/**
 * @openapi
 * /admin/stops:
 *   get:
 *     summary: List stops with pagination and search (admin)
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 50, maximum: 200 }
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
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
adminRoutes.get("/admin/stops", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 200);
    const q = req.query.q as string;
    const pool_id = req.query.pool_id as string;

    const numericOrgId = await resolveNumericOrgId(req);
    const result = await withOrgContext(numericOrgId, (client) =>
      stopService.listStops({ page, pageSize, q, pool_id }, client),
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /admin/stops/{id}:
 *   patch:
 *     summary: Update a stop (admin)
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     x-audit-action: admin.stop_edit
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Stop ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pool_id: { type: string }
 *               active: { type: boolean }
 *     responses:
 *       200:
 *         description: Stop updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stop: { type: object }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
adminRoutes.patch("/admin/stops/:id", async (req: Request, res: Response) => {
  try {
    const numericOrgId = await resolveNumericOrgId(req);
    const updated = await withOrgContext(numericOrgId, (client) =>
      stopService.updateStop(req.params.id, req.body, client),
    );
    if (!updated) return res.status(404).json({ error: "Stop not found" });
    auditWrite({
      actor_oid: (req as any).user?.oid ?? 'unknown',
      org_id: reqOrgId(req),
      action: 'admin.stop_edit',
      resource_type: 'stop',
      resource_id: String(req.params.id),
      detail: { fields: Object.keys(req.body) },
      ip_address: req.ip,
    });
    res.json({ stop: updated });
  } catch (err: any) {
    if (err.message.includes("does not exist")) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * @openapi
 * /admin/stops/bulk:
 *   post:
 *     summary: Bulk update stops (admin)
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     x-audit-action: admin.stop_edit
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
 *                 example: ["12345", "67890"]
 *               pool_id: { type: string }
 *               active: { type: boolean }
 *     responses:
 *       200:
 *         description: Bulk update result
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
adminRoutes.post("/admin/stops/bulk", async (req: Request, res: Response) => {
  try {
    const { stop_ids, ...data } = req.body;
    if (!Array.isArray(stop_ids) || stop_ids.length === 0) {
      return res.status(400).json({ error: "stop_ids array is required" });
    }
    const numericOrgId = await resolveNumericOrgId(req);
    const result = await withOrgContext(numericOrgId, (client) =>
      stopService.bulkUpdateStops(stop_ids, data, client),
    );
    auditWrite({
      actor_oid: (req as any).user?.oid ?? 'unknown',
      org_id: reqOrgId(req),
      action: 'admin.stop_edit',
      resource_type: 'stop',
      resource_id: stop_ids.join(','),
      detail: { bulk: true, count: stop_ids.length, fields: Object.keys(data) },
      ip_address: req.ip,
    });
    res.json(result);
  } catch (err: any) {
    if (err.message.includes("does not exist")) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

/** ── Route Runs (Global) ──────────────────────────────────────────────── */
/**
 * @openapi
 * /admin/route-runs:
 *   get:
 *     summary: List route runs with filters (admin)
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     parameters:
 *       - in: query
 *         name: run_date
 *         schema: { type: string, format: date }
 *         description: Filter by run date (defaults to today)
 *         example: "2026-05-13"
 *       - in: query
 *         name: pool_id
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [planned, in_progress, completed, finished] }
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
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
adminRoutes.get("/admin/route-runs", async (req: Request, res: Response) => {
  try {
    const run_date = (req.query.run_date as string) || new Date().toISOString().split('T')[0];
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
                rp.label as pool_label,
                (SELECT COUNT(*) FROM route_run_stops rrs WHERE rrs.route_run_id = rr.id) as stop_count
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
    res.status(500).json({ error: err.message });
  }
});

/** ── Clean Logs (Global) ──────────────────────────────────────────────── */
/**
 * @openapi
 * /admin/clean-logs:
 *   get:
 *     summary: List clean logs with filters (admin)
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     parameters:
 *       - in: query
 *         name: stop_id
 *         schema: { type: string }
 *       - in: query
 *         name: pool_id
 *         schema: { type: string }
 *       - in: query
 *         name: run_date
 *         schema: { type: string, format: date }
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
adminRoutes.get("/admin/clean-logs", async (req: Request, res: Response) => {
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
    const { result, countResult } = await withOrgContext(numericOrgId, async (client) => {
      const result = await client.query(query, queryValues);
      const countResult = await client.query(countQuery, countValues);
      return { result, countResult };
    });

    res.json({
      clean_logs: result.rows,
      total: parseInt(countResult.rows[0].total, 10)
    });
  } catch (err: any) {
    console.error("Error in /admin/clean-logs:", err);
    res.status(500).json({ error: err.message });
  }
});

/** ── Audit Log (S1-3) ─────────────────────────────────────────────────── */
/**
 * @openapi
 * /admin/audit-log:
 *   get:
 *     summary: Query the immutable audit log (S1-3)
 *     description: >
 *       Returns audit events in JSON (default) or CSV. Scoped to org by bearer token.
 *       Date range max 365 days; window defaults to last 30 days. Max 1000 rows per request.
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Start date ISO 8601 (default 30 days ago)
 *         example: "2026-04-01"
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: End date ISO 8601 (default now)
 *         example: "2026-05-13"
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum:
 *             - auth.login
 *             - auth.login_failed
 *             - assignment.create
 *             - assignment.reassign
 *             - assignment.cancel
 *             - export.data_export
 *             - export.delete_confirm
 *             - export.delete_execute
 *             - admin.config_change
 *             - admin.user_role_change
 *             - admin.stop_edit
 *             - admin.route_edit
 *             - upload.rejected
 *             - admin.oid_decrypt
 *             - admin.audit_log_read
 *         description: Filter by audit action
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *         description: Response format
 *     responses:
 *       200:
 *         description: Audit log entries (JSON) or CSV attachment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entries:
 *                   type: array
 *                   items: { type: object }
 *                 total: { type: integer }
 *                 from: { type: string, format: date-time }
 *                 to: { type: string, format: date-time }
 *           text/csv:
 *             schema:
 *               type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
adminRoutes.get("/admin/audit-log", async (req: Request, res: Response) => {
  try {
    const format = (req.query.format as string | undefined) ?? 'json';
    if (format !== 'json' && format !== 'csv') {
      return res.status(400).json({ error: "Invalid format. Accepted values: 'json', 'csv'." });
    }

    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let fromDate: Date;
    let toDate: Date;

    if (req.query.from) {
      fromDate = new Date(req.query.from as string);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({ error: "Invalid 'from' date. Use ISO 8601 format (e.g. 2026-04-01)." });
      }
    } else {
      fromDate = defaultFrom;
    }

    if (req.query.to) {
      toDate = new Date(req.query.to as string);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({ error: "Invalid 'to' date. Use ISO 8601 format (e.g. 2026-05-13)." });
      }
    } else {
      toDate = now;
    }

    const rangeMs = toDate.getTime() - fromDate.getTime();
    if (rangeMs < 0) {
      return res.status(400).json({ error: "'from' must be before 'to'." });
    }
    if (rangeMs > 365 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "Date range exceeds 365 days. Narrow the window to page through the log." });
    }

    const actionFilter = req.query.action as string | undefined;
    if (actionFilter && !AUDIT_KNOWN_ACTIONS.has(actionFilter)) {
      console.warn(`[audit-log] Unknown action filter: "${actionFilter}" — querying anyway`);
    }

    const orgId = await reqOrgId(req);

    const { entries, total } = await withOrgContext(orgId, async (client) => {
      const conditions: string[] = ['org_id = $1', 'occurred_at >= $2', 'occurred_at <= $3'];
      const values: unknown[] = [orgId, fromDate.toISOString(), toDate.toISOString()];
      let idx = 4;

      if (actionFilter) {
        conditions.push(`action = $${idx++}`);
        values.push(actionFilter);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;

      const [rowsRes, countRes] = await Promise.all([
        client.query(
          `SELECT id, actor_oid, action, resource_type, resource_id, detail, ip_address, occurred_at
           FROM audit_log
           ${where}
           ORDER BY occurred_at DESC
           LIMIT 1000`,
          values,
        ),
        client.query(`SELECT COUNT(*)::int AS total FROM audit_log ${where}`, values),
      ]);

      return { entries: rowsRes.rows, total: countRes.rows[0].total as number };
    });

    auditWrite({
      actor_oid: (req as any).user?.oid ?? 'unknown',
      org_id: orgId,
      action: 'admin.audit_log_read',
      resource_type: 'audit_log',
      detail: {
        query_from: fromDate.toISOString(),
        query_to: toDate.toISOString(),
        action_filter: actionFilter ?? null,
        format,
        result_count: total,
      },
      ip_address: req.ip,
    });

    if (format === 'csv') {
      const headers = ['id', 'actor_oid', 'action', 'resource_type', 'resource_id', 'detail', 'ip_address', 'occurred_at'];

      function csvCell(val: unknown): string {
        if (val === null || val === undefined) return '';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        // RFC 4180: quote fields containing comma, double-quote, or newline
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }

      const csvRows = [
        headers.join(','),
        ...entries.map((row: Record<string, unknown>) =>
          headers.map(h => csvCell(row[h])).join(',')
        ),
      ];

      // Filename uses ISO dates with colons replaced for cross-platform compatibility
      const filenameFrom = fromDate.toISOString().replace(/:/g, '-');
      const filenameTo   = toDate.toISOString().replace(/:/g, '-');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-log-${filenameFrom}-to-${filenameTo}.csv"`);
      return res.send(csvRows.join('\r\n'));
    }

    return res.json({
      entries,
      total,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    });

  } catch (err: any) {
    console.error("Error in /admin/audit-log:", err);
    res.status(500).json({ error: err.message });
  }
});

/** ── Intelligence ──────────────────────────────────────────────────────── */
import { rebuildStopRiskSnapshot } from "../../intelligence/riskMapService";

/**
 * @openapi
 * /admin/intelligence/rebuild-risk-map:
 *   post:
 *     summary: Rebuild the stop risk snapshot
 *     description: Recomputes the risk snapshot table from clean log history. Admin-only; may take several seconds on large datasets.
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     responses:
 *       200:
 *         description: Rebuild complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 rows: { type: integer }
 *             example:
 *               status: ok
 *               rows: 450
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
adminRoutes.post("/admin/intelligence/rebuild-risk-map", async (_req: Request, res: Response) => {
  try {
    const rows = await rebuildStopRiskSnapshot(pool);
    res.json({ status: "ok", rows });
  } catch (err: any) {
    console.error("Error in /admin/intelligence/rebuild-risk-map:", err);
    res.status(500).json({ error: "Failed to rebuild risk map" });
  }
});

/** ── Control Center (Phase B) ─────────────────────────────────────────── */
// Strict Guardrails: Admin Only. No PII latency/performance metrics.

// ISSUE-031/CC-REPOINT (DQ A3): the 8 pinned safety *_present observation types.
// Canonical hazard reads filter to exactly these. Distinct from the infrastructure
// *_present set — do not conflate. Includes other_safety_concern_present.
const SAFETY_HAZARD_OBSERVATION_TYPES = [
  'encampment_present',
  'fire_present',
  'dangerous_activity_present',
  'drug_use_present',
  'violence_present',
  'biohazard_present',
  'access_blocked_present',
  'other_safety_concern_present',
] as const;

const ccRouter = Router();
ccRouter.use(requireAuth, requireAdmin);

/**
 * @openapi
 * /admin/control-center/overview:
 *   get:
 *     summary: Control center — today's operational overview
 *     description: >
 *       Aggregate clean events, total clean minutes, and hazards reported for today,
 *       read from the identity-free canonical layer (core.visits + core.observations).
 *       Per ISSUE-031 DQ A2 the high-severity hazard count is not surfaced — canonical
 *       severity is a sparse text column; the high-severity cut is restored in the MV-4/DQ-4
 *       intelligence pass.
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     responses:
 *       200:
 *         description: Today's overview metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clean_events: { type: integer }
 *                 total_clean_minutes: { type: number }
 *                 hazards_reported: { type: integer }
 *             example:
 *               clean_events: 38
 *               total_clean_minutes: 462.5
 *               hazards_reported: 4
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// 0. Overview / Today at a Glance (Panel 1 - Authoritative)
ccRouter.get("/overview", async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    // ISSUE-031/CC-REPOINT: canonical reads — clean events/minutes from core.visits
    // (completed visit = clean event; duration = ended_at - started_at), hazards from
    // core.observations filtered to the 8 pinned safety *_present types (observed_at).
    // No identity columns. High-severity hazard cut dropped per DQ A2.
    const query = `
            WITH today AS (
              SELECT current_date AS service_date
            ),

            clean_metrics AS (
              SELECT
                COUNT(*) AS clean_events,
                COALESCE(SUM(EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60.0), 0) AS total_clean_minutes
              FROM core.visits v
              JOIN today t
                ON v.ended_at::date = t.service_date
              WHERE v.outcome = 'completed'
                AND v.ended_at IS NOT NULL
            ),

            hazard_metrics AS (
              SELECT
                COUNT(*) AS hazards_reported
              FROM core.observations o
              JOIN today t
                ON o.observed_at::date = t.service_date
              WHERE o.observation_type = ANY($1::text[])
            )

            SELECT
              c.clean_events,
              c.total_clean_minutes,
              h.hazards_reported
            FROM clean_metrics c
            CROSS JOIN hazard_metrics h;
        `;

    const result = await client.query(query, [SAFETY_HAZARD_OBSERVATION_TYPES]);
    // Return row 0 as JSON, or default zeros if something goes strictly wrong (though aggregate always returns 1 row)
    const row = result.rows[0] || {
      clean_events: 0,
      total_clean_minutes: 0,
      hazards_reported: 0
    };

    res.json({
      clean_events: parseInt(row.clean_events, 10),
      total_clean_minutes: parseFloat(row.total_clean_minutes),
      hazards_reported: parseInt(row.hazards_reported, 10)
    });
  } catch (err: any) {
    console.error("Error in /api/admin/control-center/overview:", err);
    res.status(500).json({ error: "Failed to fetch overview metrics" });
  } finally {
    client.release();
  }
});



/**
 * @openapi
 * /admin/control-center/routes:
 *   get:
 *     summary: Control center — active route status table
 *     description: Per-route stop counts, resolved counts, emergency additions, and skip flags for planned and in-progress runs today.
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     responses:
 *       200:
 *         description: Array of active route status rows
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   route_run_id: { type: integer }
 *                   pool_id: { type: string }
 *                   planned_stops: { type: integer }
 *                   emergency_stops: { type: integer }
 *                   resolved_stops: { type: integer }
 *                   skipped_stops: { type: integer }
 *                   total_known_stops: { type: integer }
 *                   observed_minutes: { type: number }
 *                   has_emergency_additions: { type: boolean }
 *                   high_skip_count: { type: boolean }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// 2. Route Status Table (Panel 2 - Authoritative)
ccRouter.get("/routes", async (req: Request, res: Response) => {
  try {
    const query = `
WITH route_base AS (
  SELECT
    rr.id            AS route_run_id,
    rr.route_pool_id AS pool_id,
    rr.status        AS route_status,
    rr.run_date,
    rr.started_at,
    rr.finished_at
  FROM public.route_runs rr
  WHERE rr.status IN ('planned', 'in_progress')
),

stop_counts AS (
  SELECT
    rrs.route_run_id,
    COUNT(*) FILTER (
      WHERE rrs.origin_type IS DISTINCT FROM 'emergency'
    ) AS planned_stops,
    COUNT(*) FILTER (
      WHERE rrs.origin_type = 'emergency'
    ) AS emergency_stops,
    COUNT(*) FILTER (
      WHERE rrs.status IN ('done', 'skipped')
    ) AS resolved_stops,
    COUNT(*) FILTER (
      WHERE rrs.status = 'skipped'
    ) AS skipped_stops
  FROM public.route_run_stops rrs
  JOIN route_base rb
    ON rb.route_run_id = rrs.route_run_id
  GROUP BY rrs.route_run_id
),

observed_minutes AS (
  SELECT
    rrs.route_run_id,
    COALESCE(SUM(cl.duration_minutes), 0) AS observed_minutes
  FROM public.route_run_stops rrs
  JOIN route_base rb
    ON rb.route_run_id = rrs.route_run_id
  LEFT JOIN public.clean_logs cl
    ON cl.route_run_stop_id = rrs.id
  GROUP BY rrs.route_run_id
),

deviation_flags AS (
  SELECT
    rrs.route_run_id,
    BOOL_OR(rrs.origin_type = 'emergency') AS has_emergency_additions,
    COUNT(*) FILTER (WHERE rrs.status = 'skipped') >= 3 AS high_skip_count
  FROM public.route_run_stops rrs
  JOIN route_base rb
    ON rb.route_run_id = rrs.route_run_id
  GROUP BY rrs.route_run_id
)

SELECT
  rb.route_run_id,
  rb.pool_id,

  COALESCE(sc.planned_stops, 0)     AS planned_stops,
  COALESCE(sc.emergency_stops, 0)   AS emergency_stops,
  COALESCE(sc.resolved_stops, 0)    AS resolved_stops,
  COALESCE(sc.skipped_stops, 0)     AS skipped_stops,

  (COALESCE(sc.planned_stops, 0) + COALESCE(sc.emergency_stops, 0))
    AS total_known_stops,

  COALESCE(om.observed_minutes, 0)  AS observed_minutes,

  COALESCE(df.has_emergency_additions, false) AS has_emergency_additions,
  COALESCE(df.high_skip_count, false)         AS high_skip_count

FROM route_base rb
LEFT JOIN stop_counts sc
  ON sc.route_run_id = rb.route_run_id
LEFT JOIN observed_minutes om
  ON om.route_run_id = rb.route_run_id
LEFT JOIN deviation_flags df
  ON df.route_run_id = rb.route_run_id

ORDER BY rb.route_run_id;
        `;
    const numericOrgId = await resolveNumericOrgId(req);
    const result = await withOrgContext(numericOrgId, (client) =>
      client.query(query),
    );
    console.log("[ControlCenter:Routes] rows =", result.rows);
    res.json(result.rows);
  } catch (err: any) {
    console.error("Error in /api/admin/control-center/routes:", err);
    res.status(500).json({ error: "Failed to fetch route status" });
  }
});

/**
 * @openapi
 * /admin/control-center/exceptions:
 *   get:
 *     summary: Control center — today's exception summary
 *     description: Skips by reason, total hazards, total infrastructure issues, and emergency/ad-hoc stop count for today.
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     responses:
 *       200:
 *         description: Exception summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 skips_by_reason:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       reason: { type: string }
 *                       count: { type: integer }
 *                 total_hazards: { type: integer }
 *                 total_infra_issues: { type: integer }
 *                 emergency_count: { type: integer }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// 3. Exceptions (Strict Guardrails - Phase B)
ccRouter.get("/exceptions", async (req: Request, res: Response) => {
  const numericOrgId = await resolveNumericOrgId(req);
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(numericOrgId)]);
    const queries = {
      // 1. Skips by Reason
      skips: `
                WITH skipped AS (
                  SELECT
                    rrs.id,
                    COALESCE(
                      NULLIF(h.details->>'hazard_types', ''),
                      h.hazard_type,
                      'unspecified'
                    ) AS reason
                  FROM public.route_run_stops rrs
                  LEFT JOIN public.hazards h
                    ON h.id = rrs.hazard_id
                  WHERE
                    rrs.status = 'skipped'
                    AND rrs.updated_at::date = CURRENT_DATE
                )
                SELECT
                  reason,
                  COUNT(*)::int AS count
                FROM skipped
                GROUP BY reason
                ORDER BY count DESC;
            `,
      // 2. Total Hazards Today
      hazards: `
                SELECT COUNT(*)::int AS total_hazards
                FROM public.hazards
                WHERE reported_at >= CURRENT_DATE;
            `,
      // 3. Infrastructure Issues Today
      infra: `
                SELECT COUNT(*)::int AS total_infra_issues
                FROM public.infrastructure_issues
                WHERE reported_at >= CURRENT_DATE;
            `,
      // 4. Emergency / Ad-Hoc Stops Today
      emergency: `
                SELECT COUNT(*)::int AS emergency_count
                FROM public.route_run_stops
                WHERE
                  origin_type IN ('emergency', 'ul_ad_hoc')
                  AND created_at::date = CURRENT_DATE;
            `
    };

    const [skipsRes, hazardsRes, infraRes, emergencyRes] = await Promise.all([
      client.query(queries.skips),
      client.query(queries.hazards),
      client.query(queries.infra),
      client.query(queries.emergency)
    ]);

    res.json({
      skips_by_reason: skipsRes.rows,
      total_hazards: parseInt(hazardsRes.rows[0]?.total_hazards || '0', 10),
      total_infra_issues: parseInt(infraRes.rows[0]?.total_infra_issues || '0', 10),
      emergency_count: parseInt(emergencyRes.rows[0]?.emergency_count || '0', 10)
    });

  } catch (err: any) {
    console.error("Error in /api/admin/control-center/exceptions:", err);
    res.status(500).json({ error: "Failed to fetch exceptions" });
  } finally {
    try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort reset */ }
    client.release();
  }
});

/**
 * @openapi
 * /admin/control-center/difficulty:
 *   get:
 *     summary: Control center — today's difficulty indicators
 *     description: Heavy stops by location, routes with high difficulty density, and hotspot area concentration. Observational intelligence — no per-worker metrics.
 *     tags: [Admin]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     responses:
 *       200:
 *         description: Difficulty indicators
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 heavy_stops:
 *                   type: array
 *                   items: { type: object }
 *                 heavy_routes:
 *                   type: array
 *                   items: { type: object }
 *                 hotspot_areas:
 *                   type: array
 *                   items: { type: object }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
// 4. Difficulty Indicators (Observational Intelligence - Phase B)
ccRouter.get("/difficulty", async (req: Request, res: Response) => {
  const numericOrgId = await resolveNumericOrgId(req);
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [String(numericOrgId)]);
    const queries = {
      // ISSUE-031/CC-REPOINT: canonical reads. Clean events/minutes from core.visits
      // (completed visit = clean event; duration = ended_at - started_at). Location label
      // and stop_id from the canonical spine (core.locations + core.location_external_ids).
      // Route/pool grouping from core.assignments via the visit.assignment_id link.
      // No identity columns anywhere in these reads.

      // A. Heavy Stops (Location Difficulty)
      heavyStops: `
                WITH today AS (
                  SELECT CURRENT_DATE AS service_date
                ),
                cleaned AS (
                  SELECT
                    v.location_id,
                    AVG(EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60.0) AS avg_minutes
                  FROM core.visits v
                  JOIN today t
                    ON v.ended_at::date = t.service_date
                  WHERE v.outcome = 'completed'
                    AND v.ended_at IS NOT NULL
                  GROUP BY v.location_id
                ),
                baseline AS (
                  SELECT
                    PERCENTILE_CONT(0.5)
                      WITHIN GROUP (ORDER BY avg_minutes) AS median_minutes
                  FROM cleaned
                )
                SELECT
                  c.location_id,
                  loc.label,
                  lei.external_id AS stop_id,
                  s.on_street_name,
                  s.intersection_loc,
                  CASE
                    WHEN c.avg_minutes >= b.median_minutes * 1.5 THEN 'very_heavy'
                    WHEN c.avg_minutes >= b.median_minutes * 1.2 THEN 'heavy'
                    ELSE 'normal'
                  END AS difficulty_band
                FROM cleaned c
                CROSS JOIN baseline b
                JOIN core.locations loc
                  ON loc.id = c.location_id
                  AND loc.location_type = 'transit_stop'
                JOIN core.location_external_ids lei
                  ON lei.location_id = loc.id
                  AND lei.source_system = 'metro_stop'
                LEFT JOIN public.stops s
                  ON s.stop_id = lei.external_id
                WHERE c.avg_minutes >= b.median_minutes * 1.2
                LIMIT 25;
            `,
      // B. Routes with High Difficulty Density
      heavyRoutes: `
                WITH today AS (
                  SELECT CURRENT_DATE AS service_date
                ),
                route_work AS (
                  SELECT
                    asg.source_ref      AS route_id,
                    asg.assignment_type AS pool_label,
                    SUM(EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60.0) AS total_minutes,
                    COUNT(*) AS stop_count
                  FROM core.visits v
                  JOIN core.assignments asg
                    ON asg.id = v.assignment_id
                  JOIN today t
                    ON v.ended_at::date = t.service_date
                  WHERE v.outcome = 'completed'
                    AND v.ended_at IS NOT NULL
                  GROUP BY
                    asg.source_ref,
                    asg.assignment_type
                ),
                density AS (
                  SELECT
                    route_id,
                    pool_label,
                    total_minutes / NULLIF(stop_count, 0) AS minutes_per_stop
                  FROM route_work
                )
                SELECT
                  route_id,
                  pool_label,
                  CASE
                    WHEN minutes_per_stop >= 18 THEN 'high'
                    WHEN minutes_per_stop >= 14 THEN 'elevated'
                    ELSE 'normal'
                  END AS difficulty_density_band
                FROM density
                WHERE minutes_per_stop >= 14;
            `,
      // C. Hotspot Concentration
      hotspots: `
                WITH heavy_stops AS (
                  SELECT
                    v.location_id
                  FROM core.visits v
                  WHERE v.outcome = 'completed'
                    AND v.ended_at IS NOT NULL
                    AND v.ended_at::date = CURRENT_DATE
                  GROUP BY v.location_id
                  HAVING AVG(EXTRACT(EPOCH FROM (v.ended_at - v.started_at)) / 60.0) >= 15
                )
                SELECT
                  asg.assignment_type      AS pool_label,
                  COUNT(*)::int            AS heavy_stop_count
                FROM heavy_stops hs
                JOIN core.assignments asg
                  ON asg.location_id = hs.location_id
                GROUP BY asg.assignment_type
                ORDER BY heavy_stop_count DESC;
            `
    };

    const [heavyStopsRes, heavyRoutesRes, hotspotsRes] = await Promise.all([
      client.query(queries.heavyStops),
      client.query(queries.heavyRoutes),
      client.query(queries.hotspots)
    ]);

    res.json({
      heavy_stops: heavyStopsRes.rows,
      heavy_routes: heavyRoutesRes.rows,
      hotspot_areas: hotspotsRes.rows
    });
  } catch (err: any) {
    console.error("Error in /api/admin/control-center/difficulty:", err);
    res.status(500).json({ error: "Failed to fetch difficulty indicators" });
  } finally {
    try { await client.query(`SELECT set_config('app.current_org_id', '', false)`); } catch { /* best-effort reset */ }
    client.release();
  }
});

adminRoutes.use("/admin/control-center", ccRouter);

// Documented in healthRoutes.ts (registered first in app.ts; same path, same Auth)
adminRoutes.get("/admin/secret", async (_req, res) => {
  res.json({ secret: "Only admins can see this!" });
});
