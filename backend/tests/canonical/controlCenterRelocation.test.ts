import type { AddressInfo } from "net";
import type { Server } from "http";
process.env.DEV_AUTH_BYPASS = "true";

import { test, assert, assertEqual } from "../setup";

// ============================================================================
// SEAM-B B1 — Control Center relocated to /api/ops/control-center, guard widened
// from Admin-only to ["Dispatch","Admin"] (requireOps, mirroring opsRoutes). The
// four handlers moved byte-identical (proved by diff in the extraction commit).
// This asserts the new mount + widened guard on ALL FOUR endpoints:
//   Dispatch → 200, Admin → 200, Specialist → denied (403), unauthenticated → 401.
// ============================================================================

const CC = "/api/ops/control-center";
const ENDPOINTS = ["/overview", "/routes", "/exceptions", "/difficulty"] as const;

async function req(baseUrl: string, path: string, role?: string): Promise<number> {
  const headers: Record<string, string> = {};
  if (role) {
    headers["X-Dev-User-Oid"] = `seam-b-cc-suite-${role}`;
    headers["X-Dev-User-Roles"] = role;
    headers["X-Dev-User-Org-Id"] = "1";
  }
  const res = await fetch(`${baseUrl}${CC}${path}`, { headers });
  return res.status;
}

test("SEAM-B: /ops/control-center — Dispatch+Admin allowed, Specialist denied, anon 401 (all 4 endpoints)", async () => {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const ep of ENDPOINTS) {
      assertEqual(await req(baseUrl, ep, "Dispatch"), 200, `${ep}: Dispatch → 200 (relocation grant)`);
      assertEqual(await req(baseUrl, ep, "Admin"), 200, `${ep}: Admin → 200 (retained)`);
      const spec = await req(baseUrl, ep, "Specialist");
      assertEqual(spec, 403, `${ep}: Specialist → 403 (fail-closed, under-privileged)`);
      const anon = await req(baseUrl, ep);
      assert(anon === 401 || anon === 403, `${ep}: unauthenticated → denied (got ${anon})`);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("SEAM-B: the old /api/admin/control-center mount is retired (404, not served)", async () => {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    // Admin token on the OLD path — the ccRouter no longer mounts there, so it is
    // not a served route (404), not a 200. (Frontend handles muscle-memory via redirect.)
    const res = await fetch(`${baseUrl}/api/admin/control-center/overview`, {
      headers: { "X-Dev-User-Oid": "seam-b-old-path", "X-Dev-User-Roles": "Admin", "X-Dev-User-Org-Id": "1" },
    });
    assertEqual(res.status, 404, "old /api/admin/control-center/overview is no longer mounted (404)");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
