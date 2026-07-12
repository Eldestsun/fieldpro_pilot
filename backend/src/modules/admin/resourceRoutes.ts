import { Router, Request } from "express";
import { requireAuth, requireAnyRole } from "../../authz";
import { withOrgContext } from "../../db";
import { resolveNumericOrgId } from "../../middleware/resolveOrgId";

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
  requireAnyRole(["Dispatch", "Admin"]),
  async (req: Request, res) => {
    try {
      const numericOrgId = await resolveNumericOrgId(req);
      const query = `
        SELECT id, label, trf_district, active, default_max_minutes, base_id
        FROM route_pools
        WHERE active = true
        ORDER BY label ASC;
      `;
      const result = await withOrgContext(numericOrgId, (client) =>
        client.query(query),
      );

      const pools = result.rows.map((row) => ({
        id: row.id,
        name: row.label,
        label: row.label,
        trfDistrict: row.trf_district,
        defaultMaxMinutes: row.default_max_minutes,
        active: row.active,
        // The pool's pre-attached dispatch base, if any. Nullable — district
        // pools carry no base, so the create-route UI must let Dispatch pick one.
        base_id: row.base_id ?? null,
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
 * /bases:
 *   get:
 *     summary: List active dispatch bases
 *     description: >
 *       Returns the org's active bases (the depot a route dispatches from). Used by
 *       the Create Route flow so Dispatch can pick a base when the pool has none
 *       pre-attached. Gated to Dispatch/Admin to match the route-creation surface.
 *     tags: [Resources]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Dispatch, Admin]
 *     responses:
 *       200:
 *         description: List of active bases
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
resourceRoutes.get(
  "/bases",
  requireAuth,
  requireAnyRole(["Dispatch", "Admin"]),
  async (req: Request, res) => {
    try {
      // PATTERN-001: bases is FORCE RLS — scope to the resolved org (fail-closed).
      const numericOrgId = await resolveNumericOrgId(req);
      const query = `
        SELECT id, name
        FROM bases
        WHERE active = true
        ORDER BY id ASC;
      `;
      const result = await withOrgContext(numericOrgId, (client) =>
        client.query(query),
      );
      const bases = result.rows.map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
      }));
      return res.json({ ok: true, bases });
    } catch (err: any) {
      console.error("Error in GET /api/bases:", err);
      return res
        .status(err.status ?? 500)
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
  requireAnyRole(["Dispatch", "Admin"]),
  async (req: Request, res) => {
    try {
      // FAIL CLOSED (ISSUE-059 / ISSUE-013 pattern): resolve org ONLY via a
      // tenant_uuid match (dev bypass short-circuits on req.user.org_id inside
      // the helper). The old inline `UNION ALL ... ORDER BY id LIMIT 1 + ?? 1`
      // fallback silently scoped every real-Entra caller to the lowest-id org
      // (org 1) — a cross-tenant identity-directory read once a second org is
      // provisioned. resolveNumericOrgId THROWS OrgResolutionError (403) on an
      // indeterminate caller; never assume, default, or scope to org 1.
      const numericOrgId = await resolveNumericOrgId(req);

      const query = `
        SELECT
          oid AS id,
          display_name AS "displayName",
          email,
          last_seen_role AS role
        FROM identity_directory
        WHERE last_seen_role IN ('UL', 'Specialist', 'Lead', 'Dispatch')
        ORDER BY display_name ASC;
      `;

      const result = await withOrgContext(numericOrgId, (client) =>
        client.query(query),
      );
      return res.json({ ok: true, users: result.rows });
    } catch (err: any) {
      console.error("Error in GET /api/users:", err);
      // Honor OrgResolutionError.status (403) so an indeterminate caller gets a
      // clean deny (matches the endpoint's declared 403), not a masked 500.
      return res
        .status(err.status ?? 500)
        .json({ error: err.message || "Internal server error" });
    }
  }
);
