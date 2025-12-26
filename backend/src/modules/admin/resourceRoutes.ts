import { Router } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";

export const resourceRoutes = Router();

/** ── Get Route Pools: GET /api/pools ──────────────────────────────────── */
resourceRoutes.get(
  "/pools",
  requireAuth,
  requireAnyRole(["Lead", "Admin"]),
  async (_req, res) => {
    try {
      const query = `
        SELECT id, label, trf_district, active, default_max_minutes
        FROM route_pools
        WHERE active = true
        ORDER BY label ASC;
      `;
      const result = await pool.query(query);

      const pools = result.rows.map((row) => ({
        id: row.id,
        // what the dropdown shows
        name: row.label,             // <-- use label as display name
        label: row.label,
        trfDistrict: row.trf_district,
        defaultMaxMinutes: row.default_max_minutes,
        active: row.active,
      }));

      return res.json({ ok: true, pools });
    } catch (err: any) {
      console.error("Error in GET /api/pools:", err);
      return res
        .status(500)
        .json({ error: err.message || "Internal server error" });
    }
  }
);

/** ── Get Assignable Users: GET /api/users ──────────────────────────────── */
resourceRoutes.get(
  "/users",
  requireAuth,
  requireAnyRole(["Lead", "Admin"]),
  async (_req, res) => {
    try {
      const query = `
        SELECT
          oid AS id,
          display_name AS "displayName",
          email,
          last_seen_role AS role
        FROM identity_directory
        WHERE last_seen_role IN ('UL', 'Lead')
        ORDER BY display_name ASC;
      `;

      const result = await pool.query(query);
      return res.json({ ok: true, users: result.rows });
    } catch (err: any) {
      console.error("Error in GET /api/users:", err);
      return res
        .status(500)
        .json({ error: err.message || "Internal server error" });
    }
  }
);
