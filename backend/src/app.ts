import express from "express";
import cors from "cors";
import { healthRoutes } from "./routes/healthRoutes";
import { ulRoutes } from "./modules/work/ulRoutes";
import { routeRunRoutes } from "./modules/routes/routeRunRoutes";
import { routeRunStopRoutes } from "./modules/work/routeRunStopRoutes";
import { uploadRoutes } from "./modules/work/uploadRoutes";
import { devRoutes } from "./routes/devRoutes";
import { adminRoutes } from "./modules/admin/adminRoutes";
import { stopRoutes } from "./modules/work/stopRoutes";
import { resourceRoutes } from "./modules/admin/resourceRoutes";
import { tenantRoutes } from "./modules/admin/tenantRoutes";
import { exportDeleteRoutes } from "./modules/admin/exportDeleteRoutes";

import { routeOverrideRoutes } from "./modules/routeOverrides/routeOverrideRoutes";
import { opsRoutes } from "./modules/ops/opsRoutes";
import { specRouter } from "./openapi/specRouter";
import { createDevAuthBypass } from "./middleware/devAuthBypass";

export const app = express();

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

/** ── Dev auth bypass (dev/test only — never active in production) ────── */
if (process.env.NODE_ENV !== 'production') {
  const devBypass = createDevAuthBypass();
  if (devBypass) app.use(devBypass);
}

/** ── Mount Routes ─────────────────────────────────────────────────────── */
app.use("/api", healthRoutes);
app.use("/api", ulRoutes);
app.use("/api", routeRunRoutes);
app.use("/api", routeRunStopRoutes);
app.use("/api", uploadRoutes);
// ISSUE-043: devRoutes (incl. unauthenticated POST /dev/generate-route-run, which
// writes the live DB) must never be reachable in production. Mount only outside prod,
// mirroring the dev-auth-bypass gate above. In production these routes 404.
if (process.env.NODE_ENV !== 'production') {
  app.use("/api", devRoutes);
}
app.use("/api", adminRoutes);
app.use("/api", stopRoutes);
app.use("/api", resourceRoutes);
app.use("/api", opsRoutes);
app.use("/api/route-overrides", routeOverrideRoutes);
app.use("/api/admin/tenant", tenantRoutes);
app.use("/api", exportDeleteRoutes);
app.use("/api", specRouter);
