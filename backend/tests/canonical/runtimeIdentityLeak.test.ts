/**
 * ISSUE-044 — RUNTIME identity-leak regression gate (the audit keystone).
 *
 * The static guard (cleanLogsIdentity.test.ts) inspects SOURCE for the clean-logs
 * endpoints only. This suite is the runtime counterpart: it boots the real Express
 * app in-process, issues real HTTP requests against every operational read surface,
 * and asserts the RESPONSE BODY carries no worker identity. It turns BASELINE's
 * labor-safety guarantee ("worker identity does not exist in the intelligence /
 * operational layer") from a thing that is true because we were careful into a thing
 * the build FAILS on if it ever stops being true.
 *
 * It encodes a POLICY, not just a happy-path scan:
 *   - MUST_BE_CLEAN endpoints: identity-free for the authorized role, AND rejected
 *     (401/403) for anonymous callers.
 *   - SANCTIONED endpoints (identity legitimately behind a gate — the gated
 *     assignment detail view, the user picker, the Admin audit log, the Admin
 *     audited export chain): identity is PERMITTED for the authorized role, but the
 *     gate is PROVEN — anonymous and under-privileged callers are still rejected, so
 *     identity never resolves for them. An allow-list that wasn't shown to block the
 *     wrong caller is not a gate.
 *   - A COVERAGE meta-test walks the live router and fails the build if any GET
 *     surface is unclassified — so a NEW endpoint added in P2/P3/P4 cannot ship
 *     un-vetted. See "HOW TO ADD A NEW SURFACE" below.
 *   - A SCHEMA test asserts the effort/condition history tables carry no identity
 *     column, so the structural guarantee can't be reintroduced one layer down.
 *
 * ── HOW TO ADD A NEW SURFACE ────────────────────────────────────────────────────
 * When you add a GET endpoint that returns data, add ONE entry:
 *   - to ENDPOINTS with kind 'clean' (identity must never appear) or 'sanctioned'
 *     (identity allowed behind a gate — also give `underPriv` so the gate is proven),
 *   - or, only for non-data routes (health probes, scope literals, the caller's own
 *     /me identity), to EXEMPT with a one-line reason.
 * The coverage test will fail until the new route is in exactly one of those lists.
 * ────────────────────────────────────────────────────────────────────────────────
 */

import type { Server } from "http";
import type { AddressInfo } from "net";
import { test, assert, assertEqual, pool, FIXTURE_STOP_ID, FIXTURE_ASSET_ID } from "../setup";

// The dev-auth bypass must be active so the suite can present authenticated callers
// without a real Entra token. It mounts only when NODE_ENV !== 'production' AND
// DEV_AUTH_BYPASS === 'true' (devAuthBypass.ts). Set the opt-in BEFORE app is
// require()'d below — app.ts decides the mount at module-load time.
process.env.DEV_AUTH_BYPASS = "true";

const ORG = "1"; // single-tenant dev/test org (matches tests/setup FIXTURE_ORG_ID)

// ── Identity detector ────────────────────────────────────────────────────────────
// An OID key — `oid` itself, or any *_oid (assigned_user_oid, created_by_oid,
// captured_by_oid, actor_oid, …). The Azure Entra OID is the canonical worker
// identifier and is unambiguous: any populated OID anywhere is a leak.
const isOidKey = (k: string) => k.toLowerCase() === "oid" || /_oid$/i.test(k);
// Always-hard keys that don't collide with anything benign.
const ALWAYS_HARD = new Set(["employee_id", "worker_name"]);
// Person-adjacent keys — a worker's NAME and ROLE. These are flagged only inside a
// "person object". Flagging `display_name` / `name` / `role` globally would
// false-positive on benign labels — asset-type and observation-type config rows carry
// a `display_name` LABEL, pools/stops carry names, and endpoints echo a role SCOPE.
// A person object is identified by an OID sibling OR by a known person-object parent
// key. Historically OID co-occurrence was the sole discriminator, but SEAM-C item 4
// deliberately trimmed the raw OID from the route-detail R11 exposure while KEEPING the
// worker's display_name/role — so `assigned_user`/`created_by` are now name-only person
// objects. PERSON_OBJECT_PARENTS keeps those flagged (the gate must still see the name
// as identity) without re-flagging labels elsewhere.
const PERSON_ADJACENT = new Set(["display_name", "name", "role"]);
const PERSON_OBJECT_PARENTS = new Set(["assigned_user", "created_by"]);
// `user_id` is the legacy integer column on route_runs (LEGACY_TRANSIT_USER_ID = 0,
// no FK, no canonical worker reference). Value-aware: a leak only if it ever carries
// a non-sentinel value. Catches reintroduction of integer worker identity without
// red-flagging the known dead sentinel. (Dropping user_id from the route-run list
// responses is tracked as its own card; this gate pins it to the sentinel.)
const LEGACY_SENTINELS = new Set([0, "0", null, undefined, ""]);

type Hit = { path: string; key: string; value: unknown };
const populated = (v: unknown) => v !== null && v !== undefined && v !== "";

function scanIdentity(body: unknown): Hit[] {
  const hits: Hit[] = [];
  const visit = (node: unknown, path: string) => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => visit(v, `${path}[${i}]`));
      return;
    }
    if (typeof node === "object") {
      const keys = Object.keys(node as Record<string, unknown>);
      // Is this a person object? OID sibling, or a known person-object parent key
      // (SEAM-C item 4 decoupled the route-detail name from its OID).
      const lastSeg = path.split(/[.[\]]/).filter(Boolean).pop() ?? "";
      const isPersonObject = keys.some(isOidKey) || PERSON_OBJECT_PARENTS.has(lastSeg);
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const here = path ? `${path}.${key}` : key;
        const lk = key.toLowerCase();
        if (lk === "user_id") {
          if (!LEGACY_SENTINELS.has(value as any)) hits.push({ path: here, key, value });
        } else if (isOidKey(key) || ALWAYS_HARD.has(lk)) {
          if (populated(value)) hits.push({ path: here, key, value });
        } else if (isPersonObject && PERSON_ADJACENT.has(lk)) {
          if (populated(value)) hits.push({ path: here, key, value });
        }
        visit(value, here);
      }
    }
  };
  visit(body, "");
  return hits;
}

// ── HTTP harness (in-process app, zero new deps) ────────────────────────────────
let server: Server;
let baseUrl: string;
let appRef: any;

type Role = "Specialist" | "Dispatch" | "Admin";

async function req(
  method: string,
  path: string,
  role?: Role,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (role) {
    headers["X-Dev-User-Oid"] = `runtime-leak-suite-${role}`;
    headers["X-Dev-User-Roles"] = role;
    headers["X-Dev-User-Org-Id"] = ORG;
  }
  const res = await fetch(`${baseUrl}${path}`, { method, headers });
  let body: any = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text; // non-JSON (e.g. a served file) — still scannable as a string
  }
  return { status: res.status, body };
}

const isBlocked = (status: number) => status === 401 || status === 403;

// ── Fixture: a route_run with REAL assigned/creator identity so the sanctioned
//    detail view actually returns identity (positive proof the gate guards
//    something), and so the list endpoints are exercised with a row present. ──────
const ASSIGNEE_OID = "runtime-leak-assignee-oid";
const CREATOR_OID = "runtime-leak-creator-oid";
const FIX_POOL = "TEST_POOL";
let fixtureRunId: number;

async function seedFixture(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    for (const [oid, name, r] of [
      [ASSIGNEE_OID, "Leak Assignee", "Specialist"],
      [CREATOR_OID, "Leak Creator", "Dispatch"],
    ] as const) {
      await client.query(
        `INSERT INTO identity_directory (oid, display_name, last_seen_role, org_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (oid) DO UPDATE SET display_name = EXCLUDED.display_name`,
        [oid, name, r, ORG],
      );
    }
    const runRes = await client.query(
      `INSERT INTO route_runs (route_pool_id, run_date, status, assigned_user_oid, created_by_oid)
       VALUES ($1, CURRENT_DATE, 'planned', $2, $3)
       RETURNING id`,
      [FIX_POOL, ASSIGNEE_OID, CREATOR_OID],
    );
    fixtureRunId = Number(runRes.rows[0].id);
    // loadRouteRunById INNER-joins route_run_stops, so the run needs ≥1 stop to
    // resolve (else 404). Mirrors tests/setup createRouteRunFixture.
    await client.query(
      `INSERT INTO route_run_stops (route_run_id, stop_id, asset_id, sequence, org_id)
       VALUES ($1, $2, $3, 0, (SELECT org_id FROM route_runs WHERE id = $1))`,
      [fixtureRunId, FIXTURE_STOP_ID, FIXTURE_ASSET_ID],
    );
  } finally {
    await client.query(`SELECT set_config('app.current_org_id', '', false)`).catch(() => {});
    client.release();
  }
}

async function cleanupFixture(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ORG]);
    if (fixtureRunId) {
      await client.query(`DELETE FROM route_runs WHERE id = $1`, [fixtureRunId]);
    }
    await client.query(`DELETE FROM identity_directory WHERE oid = ANY($1)`, [
      [ASSIGNEE_OID, CREATOR_OID],
    ]);
  } finally {
    await client.query(`SELECT set_config('app.current_org_id', '', false)`).catch(() => {});
    client.release();
  }
}

// ── The endpoint registry (the policy) ───────────────────────────────────────────
// `route` is the leaf route pattern as registered (used by the coverage meta-test).
// `probe` is the concrete path to request. kind 'clean' → identity-free for the
// authorized role. kind 'sanctioned' → identity allowed for the authorized role,
// gate proven by `underPriv` (and anon) being blocked.
type Endpoint = {
  method: string;
  route: string;
  probe: string;
  kind: "clean" | "sanctioned";
  authorized: Role;
  underPriv?: Role;
  expectIdentity?: boolean; // assert identity IS present for the authorized role
  skipAuthorized?: boolean; // destructive/file-serving — prove the gate only
};

function buildEndpoints(): Endpoint[] {
  return [
    // ── Control Center (Dispatch+Admin) — operational dashboards, must be
    // identity-free. SEAM-B relocated these Admin-only surfaces to /ops and widened
    // the guard to Dispatch+Admin. The audience-widening re-scan runs the clean probe
    // as the NEW lower-privilege audience (Dispatch) and proves the Specialist floor
    // (underPriv) is still blocked — a widened surface must not leak to the widened
    // audience, and the floor beneath it must stay shut. ──
    { method: "GET", route: "/overview", probe: "/ops/control-center/overview", kind: "clean", authorized: "Dispatch", underPriv: "Specialist" },
    { method: "GET", route: "/routes", probe: "/ops/control-center/routes", kind: "clean", authorized: "Dispatch", underPriv: "Specialist" },
    { method: "GET", route: "/exceptions", probe: "/ops/control-center/exceptions", kind: "clean", authorized: "Dispatch", underPriv: "Specialist" },
    { method: "GET", route: "/difficulty", probe: "/ops/control-center/difficulty", kind: "clean", authorized: "Dispatch", underPriv: "Specialist" },
    // ── Admin dashboards / lists ──
    { method: "GET", route: "/admin/dashboard", probe: "/admin/dashboard", kind: "clean", authorized: "Admin" },
    { method: "GET", route: "/admin/pools", probe: "/admin/pools", kind: "clean", authorized: "Admin" },
    { method: "GET", route: "/admin/stops", probe: "/admin/stops", kind: "clean", authorized: "Admin" },
    { method: "GET", route: "/admin/route-runs", probe: "/admin/route-runs", kind: "clean", authorized: "Admin" },
    { method: "GET", route: "/admin/clean-logs", probe: "/admin/clean-logs", kind: "clean", authorized: "Admin" },
    // ── Ops mirror (Dispatch/Admin) ──
    { method: "GET", route: "/ops/dashboard", probe: "/ops/dashboard", kind: "clean", authorized: "Dispatch" },
    { method: "GET", route: "/ops/pools", probe: "/ops/pools", kind: "clean", authorized: "Dispatch" },
    { method: "GET", route: "/ops/stops", probe: "/ops/stops", kind: "clean", authorized: "Dispatch" },
    { method: "GET", route: "/ops/route-runs", probe: "/ops/route-runs", kind: "clean", authorized: "Dispatch" },
    { method: "GET", route: "/ops/clean-logs", probe: "/ops/clean-logs", kind: "clean", authorized: "Dispatch" },
    // ── Lead dispatch list ──
    { method: "GET", route: "/lead/todays-runs", probe: "/lead/todays-runs", kind: "clean", authorized: "Dispatch" },
    // ── Resource + config reads ──
    { method: "GET", route: "/pools", probe: "/pools", kind: "clean", authorized: "Dispatch" },
    // tenant config uses its own org convention (?org_id= / X-Org-Id), not the
    // dev-bypass org header — supply org_id so the authorized probe reaches 200.
    { method: "GET", route: "/asset-types", probe: "/admin/tenant/asset-types?org_id=1", kind: "clean", authorized: "Admin" },
    // asset_type_id=1 (transit_stop) is seeded by tests/fixtures/seed.sql.
    { method: "GET", route: "/observation-types", probe: "/admin/tenant/observation-types?org_id=1&asset_type_id=1", kind: "clean", authorized: "Admin" },
    { method: "GET", route: "/by-pool/:pool_id", probe: `/route-overrides/by-pool/${FIX_POOL}`, kind: "clean", authorized: "Dispatch" },
    // ── Stop history (SEAM-D D5a) — per-STOP intelligence chronology. History
    // attaches to the asset; worker identity must never appear. New
    // Dispatch-reachable read surface → probe as Dispatch AND prove the
    // Specialist floor stays shut (audience-widening rider). ──
    { method: "GET", route: "/stops/:stop_id/history", probe: `/stops/${FIXTURE_STOP_ID}/history`, kind: "clean", authorized: "Dispatch", underPriv: "Specialist" },

    // ── SANCTIONED: identity legitimately behind a gate; prove the gate blocks ──
    // The gated assignment detail view — the surviving twin from ISSUE-043.
    { method: "GET", route: "/lead/route-runs/:id", probe: "__FIXTURE__", kind: "sanctioned", authorized: "Dispatch", underPriv: "Specialist", expectIdentity: true },
    // The user picker (Dispatch/Admin assign routes from this list).
    { method: "GET", route: "/users", probe: "/users", kind: "sanctioned", authorized: "Dispatch", underPriv: "Specialist" },
    // The Admin audit log — identity (actor_oid) is the whole point of an audit trail.
    { method: "GET", route: "/admin/audit-log", probe: "/admin/audit-log", kind: "sanctioned", authorized: "Admin", underPriv: "Dispatch" },
    // Worker's OWN route (self-view, scoped to assigned_user_oid = caller). Self
    // identity is not surveillance; the gate just keeps it authenticated.
    { method: "GET", route: "/ul/todays-run", probe: "/ul/todays-run", kind: "sanctioned", authorized: "Specialist", skipAuthorized: true },
    // The Admin audited export chain. Identity (encrypted OID) lives in the bundle.
    // skipAuthorized: the request stages a bundle and the file download serves it —
    // we prove the GATE (anon/under-priv blocked), not the destructive happy path.
    { method: "GET", route: "/admin/export-and-delete/export/:token_id", probe: "/admin/export-and-delete/export/nonexistent-token", kind: "sanctioned", authorized: "Admin", underPriv: "Dispatch", skipAuthorized: true },
  ];
}

// ── Coverage: GET routes that are intentionally NOT identity-probed, with reason ──
const EXEMPT: { route: string; reason: string }[] = [
  { route: "/health", reason: "public liveness probe; returns no data" },
  { route: "/me", reason: "returns the CALLER's own identity by design (self, not a worker surface)" },
  { route: "/secure/ping", reason: "auth smoke; returns {ok}" },
  { route: "/admin/secret", reason: "auth/role smoke; returns {ok}" },
  { route: "/admin/ops", reason: "auth/role smoke; returns {ok}" },
  { route: "/lead/hub", reason: "returns the role-scope literal {ok, scope}; no data" },
  { route: "/ul/inbox", reason: "returns the role-scope literal; no data" },
  { route: "/route-runs/:runId/stops/:stopId/photos", reason: "S3 photo object-key metadata only; no worker identity" },
  { route: "/openapi.json", reason: "static API spec; no runtime data" },
];

// ════════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ════════════════════════════════════════════════════════════════════════════════
test("runtime identity-leak: bootstrap — boot app (dev-bypass) + seed identity fixture", async () => {
  assert(
    process.env.NODE_ENV !== "production",
    "this suite must run with NODE_ENV !== production (the dev-auth bypass refuses to mount in prod)",
  );
  // Require app AFTER DEV_AUTH_BYPASS is set so the bypass middleware is mounted.
  appRef = require("../../src/app").app;
  await new Promise<void>((resolve) => {
    server = appRef.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  await seedFixture();
  assert(!!fixtureRunId, "fixture route_run was not created");

  // sanity: the app is actually answering
  const health = await req("GET", "/health");
  assertEqual(health.status, 200, "app /health did not return 200");
});

// ════════════════════════════════════════════════════════════════════════════════
// MUST_BE_CLEAN — authorized role gets an identity-free body; anon is rejected
// ════════════════════════════════════════════════════════════════════════════════
for (const ep of buildEndpoints().filter((e) => e.kind === "clean")) {
  test(`runtime identity-leak: ${ep.method} ${ep.probe} is identity-free for ${ep.authorized}, anon rejected`, async () => {
    // anon must be rejected (every operational read is gated post-ISSUE-043)
    const anon = await req(ep.method, ep.probe);
    assert(
      isBlocked(anon.status),
      `${ep.probe}: anonymous call returned ${anon.status}, expected 401/403 (operational reads must be gated)`,
    );

    // authorized role: body must carry no worker identity
    const authed = await req(ep.method, ep.probe, ep.authorized);
    assertEqual(
      authed.status,
      200,
      `${ep.probe}: ${ep.authorized} call returned ${authed.status}, expected 200`,
    );
    const hits = scanIdentity(authed.body);
    assert(
      hits.length === 0,
      `${ep.probe}: identity leaked to ${ep.authorized}: ${JSON.stringify(hits)}`,
    );

    // Audience floor: when a clean surface declares an under-privileged role
    // (SEAM-B widened the CC guard to Dispatch+Admin — the floor beneath is
    // Specialist), prove that floor is shut. A widened operational read must still
    // fail-closed for a role below its guard, and must never carry identity there.
    if (ep.underPriv) {
      const under = await req(ep.method, ep.probe, ep.underPriv);
      assert(
        isBlocked(under.status),
        `${ep.probe}: under-privileged ${ep.underPriv} returned ${under.status}, expected 401/403 — the widened guard's floor is not enforced`,
      );
      assertEqual(
        scanIdentity(under.body).length,
        0,
        `${ep.probe}: under-privileged ${ep.underPriv} response carried identity`,
      );
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// SANCTIONED — identity allowed for the authorized role; the gate is PROVEN by
// anon + under-privileged callers being rejected (both directions).
// ════════════════════════════════════════════════════════════════════════════════
for (const ep of buildEndpoints().filter((e) => e.kind === "sanctioned")) {
  test(`runtime identity-leak: ${ep.method} ${ep.route} — gate blocks anon/under-priv, allows ${ep.authorized}`, async () => {
    const probe = ep.probe === "__FIXTURE__" ? `/lead/route-runs/${fixtureRunId}` : ep.probe;

    // Direction 1 — gate: anonymous is rejected, never receives identity.
    const anon = await req(ep.method, probe);
    assert(
      isBlocked(anon.status),
      `${probe}: anonymous call returned ${anon.status}, expected 401/403`,
    );
    assertEqual(
      scanIdentity(anon.body).length,
      0,
      `${probe}: anonymous response carried identity despite being gated`,
    );

    // Direction 1b — gate: an under-privileged role is rejected too.
    if (ep.underPriv) {
      const under = await req(ep.method, probe, ep.underPriv);
      assert(
        isBlocked(under.status),
        `${probe}: under-privileged ${ep.underPriv} returned ${under.status}, expected 401/403 — the allow-list gate is not actually enforced`,
      );
      assertEqual(
        scanIdentity(under.body).length,
        0,
        `${probe}: under-privileged ${ep.underPriv} response carried identity`,
      );
    }

    // Direction 2 — the authorized role reaches the surface (identity permitted).
    if (!ep.skipAuthorized) {
      const authed = await req(ep.method, probe, ep.authorized);
      assert(
        !isBlocked(authed.status),
        `${probe}: authorized ${ep.authorized} was blocked (${authed.status}) — the sanctioned path is unreachable`,
      );
      if (ep.expectIdentity) {
        const hits = scanIdentity(authed.body);
        assert(
          hits.length > 0,
          `${probe}: authorized ${ep.authorized} got NO identity — the gate is supposed to guard a real identity-bearing surface, so this proof is vacuous. Check the fixture.`,
        );
      }
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// SCHEMA — the effort/condition history tables carry no identity column (the
// structural guarantee, enforced one layer below the API). Extends the
// cleanLogsIdentity static pattern to the intelligence history tables.
// ════════════════════════════════════════════════════════════════════════════════
test("runtime identity-leak: effort/condition history tables carry no identity column", async () => {
  const IDENTITY_COLS = [
    "user_id",
    "oid",
    "worker_id",
    "employee_id",
    "assigned_user_oid",
    "created_by_oid",
    "captured_by_oid",
    "display_name",
  ];
  // Every *_effort_history / *_condition_history table (catches new ones too).
  const tablesRes = await pool.query(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_name ~ '(effort|condition)_history'`,
  );
  assert(
    tablesRes.rows.length >= 2,
    `expected stop_effort_history + stop_condition_history; found ${tablesRes.rows.length}`,
  );
  for (const { table_schema, table_name } of tablesRes.rows) {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2`,
      [table_schema, table_name],
    );
    const names = cols.rows.map((r: any) => String(r.column_name).toLowerCase());
    for (const bad of IDENTITY_COLS) {
      assert(
        !names.includes(bad),
        `${table_schema}.${table_name} has identity column "${bad}" — the intelligence layer must be worker-non-attributable by structure`,
      );
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// COVERAGE — every GET route on the live app is classified (probed or exempt).
// This is what makes the gate catch FUTURE surfaces, not just today's.
// ════════════════════════════════════════════════════════════════════════════════
test("runtime identity-leak: every GET route is classified (no un-vetted surface)", async () => {
  // Walk the live Express router tree and collect every leaf GET route pattern.
  const found = new Set<string>();
  const walk = (layers: any[]) => {
    for (const layer of layers || []) {
      if (layer.route && layer.route.path) {
        const methods = layer.route.methods || {};
        if (methods.get) found.add(String(layer.route.path));
      } else if (layer.handle && layer.handle.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  const router = appRef._router || appRef.router;
  assert(router && router.stack, "could not access the Express router stack");
  walk(router.stack);

  const classified = new Set<string>([
    ...buildEndpoints().filter((e) => e.method === "GET").map((e) => e.route),
    ...EXEMPT.map((e) => e.route),
  ]);

  const unclassified = [...found].filter((p) => !classified.has(p));
  assert(
    unclassified.length === 0,
    `Unclassified GET route(s): ${JSON.stringify(unclassified)}. ` +
      `Add each to ENDPOINTS (kind 'clean' or 'sanctioned') or EXEMPT (with a reason) ` +
      `in runtimeIdentityLeak.test.ts — see "HOW TO ADD A NEW SURFACE".`,
  );

  // Guard the guard: every classified route we expect must still exist on the app,
  // so a renamed/removed route can't silently leave a dead registry entry behind.
  const probedRoutes = buildEndpoints()
    .filter((e) => e.method === "GET")
    .map((e) => e.route);
  const missing = probedRoutes.filter((p) => !found.has(p));
  assert(
    missing.length === 0,
    `Registry references GET route(s) that no longer exist on the app: ${JSON.stringify(missing)}. Update the registry.`,
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// TEARDOWN
// ════════════════════════════════════════════════════════════════════════════════
test("runtime identity-leak: teardown — clean fixture + close server", async () => {
  await cleanupFixture();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
