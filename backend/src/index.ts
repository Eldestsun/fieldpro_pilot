import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { requireAuth, requireAnyRole } from "./authz";

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
// Admin-only (Admin may also satisfy other routes by policy)
app.get("/api/admin/ops", requireAuth, requireAnyRole(["Admin"]), (_req, res) => {
  res.json({ ok: true, scope: "Admin" });
});

/** ── Server start ─────────────────────────────────────────────────────── */
const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
