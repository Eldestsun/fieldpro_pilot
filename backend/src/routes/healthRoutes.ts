import { Router, Request, Response } from "express";
import { requireAuth, requireAnyRole } from "../authz";

export const healthRoutes = Router();

/** ── Public health endpoint ───────────────────────────────────────────── */
healthRoutes.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "fieldpro-backend" });
});

/** ── Identity probe (source of truth: backend-validated token) ────────── */
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

/** ── Secure ping (auth only) ──────────────────────────────────────────── */
healthRoutes.get("/secure/ping", requireAuth, (req, res) => {
    res.json({ ok: true, user: (req as any).user, roles: (req as any).roles });
});

// RBAC-gated Admin demo
healthRoutes.get("/admin/secret", requireAuth, requireAnyRole(["Admin"]), (req, res) => {
    res.json({
        secret: "admins only",
        sub: (req as any).user?.sub,
        roles: (req as any).roles || [],
    });
});

/** ── RBAC examples (least-privilege) ──────────────────────────────────── */
// Admin-only
healthRoutes.get("/admin/ops", requireAuth, requireAnyRole(["Admin"]), (_req, res) => {
    res.json({ ok: true, scope: "Admin" });
});
