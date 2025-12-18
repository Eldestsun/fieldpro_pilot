import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";
import * as poolService from "../../services/adminPoolService";
import * as stopService from "../../services/adminStopService";

export const adminRoutes = Router();

// Strict Admin Guard
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    requireAnyRole(["Admin"])(req as any, res, next);
};

// Apply to all /admin routes
adminRoutes.use("/admin", requireAuth, requireAdmin);

/** ── Dashboard ────────────────────────────────────────────────────────── */
adminRoutes.get("/admin/dashboard", async (_req: Request, res: Response) => {
    try {
        const client = await pool.connect();
        try {
            const stopsRes = await client.query('SELECT COUNT(*) FROM stops');
            const poolsRes = await client.query('SELECT COUNT(*) FROM route_pools');

            // Active runs: planned or in_progress today
            const activeRunsRes = await client.query(`
                SELECT COUNT(*) FROM route_runs 
                WHERE run_date = CURRENT_DATE 
                AND status IN ('planned', 'in_progress')
            `);

            // Completed runs: done today
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
        } finally {
            client.release();
        }
    } catch (err: any) {
        console.error("Error in /admin/dashboard:", err);
        res.status(500).json({ error: err.message });
    }
});

/** ── Pools ────────────────────────────────────────────────────────────── */
adminRoutes.get("/admin/pools", async (_req: Request, res: Response) => {
    try {
        const pools = await poolService.getAllPools();
        res.json({ pools });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

adminRoutes.post("/admin/pools", async (req: Request, res: Response) => {
    try {
        const { id, label } = req.body;
        if (!id || !label) {
            return res.status(400).json({ error: "id and label are required" });
        }
        const newPool = await poolService.createPool(req.body);
        res.json({ pool: newPool });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

adminRoutes.patch("/admin/pools/:id", async (req: Request, res: Response) => {
    try {
        const updated = await poolService.updatePool(req.params.id, req.body);
        if (!updated) return res.status(404).json({ error: "Pool not found" });
        res.json({ pool: updated });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

adminRoutes.delete("/admin/pools/:id", async (req: Request, res: Response) => {
    try {
        const updated = await poolService.softDeletePool(req.params.id);
        if (!updated) return res.status(404).json({ error: "Pool not found" });
        res.json({ pool: updated });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/** ── Stops ────────────────────────────────────────────────────────────── */
adminRoutes.get("/admin/stops", async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 200);
        const q = req.query.q as string;
        const pool_id = req.query.pool_id as string;

        const result = await stopService.listStops({ page, pageSize, q, pool_id });
        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

adminRoutes.patch("/admin/stops/:id", async (req: Request, res: Response) => {
    try {
        const updated = await stopService.updateStop(req.params.id, req.body);
        if (!updated) return res.status(404).json({ error: "Stop not found" });
        res.json({ stop: updated });
    } catch (err: any) {
        if (err.message.includes("does not exist")) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

adminRoutes.post("/admin/stops/bulk", async (req: Request, res: Response) => {
    try {
        const { stop_ids, ...data } = req.body;
        if (!Array.isArray(stop_ids) || stop_ids.length === 0) {
            return res.status(400).json({ error: "stop_ids array is required" });
        }
        const result = await stopService.bulkUpdateStops(stop_ids, data);
        res.json(result);
    } catch (err: any) {
        if (err.message.includes("does not exist")) {
            return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

/** ── Route Runs (Global) ──────────────────────────────────────────────── */
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

        const result = await pool.query(query, values);
        res.json({ route_runs: result.rows });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/** ── Clean Logs (Global) ──────────────────────────────────────────────── */
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
                cl.*,
                s."ON_STREET_NAME", s.pool_id,
                rr.run_date, rr.route_pool_id
            FROM clean_logs cl
            LEFT JOIN route_run_stops rrs ON cl.route_run_stop_id = rrs.id
            LEFT JOIN route_runs rr ON rrs.route_run_id = rr.id
            LEFT JOIN stops s ON cl.stop_id = s."STOP_ID"
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
            LEFT JOIN stops s ON cl.stop_id = s."STOP_ID"
            ${whereClause}
        `;

        const queryValues = [...values, pageSize, offset];
        const countValues = [...values];

        const [result, countResult] = await Promise.all([
            pool.query(query, queryValues),
            pool.query(countQuery, countValues)
        ]);

        res.json({
            clean_logs: result.rows,
            total: parseInt(countResult.rows[0].total, 10)
        });
    } catch (err: any) {
        console.error("Error in /admin/clean-logs:", err);
        res.status(500).json({ error: err.message });
    }
});

/** ── Intelligence ──────────────────────────────────────────────────────── */
import { rebuildStopRiskSnapshot } from "../../intelligence/riskMapService";

adminRoutes.post("/admin/intelligence/rebuild-risk-map", async (_req: Request, res: Response) => {
    try {
        const rows = await rebuildStopRiskSnapshot(pool);
        res.json({ status: "ok", rows });
    } catch (err: any) {
        console.error("Error in /admin/intelligence/rebuild-risk-map:", err);
        res.status(500).json({ error: "Failed to rebuild risk map" });
    }
});

adminRoutes.get("/admin/secret", async (_req, res) => {
    res.json({ secret: "Only admins can see this!" });
});
