import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";
import * as poolService from "../../services/adminPoolService";
import * as stopService from "../../services/adminStopService";

export const opsRoutes = Router();

// Ops Guard: Lead OR Admin
const requireOps = (req: Request, res: Response, next: NextFunction) => {
    requireAnyRole(["Lead", "Admin"])(req as any, res, next);
};

// Apply to all /ops routes
opsRoutes.use("/ops", requireAuth, requireOps);

/** ── Dashboard ────────────────────────────────────────────────────────── */
// Explicit path: /api/ops/dashboard
// Duplicate of Admin Dashboard logic (Read-Only)
opsRoutes.get("/ops/dashboard", async (_req: Request, res: Response) => {
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
                AND status = 'completed'
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
        console.error("Error in /ops/dashboard:", err);
        res.status(500).json({ error: err.message });
    }
});

/** ── Pools ────────────────────────────────────────────────────────────── */
// Explicit path: /api/ops/pools
// Read-only wrapper for poolService
opsRoutes.get("/ops/pools", async (_req: Request, res: Response) => {
    try {
        const pools = await poolService.getAllPools();
        res.json({ pools });
    } catch (err: any) {
        console.error("Error in /ops/pools:", err);
        res.status(500).json({ error: err.message });
    }
});

/** ── Stops ────────────────────────────────────────────────────────────── */
// Explicit path: /api/ops/stops
// Read-only wrapper for stopService
opsRoutes.get("/ops/stops", async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string, 10) || 1;
        const pageSize = parseInt(req.query.pageSize as string, 10) || 50;
        const q = (req.query.q as string) || "";
        const pool_id = (req.query.pool_id as string) || undefined;

        const result = await stopService.listStops({ page, pageSize, q, pool_id });
        res.json(result); // { items, total }
    } catch (err: any) {
        console.error("Error in /ops/stops:", err);
        res.status(500).json({ error: err.message });
    }
});
