/**
 * ORG-BRIDGE FAIL-CLOSED regression gate (ISSUE-013 + PATTERN-001) — CI tripwire.
 *
 * RUNTIME-BEHAVIOR test, mirroring the ISSUE-044 gate's philosophy: it exercises
 * the real resolution chokepoint and real RLS-protected tables against the live
 * test database as the real non-super role (fieldpro, NOSUPERUSER NOBYPASSRLS)
 * and asserts OUTCOMES. It is NOT a static/AST/lint analyzer — nothing here
 * inspects source code shape.
 *
 * WHERE IT RUNS: pre-merge CI only — the `test-backend` job in
 * .github/workflows/ci.yml (`pnpm test` → tests/run.ts, which imports this
 * file). It is wired into NOTHING else: no deploy path, no healthcheck, no
 * runtime hook. Its only power is to turn a PR red.
 *
 * WHAT IT GUARDS:
 *  (a) ISSUE-013 — an indeterminate-org caller is REFUSED (typed throw → 403),
 *      never silently resolved to org 1. `resolveNumericOrgId` is the
 *      chokepoint every handler resolves through; an authenticated request
 *      with an unmatched tenant reaches exactly the code path exercised here.
 *      (The HTTP surface cannot even fabricate this state without a real Entra
 *      token — dev-bypass supplies org_id explicitly — which is why the gate
 *      grips the chokepoint itself.) The writeAuditLog twin (the second
 *      first-org fallback the 2026-06-27 audit flagged) is pinned too.
 *  (b) PATTERN-001 — a context-less connection reading a forced-RLS table gets
 *      0 rows (fail-closed), never data. If a future policy change or handler
 *      regression reintroduces fail-open, this goes red.
 *
 * Failure messages name the behavior that regressed, so a red run is always a
 * real regression, never a tool artifact.
 */

import type { PoolClient } from "pg";
import { pool, test, assert, assertEqual } from "../setup";
import { resolveNumericOrgId, OrgResolutionError } from "../../src/middleware/resolveOrgId";
import { writeAuditLog } from "../../src/middleware/auditLog";

const BOGUS_TID = "ffffffff-dead-beef-0000-000000000000"; // matches no organizations.tenant_uuid
const PROBE_OID = "org-failclosed-gate-probe";

async function withCtx<T>(ctx: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SELECT set_config('app.current_org_id', $1, false)`, [ctx]);
    return await fn(client);
  } finally {
    try {
      await client.query(`SELECT set_config('app.current_org_id', '', false)`);
    } catch { /* best-effort reset */ }
    client.release();
  }
}

// ── (a) ISSUE-013: the resolution chokepoint refuses indeterminate callers ──

test("org gate: unmatched tenant id is REFUSED (403), never resolved to a default org", async () => {
  let thrown: any = null;
  let resolved: number | undefined;
  try {
    resolved = await resolveNumericOrgId({ user: { tid: BOGUS_TID, oid: PROBE_OID } });
  } catch (err) {
    thrown = err;
  }
  assert(
    thrown !== null,
    `ISSUE-013 REGRESSION: resolveNumericOrgId resolved an indeterminate caller ` +
      `(tid ${BOGUS_TID}, matching no organization) to org ${resolved} instead of ` +
      `refusing — the fallback-to-org-1 behavior is back`,
  );
  assertEqual(thrown.name, "OrgResolutionError", "refusal must be the typed OrgResolutionError");
  assertEqual(thrown.status, 403, "refusal must carry status 403 (clean deny), not a silent scope");
});

test("org gate: caller with NO tenant signal at all is REFUSED", async () => {
  for (const req of [{}, { user: {} }]) {
    let threw = false;
    try {
      const r = await resolveNumericOrgId(req);
      assert(false, `ISSUE-013 REGRESSION: a caller with no org signal resolved to org ${r} instead of being refused`);
    } catch (err: any) {
      threw = err instanceof OrgResolutionError || err.name === "OrgResolutionError";
    }
    assert(threw, "refusal must be the typed OrgResolutionError (fail closed)");
  }
});

test("org gate: dev-bypass path (explicit req.user.org_id) still resolves — the fix targets the fallback, not dev context", async () => {
  assertEqual(await resolveNumericOrgId({ user: { org_id: 1 } }), 1, "dev bypass org 1 resolves");
  assertEqual(await resolveNumericOrgId({ user: { org_id: 2 } }), 2, "dev bypass org 2 resolves (no org-1 pinning)");
});

test("org gate: writeAuditLog refuses an unmatched tenant string — the first-org fallback twin stays dead", async () => {
  let threw = false;
  try {
    await writeAuditLog({ actor_oid: PROBE_OID, org_id: BOGUS_TID, action: "auth.login" });
  } catch {
    threw = true;
  }
  assert(
    threw,
    `ISSUE-013 REGRESSION (writeAuditLog twin): an audit row for an unmatched tenant ` +
      `('${BOGUS_TID}') was ACCEPTED — it would have been written into the lowest-id ` +
      `org's compliance audit trail`,
  );
  const check = await withCtx("1", (c) =>
    c.query(`SELECT count(*)::int AS n FROM audit_log WHERE actor_oid = $1`, [PROBE_OID]),
  );
  assertEqual(
    check.rows[0].n,
    0,
    "no audit row may land in org 1 for the refused write (cross-org audit contamination)",
  );
});

// ── (b) PATTERN-001: forced-RLS reads on a bare connection fail CLOSED ──────

test("RLS gate: core.locations read with NO org context returns 0 rows — fail-closed, proven against a real row", async () => {
  // Seed a probe row (with context, as the app would), so 0-rows-bare is a
  // proof of fail-closed and not an artifact of an empty table.
  // Explicit clock-derived id: the CI seed inserts fixture rows with literal
  // ids without advancing the sequence, so a DEFAULT-nextval insert collides.
  const probeId = String(Date.now());
  await withCtx("1", (c) =>
    c.query(
      `INSERT INTO core.locations (id, org_id, location_type, label, active)
       VALUES ($1, 1, 'transit_stop', 'org-failclosed-gate-probe', true)`,
      [probeId],
    ),
  );
  try {
    const bare = await pool.query(`SELECT count(*)::int AS n FROM core.locations`);
    assertEqual(
      bare.rows[0].n,
      0,
      `FAIL-OPEN REGRESSION (PATTERN-001): a context-less connection read ` +
        `${bare.rows[0].n} row(s) from forced-RLS core.locations — it must read 0`,
    );
    const scoped = await withCtx("1", (c) =>
      c.query(`SELECT count(*)::int AS n FROM core.locations WHERE id = $1`, [probeId]),
    );
    assertEqual(scoped.rows[0].n, 1, "the probe row must be visible WITH org context (RLS scopes, not blocks)");
  } finally {
    await withCtx("1", (c) => c.query(`DELETE FROM core.locations WHERE id = $1`, [probeId]));
  }
});

test("RLS gate: representative public org-scoped table (route_pools) also reads 0 rows bare", async () => {
  const bare = await pool.query(`SELECT count(*)::int AS n FROM route_pools`);
  assertEqual(
    bare.rows[0].n,
    0,
    `FAIL-OPEN REGRESSION (PATTERN-001): a context-less connection read ` +
      `${bare.rows[0].n} row(s) from forced-RLS public.route_pools — it must read 0`,
  );
});
