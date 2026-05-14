import { Router } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { pool } from "../../db";

export const resourceRoutes = Router();

/**
 * @openapi
 * /pools:
 *   get:
 *     summary: List active route pools
 *     description: Returns all active route pools available for assignment. Used by the Lead create-route flow.
 *     tags: [Resources]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     responses:
 *       200:
 *         description: List of active pools
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 pools:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                       label: { type: string }
 *                       trfDistrict: { type: string }
 *                       defaultMaxMinutes: { type: integer }
 *                       active: { type: boolean }
 *             example:
 *               ok: true
 *               pools:
 *                 - id: POOL-001
 *                   name: "North Sector"
 *                   label: "North Sector"
 *                   trfDistrict: "TRF-1"
 *                   defaultMaxMinutes: 480
 *                   active: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
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

/**
 * @openapi
 * /users:
 *   get:
 *     summary: List assignable users (UL and Lead roles)
 *     description: Returns users from the identity directory who hold UL or Lead roles. Used by the Lead assignment UI.
 *     tags: [Resources]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Lead, Admin]
 *     responses:
 *       200:
 *         description: List of assignable users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Azure Entra OID
 *                       displayName: { type: string }
 *                       email: { type: string }
 *                       role:
 *                         type: string
 *                         enum: [UL, Lead]
 *             example:
 *               ok: true
 *               users:
 *                 - id: "abc123-oid"
 *                   displayName: "Jane Smith"
 *                   email: "jsmith@kcmetro.gov"
 *                   role: UL
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
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
