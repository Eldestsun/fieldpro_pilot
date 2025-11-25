// backend/src/routes/routes.ts

import express, { Request, Response } from "express";
import { planRouteWithOsrm, OsrmStop } from "../osrmClient";

const router = express.Router();

/**
 * POST /api/routes/plan
 * Body: { stops: { lon: number; lat: number; stop_id?: string }[] }
 *
 * Returns: optimized route with ordered stops and legs.
 */
router.post("/routes/plan", async (req: Request, res: Response) => {
  try {
    const { stops } = req.body as { stops?: OsrmStop[] };

    if (!stops || !Array.isArray(stops) || stops.length < 2) {
      return res.status(400).json({
        error: "Body must include 'stops' as an array of at least two items { lon, lat, stop_id? }.",
      });
    }

    // Basic validation
    for (const s of stops) {
      if (
        typeof s.lon !== "number" ||
        typeof s.lat !== "number" ||
        Number.isNaN(s.lon) ||
        Number.isNaN(s.lat)
      ) {
        return res.status(400).json({
          error: "Each stop must include numeric 'lon' and 'lat' properties.",
        });
      }
    }

    const route = await planRouteWithOsrm(stops);
    return res.json(route);
  } catch (err: any) {
    console.error("Error in /api/routes/plan:", err);
    return res.status(500).json({
      error: "Failed to plan route",
      details: err?.message ?? String(err),
    });
  }
});

export default router;