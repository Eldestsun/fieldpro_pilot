import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import { requireAuth, requireAnyRole } from "./authz";
import { pool } from "./db";
import { planRouteWithOsrm, OsrmStop } from "./osrmClient";

const app = express();

/** ── Middleware (dev-safe CORS + JSON body) ───────────────────────────── */
app.use(
  cors({
    // In dev, reflect origin so localhost:5173 (or 5174) works.
    // In prod, replace with explicit allowed origins array.
    origin: true,
    credentials: true,
  })
);
app.use(express.json());

/** ── Public health endpoint ───────────────────────────────────────────── */
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "fieldpro-backend" });
});

/** ── Identity probe (source of truth: backend-validated token) ────────── */
app.get("/api/me", requireAuth, (req: any, res: Response) => {
  const u = req.user || {};
  const roles: string[] = req.roles || [];
  res.json({
    sub: u.sub,
    name: u.name,
    preferred_username: u.preferred_username,
    roles,
  });
});

/** ── Secure ping (auth only) ──────────────────────────────────────────── */
app.get("/api/secure/ping", requireAuth, (req, res) => {
  res.json({ ok: true, user: (req as any).user, roles: (req as any).roles });
});

// RBAC-gated Admin demo
app.get("/api/admin/secret", requireAuth, requireAnyRole(["Admin"]), (req, res) => {
  res.json({
    secret: "admins only",
    sub: (req as any).user?.sub,
    roles: (req as any).roles || [],
  });
});

/** ── RBAC examples (least-privilege) ──────────────────────────────────── */
// UL-only
app.get("/api/ul/inbox", requireAuth, requireAnyRole(["UL"]), (_req, res) => {
  res.json({ ok: true, scope: "UL" });
});
// Lead-only
app.get("/api/lead/hub", requireAuth, requireAnyRole(["Lead"]), (_req, res) => {
  res.json({ ok: true, scope: "Lead" });
});
// Admin-only
app.get("/api/admin/ops", requireAuth, requireAnyRole(["Admin"]), (_req, res) => {
  res.json({ ok: true, scope: "Admin" });
});

/** ── OSRM route planning: POST /api/routes/plan ──────────────────────── */
app.post("/api/routes/plan", async (req: Request, res: Response) => {
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
app.post("/api/route-runs/preview", async (req: Request, res: Response) => {
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
    console.error("Error in /api/route-runs/preview:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
});

/** ── Create Route Run: POST /api/route-runs ───────────────────────────── */
app.post("/api/route-runs", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { stop_ids, base_id, route_pool_id, user_id, run_date } = req.body;

    if (!Array.isArray(stop_ids) || stop_ids.length < 2) {
      return res
        .status(400)
        .json({ error: "stop_ids must be an array with at least two items" });
    }
    if (!base_id || !route_pool_id || !user_id) {
      return res.status(400).json({
        error: "Missing required fields: base_id, route_pool_id, user_id",
      });
    }

    // 1) Look up lon/lat for the requested stops
    const query = `
      SELECT "STOP_ID", lon, lat
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

    const stops: OsrmStop[] = result.rows.map((r: any) => ({
      lon: r.lon,
      lat: r.lat,
      stop_id: r.STOP_ID,
    }));

    // 2) Ask OSRM for an optimized trip
    const planned = await planRouteWithOsrm(stops);

    // 3) Write to DB in a transaction
    await client.query("BEGIN");

    const insertRunText = `
      INSERT INTO route_runs (
        user_id, route_pool_id, base_id, run_date, status, total_distance_m, total_duration_s
      )
      VALUES ($1, $2, $3, $4, 'planned', $5, $6)
      RETURNING id
    `;
    // Default to today if run_date is missing
    const runDateVal = run_date || new Date();

    const runRes = await client.query(insertRunText, [
      user_id,
      route_pool_id,
      base_id,
      runDateVal,
      planned.distance_m,
      planned.duration_s,
    ]);
    const routeRunId = runRes.rows[0].id;

    const insertStopText = `
      INSERT INTO route_run_stops (
        route_run_id, stop_id, sequence, planned_distance_m, planned_duration_s
      )
      VALUES ($1, $2, $3, $4, $5)
    `;

    for (let i = 0; i < planned.ordered_stops.length; i++) {
      const stop = planned.ordered_stops[i];
      // For the first stop, distance/duration from previous is null
      const leg = i > 0 ? planned.legs[i - 1] : null;
      const dist = leg ? leg.distance_m : null;
      const dur = leg ? leg.duration_s : null;

      await client.query(insertStopText, [
        routeRunId,
        stop.stop_id,
        i,
        dist,
        dur,
      ]);
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      route_run_id: routeRunId,
      distance_m: planned.distance_m,
      duration_s: planned.duration_s,
      ordered_stops: planned.ordered_stops,
      legs: planned.legs,
    });
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Error in /api/route-runs:", err);
    return res
      .status(500)
      .json({ error: err.message || "Internal server error" });
  } finally {
    client.release();
  }
});

/** ── Get Route Run Details: GET /api/route-runs/:id ───────────────────── */
/** ── Helper: Load full route run by ID ────────────────────────────────── */
async function loadRouteRunById(id: number | string) {
  const query = `
    SELECT
      rr.id                  AS route_run_id,
      rr.user_id,
      rr.route_pool_id,
      rr.base_id,
      rr.run_date,
      rr.status,
      rr.total_distance_m,
      rr.total_duration_s,
      rr.created_at          AS route_run_created_at,
      rr.updated_at          AS route_run_updated_at,
      rrs.id                 AS route_run_stop_id,
      rrs.sequence,
      rrs.planned_distance_m,
      rrs.planned_duration_s,
      rrs.created_at         AS route_run_stop_created_at,
      rrs.updated_at         AS route_run_stop_updated_at,
      s."STOP_ID",
      s."TRF_DISTRICT_CODE",
      s."BAY_CODE",
      s."BEARING_CODE",
      s."ON_STREET_NAME",
      s."INTERSECTION_LOC",
      s."HASTUS_CROSS_STREET_NAME",
      s."NUM_SHELTERS",
      s.is_hotspot,
      s.compactor,
      s.has_trash,
      s.lon,
      s.lat,
      s.notes
    FROM route_runs rr
    JOIN route_run_stops rrs ON rrs.route_run_id = rr.id
    JOIN stops s ON s."STOP_ID" = rrs.stop_id
    WHERE rr.id = $1
    ORDER BY rrs.sequence;
  `;

  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    return null;
  }

  const first = result.rows[0];
  return {
    id: first.route_run_id,
    user_id: first.user_id,
    route_pool_id: first.route_pool_id,
    base_id: first.base_id,
    run_date: first.run_date,
    status: first.status,
    total_distance_m: first.total_distance_m,
    total_duration_s: first.total_duration_s,
    created_at: first.route_run_created_at,
    updated_at: first.route_run_updated_at,
    stops: result.rows.map((r: any) => ({
      route_run_stop_id: r.route_run_stop_id,
      stop_id: r.STOP_ID,
      sequence: r.sequence,
      planned_distance_m: r.planned_distance_m,
      planned_duration_s: r.planned_duration_s,
      location: { lon: r.lon, lat: r.lat },
      on_street_name: r.ON_STREET_NAME,
      cross_street: r.HASTUS_CROSS_STREET_NAME,
      intersection_loc: r.INTERSECTION_LOC,
      bearing_code: r.BEARING_CODE,
      trf_district_code: r.TRF_DISTRICT_CODE,
      bay_code: r.BAY_CODE,
      num_shelters: r.NUM_SHELTERS,
      is_hotspot: r.is_hotspot,
      compactor: r.compactor,
      has_trash: r.has_trash,
      notes: r.notes,
    })),
  };
}

/** ── Get Route Run Details: GET /api/route-runs/:id ───────────────────── */
app.get("/api/route-runs/:id", async (req: Request, res: Response) => {
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

/** ── Get Today's Run for UL: GET /api/ul/todays-run ───────────────────── */
app.get(
  "/api/ul/todays-run",
  //requireAuth,
  //requireAnyRole(["UL", "Lead", "Admin"]),
  async (req: any, res: Response) => {
    try {
      const userId = Number(req.query.user_id);

      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          error: "user_id query parameter is required and must be a number",
        });
      }

      // Find the latest planned/in_progress run for this user today
      const findQuery = `
        SELECT id
        FROM route_runs
        WHERE user_id = $1
          AND run_date::date = CURRENT_DATE
          AND status IN ('planned', 'in_progress')
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const findRes = await pool.query(findQuery, [userId]);

      if (findRes.rows.length === 0) {
        return res
          .status(404)
          .json({ error: "No route run found for this user for today" });
      }

      const routeRunId = findRes.rows[0].id;
      const routeRun = await loadRouteRunById(routeRunId);

      return res.json({ ok: true, route_run: routeRun });
    } catch (err: any) {
      console.error("Error in /api/ul/todays-run:", err);
      return res
        .status(500)
        .json({ error: err.message || "Internal server error" });
    }
  }
);

/** ── Server start ─────────────────────────────────────────────────────── */
const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});