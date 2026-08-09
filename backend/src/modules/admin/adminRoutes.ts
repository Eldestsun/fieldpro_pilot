import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool, withOrgContext } from "../../db";
import * as poolService from "../../services/adminPoolService";
import * as stopService from "../../services/adminStopService";
import { auditWrite, reqOrgId } from "../../middleware/auditWrite";
import { AUDIT_KNOWN_ACTIONS } from "../../middleware/auditActions";
import { resolveNumericOrgId } from "../../middleware/resolveOrgId";
import { buildCleanLogsCanonicalQueries } from "../../domains/observation/cleanLogsCanonicalQuery";

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
 *     description: >
 *       Paginated list of clean-log entries, read from the identity-free canonical
 *       layer (core.visits + core.observations) — not public.clean_logs. The 5 action
 *       booleans are pivoted from action observation rows (absence ⇒ false); cleaned_at
 *       is the visit end and duration_minutes is the visit wall-clock. `id` is the
 *       canonical visit id.
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

    // ISSUE-031 P1 (clean-logs Layer 3): canonical reads. The 5 action booleans
    // come from core.observations action rows (absence ⇒ false), cleaned_at from
    // core.visits.ended_at, duration from the visit wall-clock. No public.clean_logs
    // read remains. Shared with /api/ops/clean-logs via the single query builder.
    const { query, countQuery, queryValues, countValues } = buildCleanLogsCanonicalQueries({
      stop_id, run_date, pool_id, pageSize, offset,
    });

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
adminRoutes.post("/admin/intelligence/rebuild-risk-map", async (req: Request, res: Response) => {
  try {
    // PATTERN-001: the rebuild now requires an authoritative org (fail-closed).
    const rows = await rebuildStopRiskSnapshot(pool, await resolveNumericOrgId(req));
    res.json({ status: "ok", rows });
  } catch (err: any) {
    console.error("Error in /admin/intelligence/rebuild-risk-map:", err);
    res.status(500).json({ error: "Failed to rebuild risk map" });
  }
});


// Documented in healthRoutes.ts (registered first in app.ts; same path, same Auth)
adminRoutes.get("/admin/secret", async (_req, res) => {
  res.json({ secret: "Only admins can see this!" });
});
