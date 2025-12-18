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

/** ── Get UL Users (Mock): GET /api/users ──────────────────────────────── */
resourceRoutes.get(
    "/users",
    requireAuth,
    requireAnyRole(["Lead", "Admin"]),
    async (_req, res) => {
        try {
            // PILOT STUB: Returning mock users with GUIDs as requested.
            // In a real app, this would query a users table or identity provider.
            const mockUsers = [
                {
                    id: "550e8400-e29b-41d4-a716-446655440000",
                    displayName: "Alice Driver",
                    email: "alice@example.com",
                    role: "UL",
                },
                {
                    id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                    displayName: "Bob Operator",
                    email: "bob@example.com",
                    role: "UL",
                },
                {
                    id: "123e4567-e89b-12d3-a456-426614174000",
                    displayName: "Charlie Field",
                    email: "charlie@example.com",
                    role: "UL",
                },
            ];

            return res.json({ ok: true, users: mockUsers });
        } catch (err: any) {
            console.error("Error in GET /api/users:", err);
            return res
                .status(500)
                .json({ error: err.message || "Internal server error" });
        }
    }
);
