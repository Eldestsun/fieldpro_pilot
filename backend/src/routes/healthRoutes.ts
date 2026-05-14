import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../authz";

export const healthRoutes = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Service health check
 *     description: Public liveness probe. Returns 200 when the backend process is running.
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 service:
 *                   type: string
 *                   example: fieldpro-backend
 *             example:
 *               ok: true
 *               service: fieldpro-backend
 */
healthRoutes.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "fieldpro-backend" });
});

/**
 * @openapi
 * /me:
 *   get:
 *     summary: Identity probe — returns backend-validated token claims
 *     description: Validates the Bearer token and returns the caller's sub, name, and roles.
 *     tags: [Health]
 *     security:
 *       - AzureAD: []
 *     responses:
 *       200:
 *         description: Authenticated caller identity
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sub:
 *                   type: string
 *                   description: Subject claim from JWT
 *                 name:
 *                   type: string
 *                 preferred_username:
 *                   type: string
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: string
 *                     enum: [UL, Lead, Admin]
 *             example:
 *               sub: "abc123-oid"
 *               name: "Jane Smith"
 *               preferred_username: "jsmith@kcmetro.gov"
 *               roles: ["Lead"]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
healthRoutes.get("/me", requireAuth, (req: any, res: Response) => {
    const u = req.user || {};
    const roles: string[] = req.roles || [];
    res.json({
        sub: u.sub,
        name: u.name,
        preferred_username: u.preferred_username,
        roles,
    });
});

/**
 * @openapi
 * /secure/ping:
 *   get:
 *     summary: Authenticated ping — returns token payload and roles
 *     description: Validates the Bearer token and echoes back the decoded payload. Useful for debugging token claims.
 *     tags: [Health]
 *     security:
 *       - AzureAD: []
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 user:
 *                   type: object
 *                   description: Decoded JWT payload
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: string
 *             example:
 *               ok: true
 *               user: { oid: "abc123", name: "Jane Smith" }
 *               roles: ["Lead"]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
healthRoutes.get("/secure/ping", requireAuth, (req, res) => {
    res.json({ ok: true, user: (req as any).user, roles: (req as any).roles });
});

/**
 * @openapi
 * /admin/secret:
 *   get:
 *     summary: Admin-only demo endpoint
 *     description: Returns a confirmation that the caller has the Admin role. Used for RBAC smoke testing.
 *     tags: [Health]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     responses:
 *       200:
 *         description: Caller is an Admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 secret:
 *                   type: string
 *                 sub:
 *                   type: string
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: string
 *             example:
 *               secret: admins only
 *               sub: "abc123"
 *               roles: ["Admin"]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
// RBAC-gated Admin demo
healthRoutes.get("/admin/secret", requireAuth, requireAnyRole(["Admin"]), (req, res) => {
    res.json({
        secret: "admins only",
        sub: (req as any).user?.sub,
        roles: (req as any).roles || [],
    });
});

/**
 * @openapi
 * /admin/ops:
 *   get:
 *     summary: Admin ops probe
 *     description: Returns 200 if the caller has Admin role. Used as an RBAC test fixture.
 *     tags: [Health]
 *     security:
 *       - AzureAD: []
 *     x-required-roles: [Admin]
 *     responses:
 *       200:
 *         description: Caller has Admin role
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 scope:
 *                   type: string
 *             example:
 *               ok: true
 *               scope: Admin
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
// Admin-only
healthRoutes.get("/admin/ops", requireAuth, requireAnyRole(["Admin"]), (_req, res) => {
    res.json({ ok: true, scope: "Admin" });
});
