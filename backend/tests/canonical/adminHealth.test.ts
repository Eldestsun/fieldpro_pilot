import type { AddressInfo } from "net";
import type { Server } from "http";
// Dev-bypass must be opted-in before app.ts is required.
process.env.DEV_AUTH_BYPASS = "true";

import { test, assert, assertEqual } from "../setup";

// ============================================================================
// T2-A7 — GET /api/admin/health (governance health view).
//
// Contract enforced here:
//  - Admin gets the documented shape (counts + integration recency).
//  - LABOR SAFETY: the response body carries NO per-user identifier — no
//    oid, no display_name, no email, and no dev-persona OID leaks. Counts
//    only (spec Labor Safety Constraint; grep assertion per Tests Required).
//  - Non-admin roles are refused (403); anonymous is refused (401).
// ============================================================================

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const appRef = require("../../src/app").app;
  const server: Server = await new Promise((resolve) => {
    const s = appRef.listen(0, "127.0.0.1", () => resolve(s));
  });
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function getHealth(baseUrl: string, persona?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (persona) headers["X-Dev-Persona"] = persona;
  return fetch(`${baseUrl}/api/admin/health`, { headers });
}

test("T2-A7: /admin/health returns the documented count shape for Admin", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const res = await getHealth(baseUrl, "admin");
    assertEqual(res.status, 200, "admin persona must get 200");
    const body: any = await res.json();

    for (const key of [
      "as_of", "users", "stops", "pools", "route_runs_yesterday",
      "visits_yesterday", "eam_bridge", "audit_log", "recent_issues",
    ]) {
      assert(key in body, `response must carry '${key}'`);
    }
    assert(typeof body.users.active_last_30d === "number", "active_last_30d is a count");
    assert(typeof body.users.by_role === "object", "by_role is a role→count map");
    for (const v of Object.values(body.users.by_role)) {
      assert(typeof v === "number", "by_role values are counts, never lists");
    }
    assert(typeof body.stops.active === "number" && typeof body.stops.retired === "number",
      "stops carries active/retired counts");
    assert(typeof body.recent_issues.not_ok_presence_7d === "number",
      "recent_issues is the canonical presence count");
  } finally {
    server.close();
  }
});

test("T2-A7: labor safety — health body carries no per-user identifiers", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const res = await getHealth(baseUrl, "admin");
    const raw = await res.text();
    for (const needle of ["oid", "display_name", "email", "dev-persona"]) {
      assert(
        !raw.toLowerCase().includes(needle),
        `health response must not contain '${needle}' (counts only)`,
      );
    }
  } finally {
    server.close();
  }
});

test("T2-A7: non-admin refused (403), anonymous refused (401)", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const dispatchRes = await getHealth(baseUrl, "dispatch");
    assertEqual(dispatchRes.status, 403, "Dispatch persona must be refused");
    const anonRes = await getHealth(baseUrl);
    assertEqual(anonRes.status, 401, "anonymous must be refused");
  } finally {
    server.close();
  }
});
