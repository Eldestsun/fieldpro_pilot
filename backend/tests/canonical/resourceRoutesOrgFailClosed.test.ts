import * as fs from "fs";
import * as path from "path";
import { test, assert } from "../setup";

/**
 * ISSUE-059 — static source guard for the GET /api/users org-resolution path.
 *
 * WHY STATIC (not runtime): the fail-open branch is unreachable through the test
 * HTTP harness. Dev-bypass requires all three X-Dev-User-* headers, so it always
 * supplies org_id and short-circuits resolution; a synthetic bad-tid real-Entra
 * token can't pass requireAuth/JWKS in tests. So the only faithful red-demo — one
 * that turns RED if the fallback is reintroduced INTO resourceRoutes — is a source
 * assertion. This mirrors the cleanLogsIdentity.test.ts static-guard precedent, and
 * keeps orgFailClosed.test.ts runtime-only per its stated contract. The runtime
 * fail-closed guarantee is already covered there (resolveNumericOrgId refuses an
 * indeterminate caller with OrgResolutionError/403); this guard only ensures the
 * /users handler DELEGATES to that helper instead of hand-rolling org resolution.
 *
 * RED-DEMO: reintroduce the `UNION ALL ... ORDER BY id LIMIT 1 + ?? 1` fallback (in
 * code, not a comment) or drop the resolveNumericOrgId call → this test goes red.
 */

const RESOURCE_ROUTES = path.resolve(
  __dirname,
  "../../src/modules/admin/resourceRoutes.ts",
);
const USERS_MARKER = '"/users"';

/** Strip line + block comments so the guard inspects code, not the prose that
 *  legitimately explains what was removed. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Slice the /users handler body (marker → next route registration), code only. */
function usersHandlerBody(): string {
  const src = fs.readFileSync(RESOURCE_ROUTES, "utf8");
  const start = src.indexOf(USERS_MARKER);
  assert(start !== -1, `resourceRoutes.ts: "/users" route handler not found`);
  const rest = src.slice(start + USERS_MARKER.length);
  const nextRoute = rest.search(/resourceRoutes\.(get|post|put|delete|patch)\(/);
  return stripComments(rest.slice(0, nextRoute === -1 ? undefined : nextRoute));
}

test("ISSUE-059: GET /api/users delegates org resolution to resolveNumericOrgId (no inline fallback)", async () => {
  const body = usersHandlerBody();

  // 1. The fail-open fallback must be gone: no lowest-id-org selection.
  assert(
    !/UNION\s+ALL/i.test(body),
    "resourceRoutes /users: reintroduced a UNION ALL org lookup (fail-open ISSUE-059/013 pattern)",
  );
  assert(
    !/ORDER\s+BY\s+id\s+LIMIT\s+1/i.test(body),
    "resourceRoutes /users: reintroduced `ORDER BY id LIMIT 1` — the lowest-org fail-open fallback",
  );

  // 2. No default-to-org-1 coalesce on the resolution path.
  assert(
    !/\?\?\s*1\b/.test(body),
    "resourceRoutes /users: reintroduced a `?? 1` default-org fallback",
  );

  // 3. No hand-rolled tenant_uuid lookup in the handler — resolution is delegated.
  assert(
    !/tenant_uuid/i.test(body),
    "resourceRoutes /users: hand-rolls a tenant_uuid lookup instead of delegating to resolveNumericOrgId",
  );

  // 4. It DOES delegate to the fail-closed shared helper.
  assert(
    /resolveNumericOrgId\s*\(\s*req\s*\)/.test(body),
    "resourceRoutes /users: must resolve org via resolveNumericOrgId(req) (fail-closed helper)",
  );
});
